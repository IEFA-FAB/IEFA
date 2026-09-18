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

import { hasPermission, NOT_EXPIRED, resolveEffectivePermissions, type UserPermission } from "@iefa/pbac"
import { INFLOW_REASONS, OUTFLOW_REASONS, REASON_NATURE, STOCK_ADJUSTMENT_REASONS, type StockAdjustmentReason } from "@iefa/sisub-domain"
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

/**
 * Existe outro nível 3 de `storage` nesta cozinha, além do ator?
 *
 * A resposta decide se a exceção "único nível 3 da cozinha" pode ser gravada.
 * Errá-la para MAIS é gravar uma justificativa falsa num documento contábil;
 * errá-la para MENOS trava a cozinha. Por isso a pergunta é respondida pelo
 * mesmo motor que autoriza o resto do app, e não por uma leitura própria:
 *
 *  • as DUAS origens do modelo — grants inline (`user_permissions`) e
 *    statements de política anexada. Ler só a primeira tornava invisível tanto
 *    o aprovador concedido por política (o "Conjunto Treino") quanto o deny
 *    vindo de política;
 *  • `resolveEffectivePermissions` para a precedência de deny, que não é
 *    ausência: um `level <= 0` de QUALQUER origem anula os allows que cobre;
 *  • `hasPermission` para o escopo, com a MESMA regra que o guard da própria
 *    server fn aplica — permissão global ou escopada nesta cozinha. Se o PBAC
 *    passar a fazer permissão de unidade alcançar as cozinhas dela, esta
 *    função acompanha sozinha, em vez de divergir do guard.
 */
async function hasOtherApprover(kitchenId: number, actorId: string): Promise<boolean> {
	type PermissionRow = {
		user_id: string
		module: string
		level: number
		kitchen_id: number | null
		unit_id: number | null
		mess_hall_id: number | null
	}
	const ac = accessControl()
	// Vencimento pelo relógio do BANCO (`NOT_EXPIRED` usa `now()` do Postgres),
	// como o `@iefa/pbac` faz de propósito: container com relógio adiantado
	// concederia acesso já vencido.
	//
	// E as leituras são recortadas em `storage` e nesta cozinha (ou sem escopo de
	// cozinha). Ler a `user_permissions` inteira batia no teto de 1000 linhas do
	// PostgREST: um aprovador real podia sumir do conjunto, calado, e o autor
	// passava a gravar "único nível 3 da cozinha" — uma exceção falsa num
	// documento contábil. Recortar por módulo é seguro para a precedência de deny,
	// que é por módulo.
	const inScope = `kitchen_id.eq.${kitchenId},kitchen_id.is.null`

	const { data: statements, error: statementError } = await ac
		.from("policy_statement")
		.select("policy_id, module, level, kitchen_id, unit_id, mess_hall_id")
		.eq("module", "storage")
		.or(inScope)
		// Só o que decide aprovação: nível 3 (quem aprova) e deny (nível ≤ 0, que
		// anula). Uma política de nível baixo anexada a milhares de usuários
		// empurraria a leitura de anexos para além do teto de 1000 linhas, e o
		// único nível 3 real poderia sumir do resultado calado.
		.or("level.gte.3,level.lte.0")
	if (statementError) throw new Error(`Erro ao verificar os aprovadores da cozinha: ${statementError.message}`)
	const statementRows = (statements ?? []) as Array<Omit<PermissionRow, "user_id"> & { policy_id: string }>
	const storagePolicyIds = [...new Set(statementRows.map((row) => row.policy_id))]

	const [inlineResult, attachmentResult, liveResult] = await Promise.all([
		ac
			.from("user_permissions")
			.select("user_id, module, level, kitchen_id, unit_id, mess_hall_id")
			.eq("module", "storage")
			.or(inScope)
			.or("level.gte.3,level.lte.0")
			.or(NOT_EXPIRED),
		storagePolicyIds.length > 0
			? ac.from("user_policy_attachment").select("user_id, policy_id").in("policy_id", storagePolicyIds).or(NOT_EXPIRED)
			: Promise.resolve({ data: [], error: null }),
		storagePolicyIds.length > 0 ? ac.from("policy").select("id").in("id", storagePolicyIds).is("deleted_at", null) : Promise.resolve({ data: [], error: null }),
	])
	if (inlineResult.error) throw new Error(`Erro ao verificar os aprovadores da cozinha: ${inlineResult.error.message}`)
	if (attachmentResult.error) throw new Error(`Erro ao verificar os aprovadores da cozinha: ${attachmentResult.error.message}`)
	if (liveResult.error) throw new Error(`Erro ao verificar os aprovadores da cozinha: ${liveResult.error.message}`)

	const live = new Set(((liveResult.data ?? []) as Array<{ id: string }>).map((row) => row.id))
	const byPolicy = new Map<string, Array<Omit<PermissionRow, "user_id">>>()
	for (const row of statementRows) {
		if (!live.has(row.policy_id)) continue
		const list = byPolicy.get(row.policy_id) ?? []
		list.push(row)
		byPolicy.set(row.policy_id, list)
	}
	const policyRows: PermissionRow[] = []
	for (const attachment of (attachmentResult.data ?? []) as Array<{ user_id: string; policy_id: string }>) {
		for (const statement of byPolicy.get(attachment.policy_id) ?? []) {
			policyRows.push({ ...statement, user_id: attachment.user_id })
		}
	}

	const group = (rows: PermissionRow[]) => {
		const map = new Map<string, UserPermission[]>()
		for (const { user_id, ...permission } of rows) {
			const list = map.get(user_id) ?? []
			list.push(permission as UserPermission)
			map.set(user_id, list)
		}
		return map
	}
	const inlineByUser = group((inlineResult.data ?? []) as PermissionRow[])
	const policyByUser = group(policyRows)

	const candidates = new Set([...inlineByUser.keys(), ...policyByUser.keys()])
	candidates.delete(actorId)
	for (const userId of candidates) {
		const effective = resolveEffectivePermissions(inlineByUser.get(userId) ?? [], policyByUser.get(userId) ?? [])
		if (hasPermission(effective, "storage", 3, { type: "kitchen", id: kitchenId })) return true
	}
	return false
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

		// Documento e itens já existem daqui para baixo. Falha antes do lançamento
		// APAGA o documento — como a falha nos itens —, senão ele fica encalhado em
		// `draft`, sem ação nenhuma na tela, e o operador reenvia e nasce um segundo
		// documento para a mesma perda.
		// Desfaz o rascunho e lança. Se o próprio desfazer falhar, a mensagem DIZ
		// que o rascunho ficou: calado, o operador lia só o primeiro erro, tentava
		// de novo e deixava um documento encalhado em `draft` que tela nenhuma
		// mostra.
		const abandon = async (message: string): Promise<never> => {
			const { error: deleteError } = await inv.from("stock_adjustment").delete().eq("id", doc.id).eq("status", "draft")
			if (deleteError) throw new Error(`${message} — e o rascunho ${doc.id} não pôde ser desfeito (${deleteError.message}); avise o nível 3`)
			throw new Error(message)
		}

		const { data: requires, error: requiresError } = await inv.rpc("adjustment_requires_approval", { p_adjustment_id: doc.id })
		if (requiresError) await abandon(`Erro ao conferir a alçada do ajuste: ${requiresError.message}`)
		// O FATO fica gravado agora. A exigência é monotônica — o lançamento ainda
		// reavalia a regra sob trava e soma o que surgiu depois (inclusive outro
		// ajuste do mesmo autor criado ao mesmo tempo) —, mas o fato gravado impede
		// que esperar 24 h, ou subir a alçada, desfaça a exigência.
		const { error: factError } = await inv
			.from("stock_adjustment")
			.update({ approval_required: requires === true })
			.eq("id", doc.id)
		if (factError) await abandon(`Erro ao registrar a alçada do ajuste: ${factError.message}`)
		if (requires === true) {
			const { error: pendingError } = await inv.from("stock_adjustment").update({ status: "pending_approval" }).eq("id", doc.id)
			if (pendingError) await abandon(`Erro ao enviar o ajuste para aprovação: ${pendingError.message}`)
			return { adjustmentId: doc.id as string, status: "pending_approval" as const, movements: 0, postFailure: null as string | null }
		}

		const { data: posted, error: postError } = await inv.rpc("post_stock_adjustment", {
			p_adjustment_id: doc.id,
			p_actor: userId,
			p_approval_exception_reason: null,
		})
		if (postError) {
			// O documento não pode ficar encalhado em `draft`: a tela não oferece
			// ação nenhuma para ele, e o ajuste vira invisível. Falhou o lançamento
			// (saldo insuficiente, lote de outra cozinha), vai para aprovação com o
			// motivo — de onde dá para rejeitar ou corrigir.
			//
			// A falha é ACRESCENTADA à observação, nunca escrita por cima: o que o
			// operador digitou é o que explica o ajuste para quem vai aprová-lo, e
			// trocá-lo por uma mensagem técnica apaga a única informação que o
			// aprovador tem sobre o que aconteceu na prateleira.
			const failureNote = `Lançamento automático falhou: ${postError.message}`
			const operatorNote = data.notes?.trim()
			// Se o lançamento caiu porque a regra, reavaliada sob trava, passou a
			// exigir aprovação (outro ajuste do autor lançou no meio), o documento vai
			// para a fila COM a exigência gravada — monotônica: depois de 24 h ela
			// não some sozinha.
			const { data: nowRequires } = await inv.rpc("adjustment_requires_approval", { p_adjustment_id: doc.id })
			// SÓ se o documento ainda está em rascunho. O erro pode ter vindo depois
			// do COMMIT — o deadline de fetch do `@iefa/supabase-kit` existe
			// justamente para cortar resposta lenta — e aí o documento já está
			// `posted`: devolvê-lo à fila faria o aprovador lançar os movimentos uma
			// segunda vez.
			const { data: moved, error: recoveryError } = await inv
				.from("stock_adjustment")
				.update({
					status: "pending_approval",
					notes: operatorNote ? `${operatorNote}\n\n${failureNote}` : failureNote,
					...(nowRequires === true ? { approval_required: true } : {}),
				})
				.eq("id", doc.id)
				.eq("status", "draft")
				.select("id")
			// e se a própria recuperação falhar, o usuário precisa saber que o
			// documento ficou em `draft` — senão ele procura na fila de aprovação
			// um ajuste que não está lá
			if (recoveryError) {
				throw new Error(
					`Erro ao lançar o ajuste: ${postError.message}. O documento ficou em rascunho e não foi para a fila de aprovação (${recoveryError.message})`
				)
			}
			if ((moved ?? []).length === 0) {
				const { data: current, error: currentError } = await inv.from("stock_adjustment").select("status").eq("id", doc.id).maybeSingle()
				if (currentError) throw new Error(`Erro ao conferir o ajuste depois da falha: ${currentError.message}`)
				if (current?.status === "posted") {
					// a resposta falhou, o lançamento não: é sucesso, e dizer outra coisa
					// convidaria o operador a lançar a mesma perda de novo
					return { adjustmentId: doc.id as string, status: "posted" as const, movements: 0, postFailure: null as string | null }
				}
				throw new Error(`Erro ao lançar o ajuste: ${postError.message}. O documento está em "${current?.status ?? "desconhecido"}"`)
			}
			// Recuperação deu certo: o documento EXISTE, na fila de aprovação. Isto é
			// resultado, não erro. Lançar erro aqui fazia a tela manter o formulário
			// preenchido e não atualizar a lista — o operador tentava de novo, nascia
			// um segundo documento pendente para a MESMA perda, e um aprovador podia
			// aprovar os dois, tirando o estoque duas vezes.
			return {
				adjustmentId: doc.id as string,
				status: "pending_approval" as const,
				movements: 0,
				postFailure: postError.message as string | null,
			}
		}
		return {
			adjustmentId: doc.id as string,
			status: "posted" as const,
			movements: Number(posted?.[0]?.movements ?? 0),
			postFailure: null as string | null,
		}
	})

/** Aprova e lança o ajuste pendente. Segregação conforme a cozinha. */
export const approveAdjustmentFn = createServerFn({ method: "POST" })
	.validator(z.object({ adjustmentId: z.uuid() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: doc, error: docError } = await inv
			.from("stock_adjustment")
			.select("kitchen_id, status, created_by, approval_required")
			.eq("id", data.adjustmentId)
			.maybeSingle()
		if (docError) throw new Error(`Erro ao carregar o ajuste: ${docError.message}`)
		if (!doc) throw new Error("Ajuste não encontrado")
		const { userId } = await requireStorageForKitchen(3, Number(doc.kitchen_id))
		if (doc.status !== "pending_approval") throw new Error(`Ajuste em "${doc.status}" não está aguardando aprovação`)

		// Quem aprova ≠ quem lançou. Mas se NÃO existe outro nível 3 na cozinha, a
		// operação segue com a exceção registrada: travar a cozinha no fim de
		// semana não é controle, é convite ao contorno — e a exceção vira relatório.
		// A segregação só vale para documento que EXIGE aprovação, e a exigência é
		// MONOTÔNICA: fato gravado na criação OU regra reavaliada agora. Só a regra
		// deixava o autor escapar esperando 24 h ou subindo a alçada; só o fato
		// deixava escapar dois ajustes criados ao mesmo tempo. O banco aplica a
		// mesma conta no lançamento, sob trava — esta aqui decide a exceção e a
		// mensagem, não a segurança.
		const { data: live, error: requiresError } = await inv.rpc("adjustment_requires_approval", { p_adjustment_id: data.adjustmentId })
		if (requiresError) throw new Error(`Erro ao conferir a alçada do ajuste: ${requiresError.message}`)
		const requires = doc.approval_required === true || live === true

		let exceptionReason: string | null = null
		if (requires === true && doc.created_by === userId) {
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

		// Condicionado ao estado que foi conferido: entre a leitura acima e esta
		// escrita, outro aprovador pode ter LANÇADO o documento. Sem a condição, um
		// ajuste com movimentos no ledger virava "rejeitado" — o estoque mudou e o
		// documento diz que não.
		const { data: changed, error } = await inv
			.from("stock_adjustment")
			.update({ status: "rejected", decided_by: userId, decided_at: new Date().toISOString(), rejection_reason: data.reason.trim() })
			.eq("id", data.adjustmentId)
			.in("status", ["draft", "pending_approval"])
			.select("id")
		if (error) throw new Error(`Erro ao rejeitar o ajuste: ${error.message}`)
		if ((changed ?? []).length === 0) throw new Error("O ajuste mudou de estado enquanto era rejeitado — recarregue e confira")
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
			// `cold_chain_failure` fecha com a TEMPERATURA e `entry_error_*` com o
			// movimento corrigido — não com uma referência em texto. Sem estes dois
			// campos, esses ajustes ficavam pendentes de evidência para sempre.
			measuredTemperatureC: z.number().optional(),
			correctedMovementId: z.uuid().optional(),
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
				...(data.measuredTemperatureC != null ? { measured_temperature_c: data.measuredTemperatureC } : {}),
				...(data.correctedMovementId ? { corrected_movement_id: data.correctedMovementId } : {}),
			})
			.eq("id", data.adjustmentItemId)
		if (error) throw new Error(`Erro ao registrar a evidência: ${error.message}`)

		// Volta a "completo" pela MESMA regra que o marcou pendente: só os motivos
		// de `EVIDENCE_REQUIRED` exigem evidência. Olhar `evidence_reference` de
		// TODOS os itens deixava o documento pendente para sempre — basta uma
		// linha de motivo que nunca precisou de evidência.
		const { data: siblings, error: siblingsError } = await inv
			.from("stock_adjustment_item")
			.select("reason_code, direction, evidence_reference, measured_temperature_c, corrected_movement_id")
			.eq("adjustment_id", item.adjustment_id)
		// Sem os irmãos não há como saber se ainda falta evidência. Ignorar o erro
		// fazia `[]` passar por "nada pendente" e o documento virava `complete`
		// com evidência faltando — o contrário do que a flag afirma.
		if (siblingsError) throw new Error(`Erro ao conferir a evidência dos demais itens: ${siblingsError.message}`)
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
			// só quem ainda não está: duas pessoas pondo o mesmo lote em quarentena
			// não podem trocar o autor e o motivo registrados pela primeira
			.is("quarantined_at", null)
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
			.map(([reasonCode, totals]) => ({
				reasonCode,
				...totals,
				// a natureza vem do domínio, e não de um fallback: o descarte de sobra
				// de produção é CONSUMO, e ser rotulado "Perda" por omissão inflava o
				// desperdício da cozinha com o que ela serviu
				nature: (REASON_NATURE[reasonCode as StockAdjustmentReason] ?? "consumption") as string,
				underInvestigation: UNDER_INVESTIGATION.has(reasonCode),
			}))
			.sort((a, b) => b.value - a.value)

		// O total é de PERDA, e leva DOIS filtros porque natureza sozinha não
		// separa entrada de saída:
		//  • `loss` e `under_investigation` — estragou, venceu, quebrou, sumiu;
		//  • `inventory` SÓ na saída. `count_loss` é falta apurada em contagem e é
		//    perda; `count_gain` e `found_stock` têm a MESMA natureza e são
		//    entrada. Sem o filtro de direção, ou a falta de inventário ficava
		//    fora do total (uma linha de R$ 800 sob "Total: R$ 0,00") ou a sobra
		//    de inventário entrava somando como se fosse prejuízo;
		//  • o resto fica de fora: consumo, devolução a fornecedor, doação,
		//    correção de lançamento e implantação de saldo não são perda.
		const LOSS_NATURES = new Set(["loss", "under_investigation", "inventory"])
		const OUTFLOW = new Set<string>(OUTFLOW_REASONS)
		return {
			lines,
			totalValue: lines.filter((line) => LOSS_NATURES.has(line.nature) && OUTFLOW.has(line.reasonCode)).reduce((acc, line) => acc + line.value, 0),
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
