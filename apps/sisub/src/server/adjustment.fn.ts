/**
 * @module adjustment.fn
 * Ajuste de estoque como DOCUMENTO: motivo tipado, quarentena imediata, alçada
 * e segregação verificadas no banco, e movimento só no lançamento.
 *
 * Por que documento e não movimento direto: "estragou", "venceu" e "furtado"
 * têm consequências administrativas diferentes — a última abre apuração de
 * responsabilidade (IN SEDAP 205/88, item 10) — e o texto livre que existia
 * antes não separava os três nem virava relatório.
 *
 * CLIENT: getServerClient (service role, schemas inventory/kitchen/access_control).
 * AUTH: `storage` nível 2 registra e lança dentro da alçada; nível 3 aprova.
 * TABLES: inventory.stock_adjustment(_item), stock_lot, kitchen_stock_settings.
 * @domain kitchen
 * @migration 20260917160000_inventory_operable_core
 */

import { INFLOW_REASONS, OUTFLOW_REASONS, STOCK_ADJUSTMENT_REASONS } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const inventory = () => getServerClient("inventory") as unknown as LooseClient
const kitchen = () => getServerClient("kitchen") as unknown as LooseClient
const accessControl = () => getServerClient("access_control") as unknown as LooseClient
const core = () => getServerClient("core") as unknown as LooseClient

/**
 * Bloqueio da Fase 2a: ingrediente com unidade fora do catálogo canônico não
 * movimenta estoque — o erro aponta a fila de revisão.
 *
 * NÃO exportada de propósito: só os handlers deste arquivo a chamam, e é o
 * `export` que a mantém viva no pacote do CLIENTE. Os corpos de `createServerFn`
 * são removidos do bundle do browser, mas uma função exportada ao lado deles não
 * é — e, como esta fala com o banco por `getServerClient`, o build morre em
 * `[import-protection] Import denied in client environment`. Se um dia outro
 * módulo do servidor precisar dela, mova para um `*.server.ts` em vez de exportar
 * daqui.
 */
async function assertCanonicalUnit(ingredientId: string | null) {
	if (!ingredientId) return
	const { data: ing } = await kitchen().from("ingredient").select("description, measure_unit").eq("id", ingredientId).single()
	if (!ing?.measure_unit)
		throw new Error(
			`Insumo "${ing?.description ?? ingredientId}" sem unidade de medida — corrija na fila de revisão (/global/review-queues) antes de movimentar estoque`
		)
	const { data: unit } = await core().from("measure_unit").select("code").eq("code", ing.measure_unit).maybeSingle()
	if (!unit) {
		throw new Error(
			`Insumo "${ing.description}" tem unidade "${ing.measure_unit}" fora do catálogo canônico — resolva na fila de revisão (/global/review-queues) antes de movimentar estoque`
		)
	}
}

const ReasonSchema = z.enum(STOCK_ADJUSTMENT_REASONS)

const ItemSchema = z
	.object({
		lotId: z.uuid().optional(),
		ingredientId: z.uuid().optional(),
		frozenPreparationId: z.uuid().optional(),
		direction: z.enum(["in", "out"]),
		quantity: z.number().positive(),
		unitCost: z.number().nonnegative().optional(),
		reasonCode: ReasonSchema,
		note: z.string().max(500).optional(),
		evidenceKind: z.enum(["photo", "term", "report", "process", "nfe_key", "temperature", "other"]).optional(),
		evidenceReference: z.string().max(200).optional(),
		measuredTemperatureC: z.number().optional(),
		correctedMovementId: z.uuid().optional(),
	})
	.refine((item) => item.lotId != null || item.ingredientId != null || item.frozenPreparationId != null, {
		message: "Informe o lote ou o item do ajuste",
	})
	.refine((item) => (item.direction === "in" ? (INFLOW_REASONS as readonly string[]) : (OUTFLOW_REASONS as readonly string[])).includes(item.reasonCode), {
		message: "Motivo incompatível com a direção do ajuste",
	})

/**
 * Evidência exigida por motivo. O banco não checa isto porque a exigência é de
 * processo, não de integridade: o ajuste ABAIXO da alçada pode ser lançado com
 * evidência pendente (recusar R$ 40 de pão vencido por falta de foto num
 * desktop sem câmera é o que faz o operador não lançar nada), e o documento
 * fica listado como pendente até completar.
 */
const EVIDENCE_REQUIRED: Partial<Record<(typeof STOCK_ADJUSTMENT_REASONS)[number], string>> = {
	spoiled: "foto ou termo do descarte",
	damaged: "foto ou termo da avaria",
	cold_chain_failure: "temperatura medida",
	sanitary_recall: "referência do ato ou aviso de recolhimento",
	lost: "número da parte/comunicação",
	theft: "número da parte/comunicação (o processo de apuração pode vir depois)",
	supplier_return: "chave da NF-e de devolução",
	donation: "termo de doação e autorização do ordenador",
	entry_error_in: "movimento corrigido",
	entry_error_out: "movimento corrigido",
}

type AdjustmentItemInput = z.infer<typeof ItemSchema>

function evidencePending(items: readonly AdjustmentItemInput[]): boolean {
	return items.some((item) => {
		const required = EVIDENCE_REQUIRED[item.reasonCode]
		if (!required) return false
		if (item.reasonCode === "cold_chain_failure") return item.measuredTemperatureC == null
		if (item.reasonCode === "entry_error_in" || item.reasonCode === "entry_error_out") return item.correctedMovementId == null
		return !item.evidenceReference?.trim()
	})
}

/** Existe outro nível 3 de `storage` nesta cozinha, além do ator? */
async function hasOtherApprover(kitchenId: number, actorId: string): Promise<boolean> {
	const { data } = await accessControl()
		.from("user_permissions")
		.select("user_id, level, kitchen_id, unit_id, mess_hall_id, expires_at")
		.eq("module", "storage")
		.gte("level", 3)
	const now = Date.now()
	return (data ?? []).some(
		(row: { user_id: string; kitchen_id: number | null; unit_id: number | null; mess_hall_id: number | null; expires_at: string | null }) => {
			if (row.user_id === actorId) return false
			if (row.expires_at != null && new Date(row.expires_at).getTime() <= now) return false
			// permissão global ou escopada NESTA cozinha
			const globalGrant = row.kitchen_id == null && row.unit_id == null && row.mess_hall_id == null
			return globalGrant || Number(row.kitchen_id) === kitchenId
		}
	)
}

export const fetchStockSettingsFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const { data: row } = await inventory().from("kitchen_stock_settings").select("*").eq("kitchen_id", data.kitchenId).maybeSingle()
		return {
			segregation: (row?.segregation ?? "dual") as "strict" | "dual",
			adjustmentApprovalValue: Number(row?.adjustment_approval_value ?? 500),
			issueTolerancePct: Number(row?.issue_tolerance_pct ?? 10),
			issueToleranceFloorValue: Number(row?.issue_tolerance_floor_value ?? 20),
			countTolerancePct: Number(row?.count_tolerance_pct ?? 5),
			countToleranceValue: Number(row?.count_tolerance_value ?? 50),
		}
	})

export const saveStockSettingsFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			segregation: z.enum(["strict", "dual"]),
			adjustmentApprovalValue: z.number().nonnegative(),
			issueTolerancePct: z.number().min(0).max(100),
			issueToleranceFloorValue: z.number().nonnegative(),
			countTolerancePct: z.number().min(0).max(100),
			countToleranceValue: z.number().nonnegative(),
		})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireStorageForKitchen(3, data.kitchenId)
		const { error } = await inventory().from("kitchen_stock_settings").upsert(
			{
				kitchen_id: data.kitchenId,
				segregation: data.segregation,
				adjustment_approval_value: data.adjustmentApprovalValue,
				issue_tolerance_pct: data.issueTolerancePct,
				issue_tolerance_floor_value: data.issueToleranceFloorValue,
				count_tolerance_pct: data.countTolerancePct,
				count_tolerance_value: data.countToleranceValue,
				updated_by: userId,
				updated_at: new Date().toISOString(),
			},
			{ onConflict: "kitchen_id" }
		)
		if (error) throw new Error(`Erro ao salvar as configurações: ${error.message}`)
		return { saved: true }
	})

/**
 * Cria o documento e tenta lançar. Dentro da alçada e sem motivo que sempre
 * exige aprovação, o próprio autor lança (nível 2). Fora dela, o documento fica
 * `pending_approval` — e o lote pode ir para quarentena imediatamente, sem
 * esperar aprovação.
 */
export const createAdjustmentFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			notes: z.string().max(1000).optional(),
			items: z.array(ItemSchema).min(1),
		})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireStorageForKitchen(2, data.kitchenId)
		const inv = inventory()

		// lote informado tem de ser da cozinha do ajuste — o guard é por cozinha,
		// e sem esta checagem o nível 2 de uma cozinha ajustaria lote de outra
		const lotIds = data.items.map((item) => item.lotId).filter((id): id is string => Boolean(id))
		if (lotIds.length > 0) {
			const { data: lots } = await inv.from("stock_lot").select("id, kitchen_id").in("id", lotIds)
			for (const lot of lots ?? []) {
				if (Number(lot.kitchen_id) !== data.kitchenId) throw new Error("Lote de outra cozinha")
			}
			if ((lots ?? []).length !== new Set(lotIds).size) throw new Error("Lote não encontrado")
		}

		// insumo com unidade fora do catálogo canônico não movimenta estoque: o
		// ajuste entraria numa unidade que o resto do sistema não sabe converter
		for (const item of data.items) {
			await assertCanonicalUnit(item.ingredientId ?? null)
		}
		if (lotIds.length > 0) {
			const { data: lotItems } = await inv.from("stock_lot").select("ingredient_id").in("id", lotIds)
			for (const lot of lotItems ?? []) await assertCanonicalUnit(lot.ingredient_id)
		}

		const { data: doc, error } = await inv
			.from("stock_adjustment")
			.insert({
				kitchen_id: data.kitchenId,
				notes: data.notes?.trim() || null,
				evidence_status: evidencePending(data.items) ? "pending" : "complete",
				created_by: userId,
				submitted_at: new Date().toISOString(),
			})
			.select("id")
			.single()
		if (error || !doc) throw new Error(`Erro ao criar o ajuste: ${error?.message}`)

		const { error: itemsError } = await inv.from("stock_adjustment_item").insert(
			data.items.map((item) => ({
				adjustment_id: doc.id,
				lot_id: item.lotId ?? null,
				ingredient_id: item.ingredientId ?? null,
				frozen_preparation_id: item.frozenPreparationId ?? null,
				direction: item.direction,
				quantity: item.quantity,
				unit_cost: item.unitCost ?? null,
				reason_code: item.reasonCode,
				note: item.note?.trim() || null,
				evidence_kind: item.evidenceKind ?? null,
				evidence_reference: item.evidenceReference?.trim() || null,
				measured_temperature_c: item.measuredTemperatureC ?? null,
				corrected_movement_id: item.correctedMovementId ?? null,
			}))
		)
		if (itemsError) {
			await inv.from("stock_adjustment").delete().eq("id", doc.id)
			throw new Error(`Erro nos itens do ajuste: ${itemsError.message}`)
		}

		const { data: requires } = await inv.rpc("adjustment_requires_approval", { p_adjustment_id: doc.id })
		if (requires === true) {
			await inv.from("stock_adjustment").update({ status: "pending_approval" }).eq("id", doc.id)
			return { adjustmentId: doc.id as string, status: "pending_approval" as const, movements: 0 }
		}

		const { data: posted, error: postError } = await inv.rpc("post_stock_adjustment", {
			p_adjustment_id: doc.id,
			p_actor: userId,
			p_approval_exception_reason: null,
		})
		if (postError) throw new Error(`Erro ao lançar o ajuste: ${postError.message}`)
		return { adjustmentId: doc.id as string, status: "posted" as const, movements: Number(posted?.[0]?.movements ?? 0) }
	})

/** Aprova e lança o ajuste pendente. Segregação conforme a cozinha. */
export const approveAdjustmentFn = createServerFn({ method: "POST" })
	.validator(z.object({ adjustmentId: z.uuid() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: doc } = await inv.from("stock_adjustment").select("kitchen_id, status, created_by").eq("id", data.adjustmentId).maybeSingle()
		if (!doc) throw new Error("Ajuste não encontrado")
		const { userId } = await requireStorageForKitchen(3, Number(doc.kitchen_id))
		if (doc.status !== "pending_approval") throw new Error(`Ajuste em "${doc.status}" não está aguardando aprovação`)

		// Quem aprova ≠ quem lançou. Mas se NÃO existe outro nível 3 na cozinha, a
		// operação segue com a exceção registrada: travar a cozinha no fim de
		// semana não é controle, é convite ao contorno — e a exceção vira relatório.
		let exceptionReason: string | null = null
		if (doc.created_by === userId) {
			if (await hasOtherApprover(Number(doc.kitchen_id), userId)) {
				throw new Error("Segregação de funções: quem lançou o ajuste não pode aprová-lo — há outro responsável nível 3 nesta cozinha")
			}
			exceptionReason = "Único responsável nível 3 da cozinha no momento da aprovação"
		}

		const { data: posted, error } = await inv.rpc("post_stock_adjustment", {
			p_adjustment_id: data.adjustmentId,
			p_actor: userId,
			p_approval_exception_reason: exceptionReason,
		})
		if (error) throw new Error(`Erro ao lançar o ajuste: ${error.message}`)
		return { movements: Number(posted?.[0]?.movements ?? 0), value: Number(posted?.[0]?.value ?? 0), exceptionReason }
	})

export const rejectAdjustmentFn = createServerFn({ method: "POST" })
	.validator(z.object({ adjustmentId: z.uuid(), reason: z.string().min(5) }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: doc } = await inv.from("stock_adjustment").select("kitchen_id, status").eq("id", data.adjustmentId).maybeSingle()
		if (!doc) throw new Error("Ajuste não encontrado")
		const { userId } = await requireStorageForKitchen(3, Number(doc.kitchen_id))
		if (doc.status === "posted") throw new Error("Ajuste já lançado")

		const { error } = await inv
			.from("stock_adjustment")
			.update({ status: "rejected", decided_by: userId, decided_at: new Date().toISOString(), rejection_reason: data.reason.trim() })
			.eq("id", data.adjustmentId)
		if (error) throw new Error(`Erro ao rejeitar o ajuste: ${error.message}`)
		return { rejected: true }
	})

/** Completa a evidência de um ajuste já lançado (o registro não se refaz). */
export const completeAdjustmentEvidenceFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			adjustmentItemId: z.uuid(),
			evidenceKind: z.enum(["photo", "term", "report", "process", "nfe_key", "temperature", "other"]),
			evidenceReference: z.string().min(1).max(200),
			investigationReference: z.string().max(200).optional(),
		})
	)
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: item } = await inv
			.from("stock_adjustment_item")
			.select("id, adjustment_id, stock_adjustment!inner(kitchen_id)")
			.eq("id", data.adjustmentItemId)
			.maybeSingle()
		if (!item) throw new Error("Item de ajuste não encontrado")
		const kitchenId = Number((item as { stock_adjustment: { kitchen_id: number } }).stock_adjustment.kitchen_id)
		await requireStorageForKitchen(2, kitchenId)

		const { error } = await inv
			.from("stock_adjustment_item")
			.update({
				evidence_kind: data.evidenceKind,
				evidence_reference: data.evidenceReference.trim(),
				investigation_reference: data.investigationReference?.trim() || null,
			})
			.eq("id", data.adjustmentItemId)
		if (error) throw new Error(`Erro ao registrar a evidência: ${error.message}`)

		// Volta a "completo" pela MESMA regra que o marcou pendente: só os motivos
		// de `EVIDENCE_REQUIRED` exigem evidência. Olhar `evidence_reference` de
		// TODOS os itens deixava o documento pendente para sempre — basta uma
		// linha de motivo que nunca precisou de evidência.
		const { data: siblings } = await inv
			.from("stock_adjustment_item")
			.select("reason_code, direction, evidence_reference, measured_temperature_c, corrected_movement_id")
			.eq("adjustment_id", item.adjustment_id)
		const stillPending = evidencePending(
			(
				(siblings ?? []) as Array<{
					reason_code: string
					direction: string
					evidence_reference: string | null
					measured_temperature_c: number | null
					corrected_movement_id: string | null
				}>
			).map((row) => ({
				reasonCode: row.reason_code as AdjustmentItemInput["reasonCode"],
				direction: row.direction as "in" | "out",
				quantity: 1,
				evidenceReference: row.evidence_reference ?? undefined,
				measuredTemperatureC: row.measured_temperature_c ?? undefined,
				correctedMovementId: row.corrected_movement_id ?? undefined,
			}))
		)
		if (!stillPending) {
			await inv.from("stock_adjustment").update({ evidence_status: "complete" }).eq("id", item.adjustment_id)
		}
		return { saved: true }
	})

/**
 * Quarentena: tira o lote da alocação NA HORA, antes de qualquer aprovação.
 * Sem isso, a câmara falha no sábado, o ajuste fica pendente até segunda e a
 * requisição de domingo sugere o lote comprometido.
 */
export const quarantineLotFn = createServerFn({ method: "POST" })
	.validator(z.object({ lotId: z.uuid(), reason: z.string().min(5).max(300) }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: lot } = await inv.from("stock_lot").select("id, kitchen_id, quarantined_at").eq("id", data.lotId).maybeSingle()
		if (!lot) throw new Error("Lote não encontrado")
		const { userId } = await requireStorageForKitchen(2, Number(lot.kitchen_id))
		if (lot.quarantined_at != null) throw new Error("Lote já está em quarentena")

		const { error } = await inv
			.from("stock_lot")
			.update({ quarantined_at: new Date().toISOString(), quarantined_by: userId, quarantine_reason: data.reason.trim() })
			.eq("id", data.lotId)
		if (error) throw new Error(`Erro ao pôr o lote em quarentena: ${error.message}`)
		return { quarantined: true }
	})

/** Liberar quarentena sem ajuste é decisão de nível 3. */
export const releaseQuarantineFn = createServerFn({ method: "POST" })
	.validator(z.object({ lotId: z.uuid(), reason: z.string().min(5).max(300) }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: lot } = await inv.from("stock_lot").select("id, kitchen_id, quarantined_at").eq("id", data.lotId).maybeSingle()
		if (!lot) throw new Error("Lote não encontrado")
		await requireStorageForKitchen(3, Number(lot.kitchen_id))
		if (lot.quarantined_at == null) throw new Error("Lote não está em quarentena")

		const { error } = await inv
			.from("stock_lot")
			.update({ quarantined_at: null, quarantined_by: null, quarantine_reason: `Liberado: ${data.reason.trim()}` })
			.eq("id", data.lotId)
		if (error) throw new Error(`Erro ao liberar o lote: ${error.message}`)
		return { released: true }
	})

/** Produto aberto, fracionado ou descongelado → lote derivado com etiqueta. */
export const splitLotFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			lotId: z.uuid(),
			quantity: z.number().positive(),
			derivation: z.enum(["opened", "portioned", "thawed"]),
			expiryDate: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/)
				.optional(),
			location: z.string().max(60).optional(),
		})
	)
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: lot } = await inv.from("stock_lot").select("id, kitchen_id").eq("id", data.lotId).maybeSingle()
		if (!lot) throw new Error("Lote não encontrado")
		const { userId } = await requireStorageForKitchen(2, Number(lot.kitchen_id))

		const { data: result, error } = await inv.rpc("split_lot", {
			p_lot_id: data.lotId,
			p_quantity: data.quantity,
			p_derivation: data.derivation,
			p_user: userId,
			p_expiry_date: data.expiryDate ?? null,
			p_location: data.location?.trim() || null,
		})
		if (error) throw new Error(`Erro ao fracionar o lote: ${error.message}`)
		const row = result?.[0]
		return { lotId: row?.new_lot_id as string, shortCode: row?.new_short_code as string, expiryDate: (row?.new_expiry_date ?? null) as string | null }
	})

/** Ajustes da cozinha, com limite e total (listagem exposta a operador e a IA). */
export const listAdjustmentsFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			status: z.enum(["draft", "pending_approval", "posted", "rejected"]).optional(),
			limit: z.number().int().min(1).max(200).default(50),
		})
	)
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const inv = inventory()
		let query = inv
			.from("stock_adjustment")
			.select("id, status, notes, evidence_status, posted_value, created_by, created_at, decided_by, decided_at, approval_exception_reason", {
				count: "exact",
			})
			.eq("kitchen_id", data.kitchenId)
			.order("created_at", { ascending: false })
			.limit(data.limit)
		if (data.status) query = query.eq("status", data.status)
		const { data: rows, count, error } = await query
		if (error) throw new Error(`Erro ao listar ajustes: ${error.message}`)

		const ids = (rows ?? []).map((row: { id: string }) => row.id)
		const itemsByDoc = new Map<string, Array<Record<string, unknown>>>()
		if (ids.length > 0) {
			const { data: items } = await inv
				.from("stock_adjustment_item")
				.select("id, adjustment_id, lot_id, direction, quantity, reason_code, note, evidence_reference, measured_temperature_c, investigation_reference")
				.in("adjustment_id", ids)
			for (const item of items ?? []) {
				itemsByDoc.set(item.adjustment_id, [...(itemsByDoc.get(item.adjustment_id) ?? []), item])
			}
		}

		return {
			adjustments: (rows ?? []).map((row: { id: string }) => ({ ...row, items: itemsByDoc.get(row.id) ?? [] })),
			total: count ?? (rows ?? []).length,
		}
	})

/**
 * Relatório de perdas por motivo e natureza.
 *
 * `lost`, `theft` e `cold_chain_failure` saem destacados: na administração
 * pública, perda com indício de responsabilidade abre apuração, e o valor fica
 * "em apuração" até o processo ser informado.
 */
export const fetchLossReportFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		})
	)
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const inv = inventory()
		const { data: rows, error } = await inv
			.from("stock_movement")
			.select("reason_code, quantity, total_cost, ingredient_id")
			.eq("kitchen_id", data.kitchenId)
			.not("reason_code", "is", null)
			// período civil em Brasília, como o resto do módulo
			.gte("occurred_at", `${data.from}T00:00:00-03:00`)
			.lte("occurred_at", `${data.to}T23:59:59.999-03:00`)
		if (error) throw new Error(`Erro ao montar o relatório de perdas: ${error.message}`)

		const byReason = new Map<string, { quantity: number; value: number; movements: number }>()
		for (const row of rows ?? []) {
			const key = String(row.reason_code)
			const current = byReason.get(key) ?? { quantity: 0, value: 0, movements: 0 }
			byReason.set(key, {
				quantity: current.quantity + Number(row.quantity),
				value: current.value + Number(row.total_cost ?? 0),
				movements: current.movements + 1,
			})
		}

		const UNDER_INVESTIGATION = new Set(["lost", "theft", "cold_chain_failure"])
		const lines = [...byReason.entries()]
			.map(([reasonCode, totals]) => ({ reasonCode, ...totals, underInvestigation: UNDER_INVESTIGATION.has(reasonCode) }))
			.sort((a, b) => b.value - a.value)

		return {
			lines,
			// `opening_balance` é implantação de saldo, não perda nem ganho: contá-lo
			// aqui inventaria uma variação aumentativa que nunca existiu
			totalValue: lines.filter((line) => line.reasonCode !== "opening_balance").reduce((acc, line) => acc + line.value, 0),
			underInvestigationValue: lines.filter((line) => line.underInvestigation).reduce((acc, line) => acc + line.value, 0),
		}
	})

/** Lotes em quarentena da cozinha — a fila que o nível 3 precisa resolver. */
export const listQuarantinedLotsFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const inv = inventory()
		const { data: lots, error } = await inv
			.from("stock_lot")
			.select("id, short_code, lot_code, expiry_date, location, ingredient_id, frozen_preparation_id, quarantined_at, quarantined_by, quarantine_reason")
			.eq("kitchen_id", data.kitchenId)
			.not("quarantined_at", "is", null)
			.order("quarantined_at", { ascending: true })
			.limit(100)
		if (error) throw new Error(`Erro ao listar lotes em quarentena: ${error.message}`)

		const ingredientIds = [...new Set((lots ?? []).map((lot: { ingredient_id: string | null }) => lot.ingredient_id).filter(Boolean))] as string[]
		const names = new Map<string, string>()
		if (ingredientIds.length > 0) {
			const { data: ingredients } = await kitchen().from("ingredient").select("id, description").in("id", ingredientIds)
			for (const ingredient of ingredients ?? []) names.set(ingredient.id, ingredient.description)
		}

		return (lots ?? []).map((lot: { ingredient_id: string | null }) => ({
			...lot,
			description: lot.ingredient_id ? (names.get(lot.ingredient_id) ?? "—") : "(preparação congelada)",
		}))
	})
