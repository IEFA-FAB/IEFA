/**
 * @module liquidation.fn
 * Liquidação (NS) e pagamento (OB) — 2ª e 3ª fases da despesa (Lei 4.320).
 * A liquidação é o elo entre o recebimento definitivo (físico, MCASP) e o
 * empenho. NUNCA é criada automaticamente: o sistema apenas SUGERE o valor a
 * partir do recebimento; liquidar é ato do ordenador e a NS nasce no SIAFI.
 * CLIENT: getServerClient (service role, schemas finance/inventory).
 * AUTH: `unit` escopado — 1 leitura, 2 lançar.
 * TABLES: finance.liquidacao, finance.liquidacao_deduction, finance.pagamento,
 *   inventory.goods_receipt(_item), inventory.nfe_document (leitura).
 * @domain core
 * @migration 20260731150000_finance_liquidacao_pagamento, 20260926216000_finance_compliance
 */

import type { TableRow } from "@iefa/database"
import {
	competenciaFromDate,
	DEDUCTION_DOCUMENT_KINDS,
	DEDUCTION_KINDS,
	deductionExceedsProblem,
	deductionPaymentProblem,
	isLiquidationWithoutReceipt,
	liquidationExceedsReceiptProblem,
	liquidationNetBalance,
	normalizeNsNumber,
	paymentExceedsNetProblem,
	type ReceiptLiquidationCeiling,
	receiptLiquidationCeiling,
	resolvePurchaseUnitId,
	roundToCents,
	suggestedLiquidationValue,
} from "@iefa/sisub-domain/operations"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { withSensitiveAudit } from "@/lib/audit.server"
import { type LiquidationLinkInput, liquidationLinkProblems, type ReceiptForLiquidation } from "@/lib/invoice-gate"
import { selectColumns } from "@/lib/select-columns"
import { getServerClient } from "@/lib/supabase.server"
import { requireUnitScope } from "@/lib/unit-auth.server"

const finance = () => getServerClient("finance")
const inventory = () => getServerClient("inventory")

const DEDUCTION_COLUMNS = ["id", "liquidacao_id", "kind", "amount", "document_kind", "document_number", "revenue_code", "paid_on", "notes"] as const

/**
 * Linha de `finance.liquidacao_deduction` como `DEDUCTION_COLUMNS` a lê; `kind` e `document_kind`
 * estreitados aos valores dos CHECKs do banco. `paid_on` é a data do recolhimento; `null` = retida,
 * ainda não recolhida.
 */
export type LiquidacaoDeductionRow = Omit<Pick<TableRow<"finance", "liquidacao_deduction">, (typeof DEDUCTION_COLUMNS)[number]>, "kind" | "document_kind"> & {
	kind: (typeof DEDUCTION_KINDS)[number]
	document_kind: (typeof DEDUCTION_DOCUMENT_KINDS)[number] | null
}

export interface LiquidacaoRow {
	id: string
	numero_ns: string
	data: string
	/** Valor BRUTO da NS. */
	valor: number
	empenho_id: string
	goods_receipt_id: string | null
	origem: string
	/** Σ das retenções registradas na NS. */
	deducoes: number
	/** O que a OB paga ao credor: bruto − deduções. */
	liquido: number
	pago: number
	/** Líquido ainda não pago ao credor. */
	a_pagar: number
	/** Retenções ainda não recolhidas (DARF/DAR/GPS). */
	a_recolher: number
	/** Pendência "liquidação sem recebimento vinculado" (`isLiquidationWithoutReceipt`). */
	sem_recebimento: boolean
	deductions: LiquidacaoDeductionRow[]
	dias_em_aberto: number | null
}

export const listLiquidacoesFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive() }))
	.handler(async ({ data }): Promise<LiquidacaoRow[]> => {
		await requireUnitScope(1, data.unitId)
		const fin = finance()

		const { data: rows, error } = await fin
			.from("liquidacao")
			.select("id, numero_ns, data, valor, empenho_id, goods_receipt_id, origem")
			.eq("unit_id", data.unitId)
			.order("data", { ascending: false })
			.limit(200)
		if (error) throw new Error(`Erro ao listar liquidações: ${error.message}`)
		const liquidacoes = rows ?? []
		if (liquidacoes.length === 0) return []

		const ids = liquidacoes.map((l: { id: string }) => l.id)
		const [{ data: pagamentos }, { data: deductionRows, error: deductionError }] = await Promise.all([
			fin.from("pagamento").select("liquidacao_id, valor").in("liquidacao_id", ids),
			fin.from("liquidacao_deduction").select(selectColumns(DEDUCTION_COLUMNS)).in("liquidacao_id", ids).order("created_at"),
		])
		if (deductionError) throw new Error(`Erro ao listar as deduções: ${deductionError.message}`)
		const pagamentosByLiquidacao = new Map<string, number[]>()
		for (const pag of pagamentos ?? []) {
			const list = pagamentosByLiquidacao.get(pag.liquidacao_id) ?? []
			list.push(Number(pag.valor))
			pagamentosByLiquidacao.set(pag.liquidacao_id, list)
		}
		const deductionsByLiquidacao = new Map<string, LiquidacaoDeductionRow[]>()
		for (const row of deductionRows ?? []) {
			const list = deductionsByLiquidacao.get(row.liquidacao_id) ?? []
			list.push({
				...row,
				amount: Number(row.amount),
				kind: row.kind as LiquidacaoDeductionRow["kind"],
				document_kind: row.document_kind as LiquidacaoDeductionRow["document_kind"],
			})
			deductionsByLiquidacao.set(row.liquidacao_id, list)
		}

		const today = Date.now()
		return liquidacoes.map((row: { id: string; valor: number; data: string; goods_receipt_id: string | null }) => {
			const deductions = deductionsByLiquidacao.get(row.id) ?? []
			// Saldo da NS pelo LÍQUIDO: a OB paga bruto − retenções; sem retenção é o bruto.
			const balance = liquidationNetBalance({
				bruto: Number(row.valor),
				deducoes: deductions.map((d) => ({ valor: d.amount, recolhidaEm: d.paid_on })),
				pagamentos: pagamentosByLiquidacao.get(row.id) ?? [],
			})
			return {
				...(row as unknown as LiquidacaoRow),
				valor: balance.bruto,
				deducoes: balance.deducoes,
				liquido: balance.liquido,
				pago: balance.pago,
				a_pagar: balance.aPagar,
				a_recolher: balance.aRecolher,
				sem_recebimento: isLiquidationWithoutReceipt({ goodsReceiptId: row.goods_receipt_id }),
				deductions,
				dias_em_aberto: balance.aPagar > 0 ? Math.floor((today - Date.parse(`${row.data}T00:00:00Z`)) / 86_400_000) : null,
			}
		})
	})

/**
 * Valor sugerido para liquidar um recebimento definitivo: Σ (quantidade
 * recebida × custo unitário). Sugestão — o número da NS vem do SIAFI.
 */
export const suggestLiquidationFromReceiptFn = createServerFn({ method: "GET" })
	.validator(z.object({ receiptId: z.uuid() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		// Só a cozinha do recebimento é lida antes do guard — o resto (valores,
		// empenho, NF-e) fica atrás dele. Devolver "não encontrado" x "existe"
		// para quem não tem escopo é um oráculo barato, mas é um oráculo.
		const { data: receiptScope } = await inv.from("goods_receipt").select("kitchen_id").eq("id", data.receiptId).maybeSingle()
		if (!receiptScope) throw new Error("Recebimento não encontrado")

		const kitchenDb = getServerClient("kitchen")
		const { data: kitchenRow } = await kitchenDb.from("kitchen").select("unit_id, purchase_unit_id").eq("id", receiptScope.kitchen_id).single()
		// Quem empenha e liquida é a unidade COMPRADORA: inverter a precedência
		// autorizaria contra a unidade errada. Ver `resolvePurchaseUnitId`.
		const unitId = resolvePurchaseUnitId({ unitId: kitchenRow?.unit_id ?? null, purchaseUnitId: kitchenRow?.purchase_unit_id ?? null })
		if (unitId == null) throw new Error("Cozinha do recebimento não tem unidade vinculada")
		await requireUnitScope(1, unitId)

		const { data: receipt } = await inv
			.from("goods_receipt")
			.select("id, kitchen_id, status, definitive_at, empenho_id, nfe_document_id")
			.eq("id", data.receiptId)
			.maybeSingle()
		if (!receipt) throw new Error("Recebimento não encontrado")

		const { data: items } = await inv.from("goods_receipt_item").select("received_qty_base, unit_cost").eq("receipt_id", data.receiptId)
		// `suggestedLiquidationValue` fecha em centavo sem o viés do arredondamento
		// anterior, que descia o meio-centavo sempre — ver `roundToCents` em
		// liquidation-math.ts.
		const valor = suggestedLiquidationValue(
			((items ?? []) as Array<{ received_qty_base: number; unit_cost: number | null }>).map((item) => ({
				receivedQtyBase: Number(item.received_qty_base),
				unitCost: item.unit_cost != null ? Number(item.unit_cost) : null,
			}))
		)

		// "já liquidado" é derivado do vínculo em finance.liquidacao — um
		// recebimento aceita mais de uma NS (liquidação parcial).
		const { ceiling, alreadyLiquidated, liquidationCount } = await readReceiptCeiling(data.receiptId)

		return {
			unitId,
			valorSugerido: valor,
			empenhoId: receipt.empenho_id as string | null,
			nfeDocumentId: receipt.nfe_document_id as string | null,
			jaLiquidado: liquidationCount > 0,
			jaLiquidadoValor: alreadyLiquidated,
			/** Teto da NS por este recebimento (Lei 4.320, art. 63); `null` quando indeterminado. */
			teto: ceiling.value,
			tetoBase: ceiling.basis,
			definitivo: receipt.definitive_at != null,
		}
	})

/**
 * Quanto o recebimento sustenta de liquidação, e quanto já foi liquidado por ele.
 * A regra é `receiptLiquidationCeiling` (pura, testada); o trigger
 * `finance.check_liquidacao_within_receipt` repete a mesma conta no banco.
 */
async function readReceiptCeiling(receiptId: string): Promise<ReceiptCeilingRead> {
	const map = await readReceiptCeilings([receiptId])
	return map.get(receiptId) ?? { ceiling: receiptLiquidationCeiling([], null), alreadyLiquidated: 0, liquidationCount: 0 }
}

interface ReceiptCeilingRead {
	ceiling: ReceiptLiquidationCeiling
	alreadyLiquidated: number
	liquidationCount: number
}

/**
 * Teto de VÁRIOS recebimentos em quatro leituras agregadas (itens, recebimentos, NF-e e
 * liquidações), não quatro por recebimento — a lista do formulário de NS lia N+1.
 */
async function readReceiptCeilings(receiptIds: readonly string[]): Promise<Map<string, ReceiptCeilingRead>> {
	const result = new Map<string, ReceiptCeilingRead>()
	if (receiptIds.length === 0) return result
	const ids = [...receiptIds]
	const inv = inventory()
	const [{ data: items, error: itemsError }, { data: receipts, error: receiptError }, { data: liquidacoes, error: liqError }] = await Promise.all([
		inv.from("goods_receipt_item").select("receipt_id, received_qty_base, unit_cost").in("receipt_id", ids),
		inv.from("goods_receipt").select("id, nfe_document_id").in("id", ids),
		finance().from("liquidacao").select("id, valor, goods_receipt_id").in("goods_receipt_id", ids),
	])
	if (itemsError) throw new Error(`Erro ao ler os itens do recebimento: ${itemsError.message}`)
	if (receiptError) throw new Error(`Erro ao ler o recebimento: ${receiptError.message}`)
	if (liqError) throw new Error(`Erro ao ler as liquidações do recebimento: ${liqError.message}`)

	const nfeIds = [
		...new Set(((receipts ?? []) as Array<{ nfe_document_id: string | null }>).map((r) => r.nfe_document_id).filter((id): id is string => id != null)),
	]
	const nfeTotalById = new Map<string, number>()
	if (nfeIds.length > 0) {
		const { data: nfes, error } = await inv.from("nfe_document").select("id, total_value").in("id", nfeIds)
		if (error) throw new Error(`Erro ao ler a NF-e do recebimento: ${error.message}`)
		for (const nfe of (nfes ?? []) as Array<{ id: string; total_value: number | string | null }>) {
			if (nfe.total_value != null) nfeTotalById.set(nfe.id, Number(nfe.total_value))
		}
	}

	const itemsByReceipt = new Map<string, { receivedQtyBase: number; unitCost: number | null }[]>()
	for (const item of (items ?? []) as Array<{ receipt_id: string; received_qty_base: number; unit_cost: number | null }>) {
		const list = itemsByReceipt.get(item.receipt_id) ?? []
		list.push({ receivedQtyBase: Number(item.received_qty_base), unitCost: item.unit_cost != null ? Number(item.unit_cost) : null })
		itemsByReceipt.set(item.receipt_id, list)
	}
	const liquidatedByReceipt = new Map<string, { total: number; count: number }>()
	for (const row of (liquidacoes ?? []) as Array<{ valor: number | string; goods_receipt_id: string }>) {
		const acc = liquidatedByReceipt.get(row.goods_receipt_id) ?? { total: 0, count: 0 }
		liquidatedByReceipt.set(row.goods_receipt_id, { total: acc.total + Number(row.valor), count: acc.count + 1 })
	}

	for (const receipt of (receipts ?? []) as Array<{ id: string; nfe_document_id: string | null }>) {
		const nfeTotal = receipt.nfe_document_id ? (nfeTotalById.get(receipt.nfe_document_id) ?? null) : null
		const liquidated = liquidatedByReceipt.get(receipt.id) ?? { total: 0, count: 0 }
		result.set(receipt.id, {
			ceiling: receiptLiquidationCeiling(itemsByReceipt.get(receipt.id) ?? [], nfeTotal),
			alreadyLiquidated: roundToCents(liquidated.total),
			liquidationCount: liquidated.count,
		})
	}
	return result
}

/** Pendência que a liquidação registrada deixa — a lista da execução as recolhe. */
export type LiquidationPendingKind = "liquidacao_sem_recebimento" | "recebimento_sem_custo"

/**
 * O empenho citado pela liquidação é da unidade que liquida — lido da LINHA, nunca
 * do corpo. A busca já filtra pela unidade: empenho inexistente e empenho de outra
 * OM respondem a mesma coisa, para a checagem não virar oráculo de ids alheios.
 */
async function assertEmpenhoOfUnit(unitId: number, empenhoId: string): Promise<void> {
	const { data: row, error } = await finance().from("empenho").select("id").eq("id", empenhoId).eq("unit_id", unitId).maybeSingle()
	if (error) throw new Error(`Erro ao conferir o empenho: ${error.message}`)
	if (!row) throw new Error("Empenho não encontrado nesta unidade")
}

/** A liquidação paga pela OB é da unidade que paga — mesma regra, mesmo sigilo. */
async function assertLiquidacaoOfUnit(unitId: number, liquidacaoId: string): Promise<void> {
	const { data: row, error } = await finance().from("liquidacao").select("id").eq("id", liquidacaoId).eq("unit_id", unitId).maybeSingle()
	if (error) throw new Error(`Erro ao conferir a liquidação: ${error.message}`)
	if (!row) throw new Error("Liquidação não encontrada nesta unidade")
}

/** Bruto, retenções e pagamentos de uma NS — a base do teto da OB e da dedução. */
async function readLiquidacaoBalance(liquidacaoId: string) {
	const fin = finance()
	const [{ data: liq, error }, { data: deductions, error: dedError }, { data: pagamentos, error: pagError }] = await Promise.all([
		fin.from("liquidacao").select("valor").eq("id", liquidacaoId).maybeSingle(),
		fin.from("liquidacao_deduction").select("amount, paid_on").eq("liquidacao_id", liquidacaoId),
		fin.from("pagamento").select("valor").eq("liquidacao_id", liquidacaoId),
	])
	if (error || dedError || pagError) throw new Error(`Erro ao ler o saldo da liquidação: ${(error ?? dedError ?? pagError)?.message}`)
	if (!liq) throw new Error("Liquidação não encontrada nesta unidade")
	return liquidationNetBalance({
		bruto: Number(liq.valor),
		deducoes: ((deductions ?? []) as Array<{ amount: number | string; paid_on: string | null }>).map((d) => ({
			valor: Number(d.amount),
			recolhidaEm: d.paid_on,
		})),
		pagamentos: ((pagamentos ?? []) as Array<{ valor: number | string }>).map((p) => Number(p.valor)),
	})
}

/** Registra a NS. O banco garante que não excede o empenho vigente. */
/**
 * O vínculo da liquidação com recebimento e NF-e, conferido NO BANCO.
 *
 * `createLiquidacaoFn` gravava os ids que vinham no corpo da requisição sem
 * conferir nada: nem a unidade, nem se o recebimento foi efetivado, nem a
 * situação da nota. Era a SEGUNDA porta até o pagamento — a efetivação passa
 * pela consulta de situação na SEFAZ, a liquidação não passava. Uma nota
 * DENEGADA com `cStat` editado para 100, que o parser aceita (ele só confere a
 * coerência do arquivo), virava NS por aqui.
 *
 * Liquidação sem recebimento e sem nota segue permitida: é o caso do empenho
 * que não é de gênero alimentício. O que não pode é CITAR um recebimento ou uma
 * nota que não sustentam o pagamento.
 */
async function assertLiquidationLinks(
	unitId: number,
	empenhoId: string,
	goodsReceiptId: string | undefined,
	nfeDocumentId: string | undefined
): Promise<string | null> {
	const inv = inventory()
	let receipt: ReceiptForLiquidation | null = null
	let nfeId = nfeDocumentId ?? null

	if (goodsReceiptId) {
		const { data: row, error } = await inv
			.from("goods_receipt")
			.select("id, kitchen_id, status, definitive_at, nfe_document_id, empenho_id, fiscal_pending")
			.eq("id", goodsReceiptId)
			.maybeSingle()
		if (error) throw new Error(`Erro ao conferir o recebimento: ${error.message}`)
		if (!row) throw new Error("Recebimento não encontrado")

		const kitchenDb = getServerClient("kitchen")
		const { data: kitchenRow, error: kitchenError } = await kitchenDb.from("kitchen").select("unit_id, purchase_unit_id").eq("id", row.kitchen_id).maybeSingle()
		if (kitchenError) throw new Error(`Erro ao conferir a cozinha do recebimento: ${kitchenError.message}`)

		receipt = {
			unitId: resolvePurchaseUnitId({ unitId: kitchenRow?.unit_id ?? null, purchaseUnitId: kitchenRow?.purchase_unit_id ?? null }),
			status: row.status,
			definitiveAt: row.definitive_at,
			nfeDocumentId: row.nfe_document_id,
			empenhoId: row.empenho_id,
			fiscalPending: row.fiscal_pending === true,
		}
		nfeId = nfeId ?? (row.nfe_document_id as string | null)
	}

	let invoice: LiquidationLinkInput["invoice"] = null
	if (nfeId != null) {
		const { data: doc, error } = await inv
			.from("nfe_document")
			.select("id, unit_id, status, situation_result, situation_checked_at")
			.eq("id", nfeId)
			.maybeSingle()
		if (error) throw new Error(`Erro ao conferir a NF-e: ${error.message}`)
		if (!doc) throw new Error("NF-e não encontrada")
		invoice = {
			unitId: doc.unit_id == null ? null : Number(doc.unit_id),
			status: doc.status,
			situationResult: doc.situation_result,
			situationCheckedAt: doc.situation_checked_at,
		}
	}

	// A regra é pura e testada em `invoice-gate.ts`; aqui só se lê do banco.
	const problems = liquidationLinkProblems({ unitId, empenhoId, receipt, requestedNfeId: nfeDocumentId ?? null, invoice })
	if (problems.length > 0) throw new Error(problems.join("; "))
	return nfeId
}

export const createLiquidacaoFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			unitId: z.number().int().positive(),
			empenhoId: z.uuid(),
			numeroNs: z.string().min(1),
			data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			valor: z.number().positive(),
			goodsReceiptId: z.uuid().optional(),
			nfeDocumentId: z.uuid().optional(),
			observacao: z.string().optional(),
		})
	)
	.handler(async ({ data }) => {
		const ctx = await requireUnitScope(2, data.unitId)
		const { userId } = ctx
		const fin = finance()
		// O empenho é conferido contra a unidade ANTES de tudo: o guard acima prova só
		// que o chamador opera `data.unitId`, e o `empenhoId` vinha do corpo sem
		// vínculo nenhum com ela — a NS consumia o empenho de outra OM.
		await assertEmpenhoOfUnit(data.unitId, data.empenhoId)
		const nfeDocumentId = await assertLiquidationLinks(data.unitId, data.empenhoId, data.goodsReceiptId, data.nfeDocumentId)

		// Recebimento vinculado: a NS não passa o que chegou (Lei 4.320, art. 63, § 2º, III).
		// Sem recebimento a NS é aceita — despesa que não é gênero não passa pelo almoxarifado,
		// e o recebimento pode ser vinculado depois —, mas fica a pendência.
		const pendencias: LiquidationPendingKind[] = []
		if (data.goodsReceiptId) {
			const { ceiling, alreadyLiquidated } = await readReceiptCeiling(data.goodsReceiptId)
			const problem = liquidationExceedsReceiptProblem({ ceiling, alreadyLiquidated, valor: data.valor })
			if (problem) throw new Error(problem)
			if (ceiling.basis === "indeterminado") pendencias.push("recebimento_sem_custo")
		} else {
			pendencias.push("liquidacao_sem_recebimento")
		}

		return withSensitiveAudit(
			"createLiquidacaoFn",
			ctx,
			async () => {
				const { data: liquidacao, error } = await fin
					.from("liquidacao")
					.insert({
						unit_id: data.unitId,
						empenho_id: data.empenhoId,
						numero_ns: normalizeNsNumber(data.numeroNs),
						data: data.data,
						valor: data.valor,
						competencia: competenciaFromDate(data.data),
						goods_receipt_id: data.goodsReceiptId ?? null,
						// a nota do recebimento, conferida — nunca a do corpo da requisição sem checagem
						nfe_document_id: nfeDocumentId,
						observacao: data.observacao?.trim() || null,
						created_by: userId,
					})
					.select("id")
					.single()
				if (error || !liquidacao) {
					if (error?.code === "23505") throw new Error(`NS "${data.numeroNs}" já registrada nesta unidade`)
					if (error?.message?.includes("excede o empenho")) throw new Error(error.message)
					// o trigger repete o teto do recebimento sob lock: duas NS simultâneas do mesmo recebimento
					if (error?.message?.includes("excede o valor recebido")) {
						throw new Error(`${error.message}. Liquide só o que foi recebido (Lei 4.320, art. 63), ou vincule a NS a outro recebimento.`)
					}
					throw new Error(`Erro ao registrar liquidação: ${error?.message}`)
				}

				// O vínculo mora em finance.liquidacao.goods_receipt_id (N liquidações
				// por recebimento). O espelho em goods_receipt.liquidacao_id era um
				// update SEM checar unidade: a liquidação de uma unidade escrevia em
				// recebimento de outra, e o erro era engolido.
				return { liquidacaoId: liquidacao.id as string, pendencias }
			},
			// O número da NS vai normalizado: é assim que ele foi gravado, e o log tem que
			// casar com a linha que ele documenta.
			(result) => ({
				liquidacaoId: result.liquidacaoId,
				unitId: data.unitId,
				empenhoId: data.empenhoId,
				numeroNs: normalizeNsNumber(data.numeroNs),
				valor: data.valor,
			})
		)
	})

/** Registra a OB. O banco garante que não excede a liquidação. */
export const createPagamentoFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			unitId: z.number().int().positive(),
			liquidacaoId: z.uuid(),
			numeroOb: z.string().min(1),
			data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			valor: z.number().positive(),
			banco: z.string().optional(),
			agencia: z.string().optional(),
			conta: z.string().optional(),
		})
	)
	.handler(async ({ data }) => {
		const ctx = await requireUnitScope(2, data.unitId)
		const { userId } = ctx
		// Mesma porta da liquidação: `liquidacaoId` vem do corpo, e só o guard da
		// unidade informada deixava pagar a NS de outra OM.
		await assertLiquidacaoOfUnit(data.unitId, data.liquidacaoId)
		// Pré-checagem para a mensagem boa: a OB paga o LÍQUIDO (bruto − retenções). A decisão
		// que vale é a do trigger `check_pagamento_within_liquidacao`, sob lock.
		const balance = await readLiquidacaoBalance(data.liquidacaoId)
		const netProblem = paymentExceedsNetProblem(balance, data.valor)
		if (netProblem) throw new Error(netProblem)

		return withSensitiveAudit(
			"createPagamentoFn",
			ctx,
			async () => {
				const { data: pagamento, error } = await finance()
					.from("pagamento")
					.insert({
						unit_id: data.unitId,
						liquidacao_id: data.liquidacaoId,
						numero_ob: data.numeroOb.trim().toUpperCase(),
						data: data.data,
						valor: data.valor,
						banco: data.banco?.trim() || null,
						agencia: data.agencia?.trim() || null,
						conta: data.conta?.trim() || null,
						created_by: userId,
					})
					.select("id")
					.single()
				if (error || !pagamento) {
					if (error?.code === "23505") throw new Error(`OB "${data.numeroOb}" já registrada nesta unidade`)
					if (error?.message?.includes("excede a liquidação")) throw new Error(error.message)
					throw new Error(`Erro ao registrar pagamento: ${error?.message}`)
				}
				return { pagamentoId: pagamento.id as string }
			},
			// Banco, agência e conta ficam FORA: são dado do favorecido, e a operação já os
			// grava na linha do pagamento. O log identifica o documento, não o duplica.
			(result) => ({
				pagamentoId: result.pagamentoId,
				unitId: data.unitId,
				liquidacaoId: data.liquidacaoId,
				numeroOb: data.numeroOb.trim().toUpperCase(),
				valor: data.valor,
			})
		)
	})

/** Contas a pagar + prazo médio por fornecedor (liquidação → pagamento). */
export const fetchPaymentPanelFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireUnitScope(1, data.unitId)
		const fin = finance()

		const liquidacoes = await listLiquidacoesFn({ data: { unitId: data.unitId } })
		const empenhoIds = [...new Set(liquidacoes.map((l) => l.empenho_id))]
		const supplierByEmpenho = new Map<string, string>()
		if (empenhoIds.length > 0) {
			const { data: empenhos } = await fin.from("empenho").select("id, favorecido_nome, favorecido_cnpj").in("id", empenhoIds)
			for (const empenho of empenhos ?? []) {
				supplierByEmpenho.set(empenho.id, empenho.favorecido_nome ?? empenho.favorecido_cnpj ?? "(sem favorecido)")
			}
		}

		// prazo médio: liquidação → primeiro pagamento, por fornecedor
		const { data: pagamentos } = await fin.from("pagamento").select("liquidacao_id, data").eq("unit_id", data.unitId).limit(500)
		const firstPaymentByLiquidacao = new Map<string, string>()
		for (const pag of pagamentos ?? []) {
			const current = firstPaymentByLiquidacao.get(pag.liquidacao_id)
			if (!current || pag.data < current) firstPaymentByLiquidacao.set(pag.liquidacao_id, pag.data)
		}

		const daysBySupplier = new Map<string, number[]>()
		for (const liquidacao of liquidacoes) {
			const paidAt = firstPaymentByLiquidacao.get(liquidacao.id)
			if (!paidAt) continue
			const supplier = supplierByEmpenho.get(liquidacao.empenho_id) ?? "(sem favorecido)"
			const days = Math.round((Date.parse(`${paidAt}T00:00:00Z`) - Date.parse(`${liquidacao.data}T00:00:00Z`)) / 86_400_000)
			const list = daysBySupplier.get(supplier) ?? []
			list.push(days)
			daysBySupplier.set(supplier, list)
		}

		return {
			// "a pagar" é ao CREDOR, pelo líquido; a retenção vai em `pendingRemittances`
			openLiquidations: liquidacoes
				.filter((l) => l.a_pagar > 0)
				.map((l) => ({ ...l, fornecedor: supplierByEmpenho.get(l.empenho_id) ?? "(sem favorecido)" }))
				.sort((a, b) => (b.dias_em_aberto ?? 0) - (a.dias_em_aberto ?? 0)),
			// retenções registradas e ainda não recolhidas (DARF/DAR/GPS a emitir ou pagar)
			pendingRemittances: liquidacoes.flatMap((l) =>
				l.deductions
					.filter((d) => d.paid_on == null)
					.map((d) => ({ ...d, numero_ns: l.numero_ns, fornecedor: supplierByEmpenho.get(l.empenho_id) ?? "(sem favorecido)" }))
			),
			averageDays: [...daysBySupplier.entries()]
				.map(([fornecedor, days]) => ({
					fornecedor,
					dias: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
					amostras: days.length,
				}))
				.sort((a, b) => b.dias - a.dias),
		}
	})

// ============================================================================
// Recebimentos que sustentam a NS (tarefa 5.3)
// ============================================================================

export interface ReceiptForLiquidationOption {
	id: string
	kitchenId: number
	definitiveAt: string | null
	nfeDocumentId: string | null
	/** Teto da NS por este recebimento; `null` quando indeterminado (item sem custo e sem NF-e). */
	teto: number | null
	tetoBase: ReceiptLiquidationCeiling["basis"]
	jaLiquidado: number
	/** O que ainda cabe liquidar por ele (`null` quando o teto é indeterminado). */
	saldo: number | null
}

/**
 * Recebimentos atestados vinculados ao empenho, com o teto de cada um. É a lista do
 * formulário de NS: escolher o recebimento preenche o valor pelo que chegou.
 */
export const listReceiptsForLiquidationFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive(), empenhoId: z.uuid() }))
	.handler(async ({ data }): Promise<ReceiptForLiquidationOption[]> => {
		await requireUnitScope(1, data.unitId)
		await assertEmpenhoOfUnit(data.unitId, data.empenhoId)

		const { data: receipts, error } = await inventory()
			.from("goods_receipt")
			.select("id, kitchen_id, status, definitive_at, nfe_document_id")
			.eq("empenho_id", data.empenhoId)
			// atestado = efetivado: a recusa grava rejected_at, e o banco impede definitive_at nela
			// (20260926205000). O filtro vai NA consulta, antes do limite: filtrar depois deixava
			// rascunhos ocuparem o limite e esconderem os atestados.
			.not("definitive_at", "is", null)
			.order("definitive_at", { ascending: false, nullsFirst: false })
			.limit(100)
		if (error) throw new Error(`Erro ao listar os recebimentos do empenho: ${error.message}`)

		const attested = (receipts ?? []) as Array<{ id: string; kitchen_id: number; definitive_at: string | null; nfe_document_id: string | null }>
		const ceilings = await readReceiptCeilings(attested.map((row) => row.id))
		return attested.map((row) => {
			const read = ceilings.get(row.id) ?? { ceiling: receiptLiquidationCeiling([], null), alreadyLiquidated: 0, liquidationCount: 0 }
			return {
				id: row.id,
				kitchenId: Number(row.kitchen_id),
				definitiveAt: row.definitive_at,
				nfeDocumentId: row.nfe_document_id,
				teto: read.ceiling.value,
				tetoBase: read.ceiling.basis,
				jaLiquidado: read.alreadyLiquidated,
				saldo: read.ceiling.value == null ? null : Math.max(0, roundToCents(read.ceiling.value - read.alreadyLiquidated)),
			}
		})
	})

// ============================================================================
// Deduções (retenções) da NS
// ============================================================================

const optionalTrimmed = z
	.string()
	.trim()
	.transform((value) => (value === "" ? null : value))
	.nullable()
	.optional()

/**
 * Registra uma retenção na NS (IR, CSLL, COFINS, PIS/PASEP, INSS, ISS). A partir dela a
 * OB paga o líquido. O banco recusa a retenção que, somada ao já pago, passaria o bruto.
 */
export const addLiquidacaoDeductionFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			unitId: z.number().int().positive(),
			liquidacaoId: z.uuid(),
			kind: z.enum(DEDUCTION_KINDS),
			amount: z.number().positive(),
			documentKind: z.enum(DEDUCTION_DOCUMENT_KINDS).nullable().optional(),
			documentNumber: optionalTrimmed,
			revenueCode: optionalTrimmed,
			paidOn: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/)
				.nullable()
				.optional(),
			notes: optionalTrimmed,
		})
	)
	.handler(async ({ data }) => {
		const ctx = await requireUnitScope(2, data.unitId)
		await assertLiquidacaoOfUnit(data.unitId, data.liquidacaoId)
		const balance = await readLiquidacaoBalance(data.liquidacaoId)
		const problem = deductionExceedsProblem(balance, data.amount)
		if (problem) throw new Error(problem)

		return withSensitiveAudit(
			"addLiquidacaoDeductionFn",
			ctx,
			async () => {
				const { data: row, error } = await finance()
					.from("liquidacao_deduction")
					.insert({
						liquidacao_id: data.liquidacaoId,
						kind: data.kind,
						amount: data.amount,
						document_kind: data.documentKind ?? null,
						document_number: data.documentNumber?.toUpperCase() ?? null,
						revenue_code: data.revenueCode ?? null,
						paid_on: data.paidOn ?? null,
						notes: data.notes ?? null,
						created_by: ctx.userId,
					})
					.select("id")
					.single()
				if (error || !row) {
					if (error?.message?.includes("Dedução excede")) throw new Error(`${error.message}. Registre a retenção antes da OB, ou corrija o valor.`)
					throw new Error(`Erro ao registrar a dedução: ${error?.message}`)
				}
				return { deductionId: row.id as string }
			},
			(result) => ({ deductionId: result.deductionId, unitId: data.unitId, liquidacaoId: data.liquidacaoId, kind: data.kind, amount: data.amount })
		)
	})

/** A retenção da NS, conferida contra a unidade pela liquidação — nunca pelo corpo. */
async function readDeductionOfUnit(
	unitId: number,
	deductionId: string
): Promise<{ id: string; liquidacao_id: string; paid_on: string | null; document_number: string | null }> {
	const fin = finance()
	const { data: row, error } = await fin.from("liquidacao_deduction").select("id, liquidacao_id, paid_on, document_number").eq("id", deductionId).maybeSingle()
	if (error) throw new Error(`Erro ao conferir a dedução: ${error.message}`)
	if (!row) throw new Error("Dedução não encontrada nesta unidade")
	await assertLiquidacaoOfUnit(unitId, row.liquidacao_id).catch(() => {
		throw new Error("Dedução não encontrada nesta unidade")
	})
	return row
}

/** Registra o recolhimento da retenção: o DARF/DAR/GPS e a data em que foi pago. */
export const registerDeductionPaymentFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			unitId: z.number().int().positive(),
			deductionId: z.uuid(),
			documentKind: z.enum(DEDUCTION_DOCUMENT_KINDS),
			documentNumber: z.string().trim().min(1, "Informe o número do documento de recolhimento"),
			revenueCode: optionalTrimmed,
			paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		})
	)
	.handler(async ({ data }) => {
		const ctx = await requireUnitScope(2, data.unitId)
		const current = await readDeductionOfUnit(data.unitId, data.deductionId)
		const already = deductionPaymentProblem({ paidOn: current.paid_on, documentNumber: current.document_number })
		if (already) throw new Error(already)

		return withSensitiveAudit(
			"registerDeductionPaymentFn",
			ctx,
			async () => {
				// `paid_on is null` NA escrita: dois operadores registrando o mesmo recolhimento ao
				// mesmo tempo — o segundo não sobrescreve o DARF do primeiro.
				const { data: updated, error } = await finance()
					.from("liquidacao_deduction")
					.update({
						document_kind: data.documentKind,
						document_number: data.documentNumber.toUpperCase(),
						...(data.revenueCode ? { revenue_code: data.revenueCode } : {}),
						paid_on: data.paidOn,
					})
					.eq("id", data.deductionId)
					.is("paid_on", null)
					.select("id")
				if (error) throw new Error(`Erro ao registrar o recolhimento: ${error.message}`)
				if ((updated ?? []).length === 0) {
					const { data: now } = await finance().from("liquidacao_deduction").select("paid_on, document_number").eq("id", data.deductionId).maybeSingle()
					throw new Error(
						deductionPaymentProblem({ paidOn: now?.paid_on ?? "outra data", documentNumber: now?.document_number ?? null }) ??
							"Esta retenção já foi recolhida; o registro não é sobrescrito."
					)
				}
			},
			() => ({ deductionId: data.deductionId, unitId: data.unitId, documentKind: data.documentKind, paidOn: data.paidOn })
		)
	})

/**
 * Apaga a retenção lançada por engano. Recolhida não se apaga: o DARF foi pago, e o
 * valor que saiu do credor tem de continuar explicado.
 */
export const deleteLiquidacaoDeductionFn = createServerFn({ method: "POST" })
	.validator(z.object({ unitId: z.number().int().positive(), deductionId: z.uuid() }))
	.handler(async ({ data }) => {
		const ctx = await requireUnitScope(2, data.unitId)
		const row = await readDeductionOfUnit(data.unitId, data.deductionId)
		if (row.paid_on != null) throw new Error("Retenção já recolhida não se apaga. Se o DARF foi pago a mais, registre a restituição no SIAFI.")
		// Sem a retenção o líquido SOBE, então apagar nunca fura o teto da OB: nada a conferir.

		return withSensitiveAudit(
			"deleteLiquidacaoDeductionFn",
			ctx,
			async () => {
				const { error } = await finance().from("liquidacao_deduction").delete().eq("id", data.deductionId).is("paid_on", null)
				if (error) throw new Error(`Erro ao apagar a dedução: ${error.message}`)
			},
			() => ({ deductionId: data.deductionId, unitId: data.unitId, liquidacaoId: row.liquidacao_id })
		)
	})
