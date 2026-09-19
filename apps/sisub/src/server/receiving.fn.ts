/**
 * @module receiving.fn
 * Recebimento físico em dois estágios (Lei 14.133, art. 140): draft →
 * provisional → definitive/divergent. Só a efetivação do definitivo (função
 * SQL atômica) cria lotes + movimentos e atualiza o status da OF.
 *
 * O lote é filho da linha do item (`goods_receipt_item_lot`): uma entrega traz
 * caixas de validades diferentes do mesmo item, e é a validade que dirige o
 * FEFO. A temperatura aferida também mora no lote — as caixas congeladas e as
 * resfriadas da mesma entrega podem chegar em condições diferentes. Medir é
 * opcional e nunca bloqueia; fora da faixa vira divergência com registro de
 * quem aceitou.
 *
 * CLIENT: getServerClient (service role, schemas inventory/kitchen/procurement).
 * AUTH: `storage` nível 2 (provisório), nível 3 (definitivo).
 * @domain kitchen
 * @migration 20260901120200_goods_receipt_lots
 */

import {
	type ConservationClass,
	divergesFromInvoice,
	isReceiptEditable,
	isTemperatureOutOfRange,
	matchScanToLine,
	parseNfeAccessKey,
	type ReceiptLineForScan,
	requiresDivergenceReason,
	temperatureDivergenceReason,
	temperatureVerdict,
	unitCostFromNfe,
} from "@iefa/sisub-domain/operations"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { invoiceSituationProblem } from "@/lib/invoice-gate"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas do módulo inventory ainda fora dos tipos gerados até o regen pós-migration
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const inventory = () => getServerClient("inventory") as unknown as LooseClient
const procurement = () => getServerClient("procurement") as unknown as LooseClient
const kitchen = () => getServerClient("kitchen") as unknown as LooseClient

const IsoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.nullable()

/** Recebimento já efetivado não aceita mais escrita — nem de lote. */
async function requireOpenReceipt(receiptId: string, level: 2 | 3) {
	const inv = inventory()
	const { data: receipt } = await inv.from("goods_receipt").select("id, status, kitchen_id").eq("id", receiptId).maybeSingle()
	if (!receipt) throw new Error("Recebimento não encontrado")
	const auth = await requireStorageForKitchen(level, Number(receipt.kitchen_id))
	// `divergent` e `rejected` JÁ passaram pela efetivação (o ledger foi gravado
	// ou o recebimento foi recusado): aceitar escrita neles mudava o termo e o
	// valor sugerido de liquidação depois do fato. A UI já bloqueava; a API não.
	if (!isReceiptEditable(receipt.status as string)) throw new Error("Recebimento já efetivado — não pode ser alterado")
	return { receipt, ...auth }
}

/** Sobe da linha do item até o recebimento (o guard é por cozinha). */
async function receiptIdForItem(receiptItemId: string): Promise<string> {
	const { data: item } = await inventory().from("goods_receipt_item").select("receipt_id").eq("id", receiptItemId).maybeSingle()
	if (!item) throw new Error("Linha do recebimento não encontrada")
	return item.receipt_id as string
}

/** Sobe da linha do lote até o recebimento, para autorizar por cozinha. */
async function receiptIdForLotItem(receiptItemId: string): Promise<string> {
	const { data: item } = await inventory().from("goods_receipt_item").select("receipt_id").eq("id", receiptItemId).maybeSingle()
	if (!item) throw new Error("Item do recebimento não encontrado")
	return item.receipt_id as string
}

/**
 * Faixa de temperatura exigida pela especificação de compra da linha.
 * Sem purchase_item na linha, cai na especificação padrão do insumo — a mesma
 * resolução que `finalize_goods_receipt` faz para gravar a classe no lote.
 */
async function requiredRangeFor(
	purchaseItemId: string | null,
	ingredientId: string | null
): Promise<{ minC: number | null; maxC: number | null; conservationClass: ConservationClass | null }> {
	const proc = procurement()
	const columns = "conservation_class, storage_temp_min_c, storage_temp_max_c"

	let spec: Record<string, unknown> | null = null
	if (purchaseItemId) {
		const { data } = await proc.from("purchase_item").select(columns).eq("id", purchaseItemId).maybeSingle()
		spec = data ?? null
	}
	if (!spec && ingredientId) {
		const { data } = await proc
			.from("purchase_item_ingredient")
			.select(`purchase_item:purchase_item_id (${columns})`)
			.eq("ingredient_id", ingredientId)
			.eq("is_default", true)
			.maybeSingle()
		spec = (data as { purchase_item?: Record<string, unknown> } | null)?.purchase_item ?? null
	}

	return {
		minC: spec?.storage_temp_min_c != null ? Number(spec.storage_temp_min_c) : null,
		maxC: spec?.storage_temp_max_c != null ? Number(spec.storage_temp_max_c) : null,
		conservationClass: (spec?.conservation_class as ConservationClass | undefined) ?? null,
	}
}

/**
 * Cria o recebimento a partir de uma NF-e conferida: um goods_receipt_item por
 * nfe_item resolvido, e um lote inicial por item com o rastro da nota
 * (lote/validade), que o conferente desdobra em vários se a carga vier
 * fracionada.
 */
export const createReceiptFromNfeFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			nfeDocumentId: z.uuid(),
			supplyOrderId: z.uuid().optional(),
			empenhoId: z.uuid().optional(),
		})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireStorageForKitchen(2, data.kitchenId)
		const inv = inventory()

		// refs cruzadas precisam ser da MESMA cozinha (review: receipt podia
		// apontar NF-e/OF de outra cozinha e movimentar o ledger errado)
		const { data: doc } = await inv.from("nfe_document").select("kitchen_id").eq("id", data.nfeDocumentId).maybeSingle()
		if (!doc) throw new Error("NF-e não encontrada")
		if (doc.kitchen_id != null && Number(doc.kitchen_id) !== data.kitchenId) {
			throw new Error("NF-e pertence a outra cozinha")
		}
		if (data.supplyOrderId) {
			const proc = procurement()
			const { data: order } = await proc.from("supply_order").select("kitchen_id").eq("id", data.supplyOrderId).maybeSingle()
			if (!order || Number(order.kitchen_id) !== data.kitchenId) throw new Error("OF não encontrada ou de outra cozinha")
		}

		const { data: items, error: itemsError } = await inv
			.from("nfe_item")
			.select("id, ingredient_id, ingredient_item_id, purchase_item_id, matched_qty_base, unit_price, commercial_qty, lot_code, expiry_date, match_status")
			.eq("nfe_document_id", data.nfeDocumentId)
		if (itemsError) throw new Error(`Erro ao carregar itens da NF-e: ${itemsError.message}`)

		const resolvable = (items ?? []).filter((item: { ingredient_id: string | null }) => item.ingredient_id != null)
		if (resolvable.length === 0) {
			throw new Error("Nenhum item da NF-e está vinculado a um insumo — resolva o matching antes de receber")
		}
		// Linha sem insumo resolvido SUMIA do recebimento (ia como `skipped`): o
		// conferente recebia uma nota de 6 linhas com 5 na tela e nada dizia que a
		// sexta existia. Enquanto a linha não casada não tem onde morar no
		// recebimento (goods_receipt_item exige ingrediente XOR preparação), o
		// caminho honesto é recusar apontando quais faltam.
		const unresolved = (items ?? []).filter((item: { ingredient_id: string | null }) => item.ingredient_id == null)
		if (unresolved.length > 0) {
			const descriptions = unresolved
				.slice(0, 5)
				.map((item: { nfe_item_id?: string; id: string }) => item.id)
				.join(", ")
			throw new Error(
				`${unresolved.length} item(ns) da NF-e ainda sem insumo vinculado — resolva o matching antes de receber (itens: ${descriptions}${unresolved.length > 5 ? "…" : ""})`
			)
		}

		const { data: receipt, error } = await inv
			.from("goods_receipt")
			.insert({
				kitchen_id: data.kitchenId,
				nfe_document_id: data.nfeDocumentId,
				supply_order_id: data.supplyOrderId ?? null,
				empenho_id: data.empenhoId ?? null,
				created_by: userId,
			})
			.select("id")
			.single()
		if (error || !receipt) {
			if (error?.code === "23505") throw new Error("Esta NF-e já tem um recebimento em andamento ou efetivado")
			throw new Error(`Erro ao criar recebimento: ${error?.message}`)
		}

		type NfeItemRow = {
			id: string
			ingredient_id: string
			ingredient_item_id: string | null
			purchase_item_id: string | null
			matched_qty_base: number | null
			unit_price: number | null
			commercial_qty: number | null
			lot_code: string | null
			expiry_date: string | null
		}

		const prepared = (resolvable as NfeItemRow[]).map((item) => {
			const invoiced = item.matched_qty_base
			// Custo na unidade BASE: a nota preça a embalagem, o ledger valora o gênero.
			// Ver `unitCostFromNfe` — extraída para poder ser testada.
			const unitCostBase = unitCostFromNfe({ invoicedQtyBase: invoiced, unitPrice: item.unit_price, commercialQty: item.commercial_qty })
			return {
				row: {
					receipt_id: receipt.id,
					nfe_item_id: item.id,
					ingredient_id: item.ingredient_id,
					frozen_preparation_id: null,
					ingredient_item_id: item.ingredient_item_id,
					purchase_item_id: item.purchase_item_id,
					invoiced_qty_base: invoiced,
					received_qty_base: invoiced ?? 0,
					unit_cost: unitCostBase,
				},
				lotCode: item.lot_code,
				expiryDate: item.expiry_date,
			}
		})

		const { data: inserted, error: insertError } = await inv
			.from("goods_receipt_item")
			.insert(prepared.map((entry) => entry.row))
			.select("id, nfe_item_id, received_qty_base, unit_cost")
		if (insertError || !inserted) {
			await inv.from("goods_receipt").delete().eq("id", receipt.id)
			throw new Error(`Erro ao criar itens do recebimento: ${insertError?.message}`)
		}

		// Lote inicial com o rastro da nota. Quantidade zero não gera lote: o
		// check `quantity_base > 0` recusaria, e um item faturado com zero é
		// justamente o que o conferente ainda vai preencher.
		const byNfeItem = new Map(prepared.map((entry) => [entry.row.nfe_item_id, entry]))
		const lotRows = (inserted as Array<{ id: string; nfe_item_id: string; received_qty_base: number; unit_cost: number | null }>)
			.filter((item) => Number(item.received_qty_base) > 0)
			.map((item, index) => {
				const source = byNfeItem.get(item.nfe_item_id)
				return {
					receipt_item_id: item.id,
					lot_code: source?.lotCode?.trim() || `SEM-LOTE-${new Date().toISOString().slice(0, 10)}-${index + 1}`,
					expiry_date: source?.expiryDate ?? null,
					quantity_base: Number(item.received_qty_base),
					unit_cost: item.unit_cost,
				}
			})

		if (lotRows.length > 0) {
			const { error: lotError } = await inv.from("goods_receipt_item_lot").insert(lotRows)
			if (lotError) {
				await inv.from("goods_receipt").delete().eq("id", receipt.id)
				throw new Error(`Erro ao criar lotes do recebimento: ${lotError.message}`)
			}
		}

		// `skipped` fica em zero por construção: nota com linha não casada não
		// chega a criar recebimento.
		return { receiptId: receipt.id as string, itemsCount: prepared.length, skipped: 0 }
	})

/** Conferência da LINHA: quantidade física + motivo de divergência. Lote é escrita à parte. */
export const updateReceiptItemFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			receiptItemId: z.uuid(),
			receivedQtyBase: z.number().nonnegative(),
			divergenceReason: z.string().nullable().optional(),
		})
	)
	.handler(async ({ data }) => {
		await requireAuthWithPermission("storage", 2)
		const inv = inventory()

		const { data: item, error: itemError } = await inv
			.from("goods_receipt_item")
			.select("id, invoiced_qty_base, received_qty_base, receipt_id")
			.eq("id", data.receiptItemId)
			.maybeSingle()
		if (itemError) throw new Error(`Erro ao carregar o item: ${itemError.message}`)
		if (!item) throw new Error("Item do recebimento não encontrado")
		const { userId } = await requireOpenReceipt(item.receipt_id as string, 2)

		const invoiced = item.invoiced_qty_base != null ? Number(item.invoiced_qty_base) : null
		const diverges = divergesFromInvoice(invoiced, data.receivedQtyBase)
		if (requiresDivergenceReason(invoiced, data.receivedQtyBase, data.divergenceReason)) {
			throw new Error("Quantidade física difere da faturada — informe o motivo da divergência")
		}

		// A quantidade da linha tem UMA fonte: os eventos. Escrever o total direto
		// fazia a próxima leitura recalcular da soma dos eventos e apagar a edição —
		// e a edição sumia sem rastro no termo. Mudou o total, vira evento `typed`
		// (o operador dizendo o total), e a linha é recalculada a partir dele.
		if (Number(item.received_qty_base) !== data.receivedQtyBase) {
			const { error: eventError } = await inv.from("receipt_scan_event").insert({
				receipt_id: item.receipt_id,
				receipt_item_id: data.receiptItemId,
				client_event_id: crypto.randomUUID(),
				method: "typed",
				quantity_base: data.receivedQtyBase,
				created_by: userId,
			})
			if (eventError) throw new Error(`Erro ao registrar a quantidade: ${eventError.message}`)
		}
		const { error } = await inv
			.from("goods_receipt_item")
			.update({ divergence_reason: diverges ? (data.divergenceReason?.trim() ?? null) : null })
			.eq("id", data.receiptItemId)
		if (error) throw new Error(`Erro ao atualizar item: ${error.message}`)
		await syncConfirmedQuantity(data.receiptItemId)
	})

/**
 * Cria ou atualiza um lote da linha.
 *
 * A temperatura NÃO bloqueia: fora da faixa exigida, o lote é gravado com
 * motivo de divergência preenchido e o registro de quem aceitou. Travar aqui
 * faria a cozinha sem termômetro calibrado digitar um número plausível — pior
 * que a ausência, porque parece prova.
 */
export const upsertReceiptLotFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			lotId: z.uuid().optional(),
			receiptItemId: z.uuid(),
			lotCode: z.string().trim().min(1, "Informe o código do lote"),
			expiryDate: IsoDate.optional(),
			quantityBase: z.number().positive("Quantidade do lote precisa ser maior que zero"),
			unitCost: z.number().nonnegative().nullable().optional(),
			measuredTemperatureC: z.number().nullable().optional(),
			/** Confirmação explícita de aceite quando a temperatura sai da faixa. */
			acceptOutOfRange: z.boolean().optional(),
		})
	)
	.handler(async ({ data }) => {
		const receiptId = await receiptIdForLotItem(data.receiptItemId)
		const { userId } = await requireOpenReceipt(receiptId, 2)
		const inv = inventory()

		const { data: item } = await inv.from("goods_receipt_item").select("id, purchase_item_id, ingredient_id").eq("id", data.receiptItemId).single()
		if (!item) throw new Error("Item do recebimento não encontrado")

		const range = await requiredRangeFor(item.purchase_item_id ?? null, item.ingredient_id ?? null)
		const measured = data.measuredTemperatureC ?? null
		const verdict = temperatureVerdict(measured, range)
		const outOfRange = isTemperatureOutOfRange(verdict)

		if (outOfRange && !data.acceptOutOfRange) {
			throw new Error(`${temperatureDivergenceReason(measured as number, range)} Confirme o aceite para registrar mesmo assim.`)
		}

		const payload = {
			receipt_item_id: data.receiptItemId,
			lot_code: data.lotCode.trim(),
			expiry_date: data.expiryDate ?? null,
			quantity_base: data.quantityBase,
			unit_cost: data.unitCost ?? null,
			measured_temperature_c: measured,
			divergence_reason: outOfRange ? temperatureDivergenceReason(measured as number, range) : null,
			temperature_ack_by: outOfRange ? userId : null,
			temperature_ack_at: outOfRange ? new Date().toISOString() : null,
		}

		const query = data.lotId ? inv.from("goods_receipt_item_lot").update(payload).eq("id", data.lotId) : inv.from("goods_receipt_item_lot").insert(payload)
		const { error } = await query
		if (error) {
			if (error.code === "23505") throw new Error(`Lote "${data.lotCode}" já lançado nesta linha`)
			throw new Error(`Erro ao gravar lote: ${error.message}`)
		}
		return { verdict, outOfRange }
	})

export const deleteReceiptLotFn = createServerFn({ method: "POST" })
	.validator(z.object({ lotId: z.uuid(), receiptItemId: z.uuid() }))
	.handler(async ({ data }) => {
		const receiptId = await receiptIdForLotItem(data.receiptItemId)
		await requireOpenReceipt(receiptId, 2)
		const { error } = await inventory().from("goods_receipt_item_lot").delete().eq("id", data.lotId).eq("receipt_item_id", data.receiptItemId)
		if (error) throw new Error(`Erro ao remover lote: ${error.message}`)
	})

/**
 * Competência para receber (Decreto 11.246/2022, art. 25).
 *
 * Nível de PBAC é pré-condição, não competência: o provisório é do FISCAL
 * designado, o definitivo é do GESTOR do contrato ou de membro de comissão.
 * Termo assinado por quem não tem competência vicia a liquidação apoiada nele.
 *
 * A designação pode vir de ato (boletim/portaria), do próprio empenho — caso
 * comum — ou de ato permanente da OM para recebimento de gêneros, que é o que
 * cobre a entrega sem contrato.
 */
async function requireDesignation(receiptId: string, userId: string, stage: "provisional" | "definitive"): Promise<string> {
	const inv = inventory()
	const { data: receipt } = await inv.from("goods_receipt").select("kitchen_id, empenho_id").eq("id", receiptId).maybeSingle()
	if (!receipt) throw new Error("Recebimento não encontrado")

	const kit = kitchen()
	const { data: kitchenRow } = await kit.from("kitchen").select("unit_id, purchase_unit_id").eq("id", receipt.kitchen_id).single()
	const unitId = kitchenRow?.purchase_unit_id ?? kitchenRow?.unit_id
	if (unitId == null) throw new Error("Cozinha sem unidade vinculada — não há como verificar a designação")

	const roles =
		stage === "provisional"
			? ["technical_inspector", "administrative_inspector", "sectoral_inspector", "manager", "committee_member"]
			: ["manager", "committee_member"]

	const { data: designationId } = await inv.rpc("find_designation", {
		p_person: userId,
		p_unit_id: Number(unitId),
		p_empenho_id: receipt.empenho_id ?? null,
		p_roles: roles,
	})
	if (!designationId) {
		throw new Error(
			stage === "provisional"
				? "Recebimento provisório exige designação vigente de fiscal (Decreto 11.246/2022, art. 25) — cadastre a designação na unidade"
				: "Recebimento definitivo exige designação vigente de gestor do contrato ou de comissão (Decreto 11.246/2022, art. 25)"
		)
	}
	return designationId as string
}

/**
 * A nota ainda vale?
 *
 * Sem coletor DF-e não há como saber que o emitente cancelou a nota depois da
 * importação — e efetivar (e depois liquidar) nota cancelada é pagamento sem
 * documento hábil (Lei 4.320, art. 63). Por isso a consulta de situação, feita
 * no portal da SEFAZ e registrada no sistema, precisa ser recente.
 */
async function assertInvoiceUsable(receiptId: string) {
	const inv = inventory()
	const { data: receipt, error: receiptError } = await inv.from("goods_receipt").select("nfe_document_id").eq("id", receiptId).maybeSingle()
	// Esta é a ÚNICA trava de autenticidade da cadeia. Se a leitura falha e o
	// erro some, `receipt` vem vazio e a falha passaria por "recebimento sem
	// nota" — e a nota nunca confirmada seria efetivada.
	if (receiptError) throw new Error(`Erro ao conferir a nota do recebimento: ${receiptError.message}`)
	if (!receipt) throw new Error("Recebimento não encontrado")
	if (!receipt.nfe_document_id) return // recebimento sem nota (guia, avulso)

	const { data: doc, error: docError } = await inv
		.from("nfe_document")
		.select("status, situation_result, situation_checked_at")
		.eq("id", receipt.nfe_document_id)
		.maybeSingle()
	if (docError) throw new Error(`Erro ao conferir a situação da NF-e: ${docError.message}`)
	// recebimento que aponta para nota que não se encontra NÃO é recebimento sem
	// nota: antes, este caso passava calado pela trava
	if (!doc) throw new Error("A NF-e deste recebimento não foi encontrada")

	// A MESMA regra da liquidação, de um lugar só (`invoice-gate.ts`).
	const problem = invoiceSituationProblem({
		status: doc.status,
		situationResult: doc.situation_result,
		situationCheckedAt: doc.situation_checked_at,
	})
	if (problem) throw new Error(problem)
}

/** Estágio 1: recebimento provisório (não movimenta estoque). */
export const setReceiptProvisionalFn = createServerFn({ method: "POST" })
	.validator(z.object({ receiptId: z.uuid() }))
	.handler(async ({ data }) => {
		const { data: receipt } = await inventory().from("goods_receipt").select("kitchen_id").eq("id", data.receiptId).maybeSingle()
		if (!receipt) throw new Error("Recebimento não encontrado")
		const { userId } = await requireStorageForKitchen(2, Number(receipt.kitchen_id))
		const designationId = await requireDesignation(data.receiptId, userId, "provisional")
		const { error } = await inventory()
			.from("goods_receipt")
			.update({
				status: "provisional",
				provisional_by: userId,
				provisional_at: new Date().toISOString(),
				provisional_designation_id: designationId,
			})
			.eq("id", data.receiptId)
			.eq("status", "draft")
		if (error) throw new Error(`Erro no recebimento provisório: ${error.message}`)
	})

/** Estágio 2: efetivação atômica (função SQL) — lotes + movimentos + OF. */
export const finalizeReceiptFn = createServerFn({ method: "POST" })
	.validator(z.object({ receiptId: z.uuid() }))
	.handler(async ({ data }) => {
		const { data: receipt } = await inventory().from("goods_receipt").select("kitchen_id").eq("id", data.receiptId).maybeSingle()
		if (!receipt) throw new Error("Recebimento não encontrado")
		const { userId } = await requireStorageForKitchen(3, Number(receipt.kitchen_id))
		const designationId = await requireDesignation(data.receiptId, userId, "definitive")
		await assertInvoiceUsable(data.receiptId)

		const inv = inventory()
		// Divergência sem motivo não efetiva (art. 140: aceitar a menos é decisão
		// registrada, não silêncio). A edição da linha já exigia; a conferência por
		// leitura não passa por ela, e uma falta vinda só das leituras efetivava
		// como `definitive`, sem motivo e sem virar `divergent`.
		const { data: lines, error: linesError } = await inv
			.from("goods_receipt_item")
			.select("id, ingredient_id, invoiced_qty_base, received_qty_base, divergence_reason")
			.eq("receipt_id", data.receiptId)
		if (linesError) throw new Error(`Erro ao conferir as linhas: ${linesError.message}`)
		const unexplained = (
			(lines ?? []) as Array<{ ingredient_id: string | null; invoiced_qty_base: number | null; received_qty_base: number; divergence_reason: string | null }>
		).filter((line) =>
			requiresDivergenceReason(line.invoiced_qty_base == null ? null : Number(line.invoiced_qty_base), Number(line.received_qty_base), line.divergence_reason)
		)
		if (unexplained.length > 0) {
			const ids = [...new Set(unexplained.map((line) => line.ingredient_id).filter(Boolean))] as string[]
			const { data: names } = ids.length > 0 ? await kitchen().from("ingredient").select("description").in("id", ids) : { data: [] }
			const list = ((names ?? []) as Array<{ description: string }>)
				.map((row) => row.description)
				.slice(0, 5)
				.join(", ")
			throw new Error(
				`${unexplained.length} linha(s) diferem da nota sem motivo registrado${list ? ` (${list})` : ""} — informe o motivo da divergência antes de efetivar`
			)
		}
		// sem a designação gravada, o termo sairia sem quem efetivou
		const { error: designationError } = await inv.from("goods_receipt").update({ definitive_designation_id: designationId }).eq("id", data.receiptId)
		if (designationError) throw new Error(`Erro ao registrar a designação: ${designationError.message}`)

		const { data: result, error } = await inv.rpc("finalize_goods_receipt", { p_receipt_id: data.receiptId, p_user: userId })
		if (error) throw new Error(`Efetivação falhou: ${error.message}`)

		// Pendência fiscal: recebido a MENOR que o faturado deixa a nota dizendo
		// 100 e o estoque 90. Carta de correção não altera quantidade nem valor
		// (Ajuste SINIEF 07/05) — resolve-se por NF-e de devolução, nota
		// substituta ou glosa registrada, e até lá o recebimento não é liquidável.
		// Quem grava é `finalize_goods_receipt`, na mesma transação da efetivação
		// (migration 20260918210000); aqui só se lê para avisar o operador.
		const { data: finalized, error: readError } = await inv
			.from("goods_receipt")
			.select("fiscal_pending, fiscal_pending_value")
			.eq("id", data.receiptId)
			.single()
		if (readError) throw new Error(`Recebimento efetivado, mas não foi possível ler a pendência fiscal: ${readError.message}`)
		const shortfall = finalized.fiscal_pending ? Number(finalized.fiscal_pending_value ?? 0) : 0

		return { movements: Number(result?.[0]?.movements ?? 0), fiscalPendingValue: shortfall }
	})

/** Lista recebimentos da cozinha. */
export const listReceiptsFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const { data: receipts, error } = await inventory()
			.from("goods_receipt")
			.select("id, nfe_document_id, supply_order_id, status, provisional_at, definitive_at, created_at")
			.eq("kitchen_id", data.kitchenId)
			.order("created_at", { ascending: false })
			.limit(50)
		if (error) throw new Error(`Erro ao listar recebimentos: ${error.message}`)
		return receipts ?? []
	})

/** Detalhe do recebimento: itens + lotes + acondicionamento exigido (para conferência e termo). */
export const fetchReceiptFn = createServerFn({ method: "GET" })
	.validator(z.object({ receiptId: z.uuid() }))
	.handler(async ({ data }) => {
		await requireAuthWithPermission("storage", 1)
		const inv = inventory()
		const kit = getServerClient("kitchen") as unknown as LooseClient

		const { data: receipt, error } = await inv.from("goods_receipt").select("*").eq("id", data.receiptId).single()
		if (error || !receipt) throw new Error("Recebimento não encontrado")
		await requireStorageForKitchen(1, Number(receipt.kitchen_id))
		// Linhas e lotes lançam no erro: vazios, a conferência mostraria um
		// recebimento sem nada a conferir — e o termo sairia sem as linhas.
		const { data: items, error: itemsError } = await inv.from("goods_receipt_item").select("*").eq("receipt_id", data.receiptId)
		if (itemsError) throw new Error(`Erro ao carregar as linhas do recebimento: ${itemsError.message}`)

		const itemRows = (items ?? []) as Array<Record<string, unknown>>
		const itemIds = itemRows.map((item) => item.id as string)
		const { data: lots, error: lotsError } =
			itemIds.length > 0 ? await inv.from("goods_receipt_item_lot").select("*").in("receipt_item_id", itemIds) : { data: [], error: null }
		if (lotsError) throw new Error(`Erro ao carregar os lotes do recebimento: ${lotsError.message}`)
		const lotsByItem = new Map<string, Array<Record<string, unknown>>>()
		for (const lot of (lots ?? []) as Array<Record<string, unknown>>) {
			const key = lot.receipt_item_id as string
			const bucket = lotsByItem.get(key)
			if (bucket) bucket.push(lot)
			else lotsByItem.set(key, [lot])
		}

		const ingredientIds = [...new Set(itemRows.map((item) => item.ingredient_id).filter(Boolean))] as string[]
		const names = new Map<string, { description: string; measure_unit: string | null }>()
		if (ingredientIds.length > 0) {
			const { data: ings, error: ingError } = await kit.from("ingredient").select("id, description, measure_unit").in("id", ingredientIds)
			if (ingError) throw new Error(`Erro ao carregar os insumos: ${ingError.message}`)
			for (const ing of ings ?? []) names.set(ing.id, ing)
		}
		// GTINs vinculados aos itens (para a conferência por scanner)
		const skuIds = [...new Set(itemRows.map((item) => item.ingredient_item_id).filter(Boolean))] as string[]
		const gtinByItemId = new Map<string, string | null>()
		if (skuIds.length > 0) {
			const { data: skus, error: skuError } = await kit.from("ingredient_item").select("id, gtin").in("id", skuIds)
			if (skuError) throw new Error(`Erro ao carregar os códigos dos itens: ${skuError.message}`)
			for (const sku of skus ?? []) gtinByItemId.set(sku.id, sku.gtin)
		}

		// Acondicionamento exigido, por especificação de compra da linha.
		const purchaseItemIds = [...new Set(itemRows.map((item) => item.purchase_item_id).filter(Boolean))] as string[]
		const specById = new Map<string, Record<string, unknown>>()
		if (purchaseItemIds.length > 0) {
			const { data: specs } = await procurement()
				.from("purchase_item")
				.select(
					"id, conservation_class, storage_temp_min_c, storage_temp_max_c, package_type, package_net_content, package_net_content_unit, transport_requirement, min_shelf_life_days_on_delivery, delivery_conditioning"
				)
				.in("id", purchaseItemIds)
			for (const spec of (specs ?? []) as Array<Record<string, unknown>>) specById.set(spec.id as string, spec)
		}

		return {
			...receipt,
			items: itemRows.map((item) => ({
				...item,
				description: names.get(item.ingredient_id as string)?.description ?? "—",
				measure_unit: names.get(item.ingredient_id as string)?.measure_unit ?? null,
				gtin: item.ingredient_item_id ? (gtinByItemId.get(item.ingredient_item_id as string) ?? null) : null,
				conditioning: item.purchase_item_id ? (specById.get(item.purchase_item_id as string) ?? null) : null,
				lots: lotsByItem.get(item.id as string) ?? [],
			})),
		}
	})

// ────────────────────────────────────────────────────────────────────────────
// Conferência por leitura
// ────────────────────────────────────────────────────────────────────────────

/** Linhas do recebimento no formato que o casamento de leitura espera. */
async function scanLinesFor(receiptId: string) {
	const inv = inventory()
	const kit = kitchen()
	// Toda leitura aqui lança no erro: lista vazia vira "código não consta na
	// nota", e o conferente é mandado associar um código que já estava certo.
	const { data: items, error: itemsError } = await inv
		.from("goods_receipt_item")
		.select("id, nfe_item_id, ingredient_item_id, invoiced_qty_base, received_qty_base")
		.eq("receipt_id", receiptId)
	if (itemsError) throw new Error(`Erro ao carregar as linhas do recebimento: ${itemsError.message}`)
	const rows = (items ?? []) as Array<{
		id: string
		nfe_item_id: string | null
		ingredient_item_id: string | null
		invoiced_qty_base: number | null
		received_qty_base: number
	}>
	if (rows.length === 0) return []

	// o que a NOTA declara (cEAN, cEANTrib, qCom, qTrib)
	const nfeItemIds = rows.map((row) => row.nfe_item_id).filter((id): id is string => Boolean(id))
	const nfeById = new Map<string, { gtin: string | null; gtin_trib: string | null; commercial_qty: number | null; taxable_qty: number | null }>()
	if (nfeItemIds.length > 0) {
		const { data: nfeItems, error: nfeError } = await inv.from("nfe_item").select("id, gtin, gtin_trib, commercial_qty, taxable_qty").in("id", nfeItemIds)
		if (nfeError) throw new Error(`Erro ao carregar os itens da nota: ${nfeError.message}`)
		for (const item of nfeItems ?? []) nfeById.set(item.id, item)
	}

	// o que o CATÁLOGO conhece: GTIN do SKU + aliases aprendidos na operação
	const skuIds = rows.map((row) => row.ingredient_item_id).filter((id): id is string => Boolean(id))
	const catalogByItem = new Map<string, string[]>()
	const hierarchyByItem = new Map<string, string[]>()
	if (skuIds.length > 0) {
		const { data: skus, error: skuError } = await kit.from("ingredient_item").select("id, gtin").in("id", skuIds)
		if (skuError) throw new Error(`Erro ao carregar os códigos do catálogo: ${skuError.message}`)
		for (const sku of skus ?? []) {
			if (sku.gtin) catalogByItem.set(sku.id, [sku.gtin])
		}
		const gs1 = getServerClient("gs1_integration") as unknown as LooseClient
		const { data: aliases, error: aliasError } = await gs1
			.from("gtin_alias")
			.select("gtin, ingredient_item_id, status")
			.in("ingredient_item_id", skuIds)
			.neq("status", "rejected")
		if (aliasError) throw new Error(`Erro ao carregar os códigos aprendidos: ${aliasError.message}`)
		for (const alias of aliases ?? []) {
			catalogByItem.set(alias.ingredient_item_id, [...(catalogByItem.get(alias.ingredient_item_id) ?? []), alias.gtin])
		}
		// hierarquia de embalagem: caixa ↔ unidade do mesmo produto
		const knownGtins = [...catalogByItem.values()].flat()
		if (knownGtins.length > 0) {
			const { data: hierarchy, error: hierarchyError } = await gs1
				.from("gtin")
				.select("gtin, parent_gtin")
				.or(`gtin.in.(${knownGtins.join(",")}),parent_gtin.in.(${knownGtins.join(",")})`)
			if (hierarchyError) throw new Error(`Erro ao carregar a hierarquia de embalagens: ${hierarchyError.message}`)
			const nodes = (hierarchy ?? []) as Array<{ gtin: string; parent_gtin: string | null }>
			for (const [itemId, gtins] of catalogByItem) {
				const related: string[] = []
				for (const node of nodes) {
					const isChildOfKnown = node.parent_gtin != null && gtins.includes(node.parent_gtin)
					const isParentOfKnown = gtins.includes(node.gtin) && node.parent_gtin != null
					if (isChildOfKnown && !gtins.includes(node.gtin)) related.push(node.gtin)
					if (isParentOfKnown && node.parent_gtin != null && !gtins.includes(node.parent_gtin)) related.push(node.parent_gtin)
				}
				if (related.length > 0) hierarchyByItem.set(itemId, [...new Set(related)])
			}
		}
	}

	return rows.map((row) => {
		const nfe = row.nfe_item_id ? nfeById.get(row.nfe_item_id) : undefined
		return {
			receiptItemId: row.id,
			invoiceGtin: nfe?.gtin ?? null,
			invoiceGtinTrib: nfe?.gtin_trib ?? null,
			catalogGtins: row.ingredient_item_id ? (catalogByItem.get(row.ingredient_item_id) ?? []) : [],
			hierarchyGtins: row.ingredient_item_id ? (hierarchyByItem.get(row.ingredient_item_id) ?? []) : [],
			commercialQty: nfe?.commercial_qty != null ? Number(nfe.commercial_qty) : null,
			taxableQty: nfe?.taxable_qty != null ? Number(nfe.taxable_qty) : null,
			invoicedQtyBase: row.invoiced_qty_base != null ? Number(row.invoiced_qty_base) : null,
			confirmedQtyBase: Number(row.received_qty_base),
		} satisfies ReceiptLineForScan
	})
}

/**
 * Recalcula a linha a partir dos eventos — total e lotes — no banco, com o
 * recebimento e a linha travados (`inventory.sync_receipt_line`). Somar em
 * TypeScript lia os eventos e gravava o total sem trava: duas leituras
 * simultâneas gravavam um total velho, e os lotes nunca acompanhavam a
 * quantidade (toda entrega a menor travava a efetivação).
 */
async function syncConfirmedQuantity(receiptItemId: string): Promise<number> {
	const { data, error } = await inventory().rpc("sync_receipt_line", { p_receipt_item_id: receiptItemId })
	if (error) throw new Error(`Erro ao recalcular a linha: ${error.message}`)
	return Number(data ?? 0)
}

/**
 * Registra uma leitura na conferência.
 *
 * `clientEventId` vem do cliente e é único por recebimento: retry de rede com o
 * leitor na mão é rotina, e sem ele a mesma caixa entra duas vezes.
 */
export const recordScanEventFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			receiptId: z.uuid(),
			clientEventId: z.string().min(8).max(64),
			rawCode: z.string().max(200),
			gtin: z.string().max(14).optional(),
			lotCode: z.string().max(40).optional(),
			expiryDate: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/)
				.optional(),
			/** "Ler uma e informar ×N": quantas embalagens esta leitura representa. */
			multiplier: z.number().int().min(1).max(999).default(1),
			method: z.enum(["scanner", "camera"]).default("scanner"),
		})
	)
	.handler(async ({ data }) => {
		const { receipt, userId } = await requireOpenReceipt(data.receiptId, 2)
		const inv = inventory()

		if (!data.gtin) throw new Error("Leitura sem GTIN — use a confirmação manual para item sem código")
		const lines = await scanLinesFor(data.receiptId)
		const match = matchScanToLine(data.gtin, lines)
		if (!match) {
			// o sistema NÃO adiciona linha que a nota não tem: quem decide é o
			// operador (associar, registrar troca ou ignorar)
			return { matched: false as const, receiptId: receipt.id as string, gtin: data.gtin }
		}

		const quantity = (match.quantityBase ?? 0) * data.multiplier
		const { error } = await inv.from("receipt_scan_event").insert({
			receipt_id: data.receiptId,
			receipt_item_id: match.receiptItemId,
			client_event_id: data.clientEventId,
			method: data.method,
			raw_code: data.rawCode,
			gtin: data.gtin,
			lot_code: data.lotCode ?? null,
			expiry_date: data.expiryDate ?? null,
			package_factor: match.packageFactor * data.multiplier,
			quantity_base: quantity,
			created_by: userId,
		})
		if (error) {
			// mesma leitura reenviada: idempotente por construção
			if (error.code === "23505") return { matched: true as const, receiptItemId: match.receiptItemId, duplicate: true as const, quantityBase: 0 }
			throw new Error(`Erro ao registrar a leitura: ${error.message}`)
		}

		const total = await syncConfirmedQuantity(match.receiptItemId)
		return {
			matched: true as const,
			receiptItemId: match.receiptItemId,
			duplicate: false as const,
			quantityBase: quantity,
			confirmedQtyBase: total,
			source: match.source,
		}
	})

/** Confirmação manual de linha sem código (hortifrúti, granel, "SEM GTIN"). */
export const confirmLineManuallyFn = createServerFn({ method: "POST" })
	.validator(z.object({ receiptItemId: z.uuid(), clientEventId: z.string().min(8).max(64), quantityBase: z.number().min(0) }))
	.handler(async ({ data }) => {
		const receiptId = await receiptIdForItem(data.receiptItemId)
		const { userId } = await requireOpenReceipt(receiptId, 2)
		const { error } = await inventory().from("receipt_scan_event").insert({
			receipt_id: receiptId,
			receipt_item_id: data.receiptItemId,
			client_event_id: data.clientEventId,
			method: "manual_confirm",
			quantity_base: data.quantityBase,
			created_by: userId,
		})
		if (error && error.code !== "23505") throw new Error(`Erro ao confirmar a linha: ${error.message}`)
		return { confirmedQtyBase: await syncConfirmedQuantity(data.receiptItemId) }
	})

/**
 * "Aceitar conforme faturado": fecha de uma vez as linhas ainda não conferidas.
 *
 * Numa nota de 40 linhas com 3 exceções, exigir 40 confirmações é o que faz o
 * conferente parar de conferir. As 37 restantes recebem o faturado, com evento
 * `bulk_confirm` — o termo continua dizendo COMO cada linha foi conferida.
 */
export const bulkConfirmReceiptFn = createServerFn({ method: "POST" })
	.validator(z.object({ receiptId: z.uuid(), clientEventId: z.string().min(8).max(64) }))
	.handler(async ({ data }) => {
		const { userId } = await requireOpenReceipt(data.receiptId, 2)
		const inv = inventory()
		const { data: items, error: itemsError } = await inv.from("goods_receipt_item").select("id, invoiced_qty_base").eq("receipt_id", data.receiptId)
		if (itemsError) throw new Error(`Erro ao carregar as linhas: ${itemsError.message}`)
		const { data: events, error: eventsError } = await inv
			.from("receipt_scan_event")
			.select("id, receipt_item_id, method, reversed_event_id")
			.eq("receipt_id", data.receiptId)
		if (eventsError) throw new Error(`Erro ao carregar a conferência: ${eventsError.message}`)
		// "Tocada" é linha com evento VIVO — leitura, confirmação ou recusa que não
		// foi desfeita. Linha cuja única leitura foi desfeita volta a ser pendente.
		const eventRows = (events ?? []) as Array<{ id: string; receipt_item_id: string | null; method: string; reversed_event_id: string | null }>
		const reversed = new Set(eventRows.filter((event) => event.method === "reversal").map((event) => event.reversed_event_id))
		const touched = new Set(eventRows.filter((event) => event.method !== "reversal" && !reversed.has(event.id)).map((event) => event.receipt_item_id))

		const pending = ((items ?? []) as Array<{ id: string; invoiced_qty_base: number | null }>).filter(
			(item) => !touched.has(item.id) && item.invoiced_qty_base != null
		)
		if (pending.length === 0) return { confirmed: 0 }

		const { error } = await inv.from("receipt_scan_event").insert(
			pending.map((item, index) => ({
				receipt_id: data.receiptId,
				receipt_item_id: item.id,
				client_event_id: `${data.clientEventId}-${index}`,
				method: "bulk_confirm",
				quantity_base: item.invoiced_qty_base,
				created_by: userId,
			}))
		)
		if (error && error.code !== "23505") throw new Error(`Erro ao aceitar as linhas: ${error.message}`)
		for (const item of pending) await syncConfirmedQuantity(item.id)
		return { confirmed: pending.length }
	})

/** Desfaz uma leitura (estorno append-only — o histórico continua). */
export const reverseScanEventFn = createServerFn({ method: "POST" })
	.validator(z.object({ eventId: z.uuid(), clientEventId: z.string().min(8).max(64) }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: event, error: eventError } = await inv
			.from("receipt_scan_event")
			.select("id, receipt_id, receipt_item_id, quantity_base, method")
			.eq("id", data.eventId)
			.maybeSingle()
		if (eventError) throw new Error(`Erro ao carregar a leitura: ${eventError.message}`)
		if (!event) throw new Error("Leitura não encontrada")
		if (event.method === "reversal") throw new Error("Um estorno não se desfaz — registre a leitura de novo")
		const { userId } = await requireOpenReceipt(event.receipt_id, 2)

		const { error } = await inv.from("receipt_scan_event").insert({
			receipt_id: event.receipt_id,
			receipt_item_id: event.receipt_item_id,
			client_event_id: data.clientEventId,
			method: "reversal",
			quantity_base: 0,
			reversed_event_id: event.id,
			created_by: userId,
		})
		if (error) {
			if (error.code === "23505") throw new Error("Esta leitura já foi desfeita")
			throw new Error(`Erro ao desfazer a leitura: ${error.message}`)
		}
		return { confirmedQtyBase: event.receipt_item_id ? await syncConfirmedQuantity(event.receipt_item_id) : 0 }
	})

/**
 * Associa um GTIN desconhecido à linha, aprendendo para as próximas notas.
 *
 * NÃO escreve em `ingredient_item.gtin`: a coluna é única, e sobrescrevê-la
 * quebraria o casamento das notas antigas (embalagem nova não apaga a antiga).
 * Vira alias, que vale já para esta cozinha e para notas do mesmo fornecedor, e
 * entra na fila de revisão global.
 */
export const associateGtinToLineFn = createServerFn({ method: "POST" })
	.validator(z.object({ receiptItemId: z.uuid(), gtin: z.string().regex(/^[0-9]{14}$/) }))
	.handler(async ({ data }) => {
		const receiptId = await receiptIdForItem(data.receiptItemId)
		const { receipt, userId } = await requireOpenReceipt(receiptId, 2)
		const inv = inventory()

		const { data: item } = await inv.from("goods_receipt_item").select("ingredient_item_id").eq("id", data.receiptItemId).maybeSingle()
		if (!item?.ingredient_item_id) throw new Error("Linha sem SKU vinculado — resolva o casamento do item antes de associar o código")

		const { data: doc } = await inv.from("goods_receipt").select("nfe_document_id").eq("id", receiptId).maybeSingle()
		let supplierCnpj: string | null = null
		if (doc?.nfe_document_id) {
			const { data: nfe } = await inv.from("nfe_document").select("supplier_cnpj").eq("id", doc.nfe_document_id).maybeSingle()
			supplierCnpj = nfe?.supplier_cnpj ?? null
		}

		const gs1 = getServerClient("gs1_integration") as unknown as LooseClient
		const { error } = await gs1.from("gtin_alias").upsert(
			{
				gtin: data.gtin,
				ingredient_item_id: item.ingredient_item_id,
				supplier_cnpj: supplierCnpj,
				kitchen_id: Number(receipt.kitchen_id),
				status: "pending",
				created_by: userId,
			},
			{ onConflict: "gtin,ingredient_item_id" }
		)
		if (error) throw new Error(`Erro ao associar o código: ${error.message}`)
		return { associated: true }
	})

/** Recusa de linha: quantidade aceita zero, com motivo. */
export const refuseReceiptLineFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			receiptItemId: z.uuid(),
			clientEventId: z.string().min(8).max(64),
			reason: z.enum(["damaged", "short_shelf_life", "out_of_spec", "temperature", "not_ordered", "other"]),
			note: z.string().max(300).optional(),
			replacementPromised: z.boolean().default(false),
		})
	)
	.handler(async ({ data }) => {
		const receiptId = await receiptIdForItem(data.receiptItemId)
		const { userId } = await requireOpenReceipt(receiptId, 2)
		const label = {
			damaged: "Avaria",
			short_shelf_life: "Validade insuficiente",
			out_of_spec: "Fora da especificação",
			temperature: "Temperatura fora da faixa",
			not_ordered: "Não solicitado",
			other: "Outro",
		}[data.reason]
		// A recusa é um EVENTO (override com total zero), e não uma escrita direta
		// na linha: escrita direta era desfeita pela próxima leitura, e o "aceitar
		// conforme faturado" ainda contava a linha recusada como pendente e
		// devolvia a quantidade faturada. O motivo fica na linha enquanto o evento
		// de recusa estiver vivo (`sync_receipt_line` o tira quando não estiver).
		const inv = inventory()
		const { error: eventError } = await inv.from("receipt_scan_event").insert({
			receipt_id: receiptId,
			receipt_item_id: data.receiptItemId,
			client_event_id: data.clientEventId,
			method: "refusal",
			quantity_base: 0,
			created_by: userId,
		})
		if (eventError && eventError.code !== "23505") throw new Error(`Erro ao recusar a linha: ${eventError.message}`)
		const { error } = await inv
			.from("goods_receipt_item")
			.update({
				divergence_reason: `Recusado: ${label}${data.note ? ` — ${data.note.trim()}` : ""}${data.replacementPromised ? " (reposição prometida)" : ""}`,
			})
			.eq("id", data.receiptItemId)
		if (error) throw new Error(`Erro ao recusar a linha: ${error.message}`)
		await syncConfirmedQuantity(data.receiptItemId)
		return { refused: true }
	})

/** Recusa do recebimento inteiro: nada entra, e a nota fica recusada. */
export const refuseReceiptFn = createServerFn({ method: "POST" })
	.validator(z.object({ receiptId: z.uuid(), reason: z.string().min(5).max(500) }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: receipt } = await inv.from("goods_receipt").select("kitchen_id, status, nfe_document_id").eq("id", data.receiptId).maybeSingle()
		if (!receipt) throw new Error("Recebimento não encontrado")
		const { userId } = await requireStorageForKitchen(3, Number(receipt.kitchen_id))
		if (!isReceiptEditable(receipt.status as string)) throw new Error("Recebimento já efetivado")
		await requireDesignation(data.receiptId, userId, "definitive")

		const { error } = await inv
			.from("goods_receipt")
			.update({ status: "rejected", notes: data.reason.trim(), definitive_by: userId, definitive_at: new Date().toISOString() })
			.eq("id", data.receiptId)
		if (error) throw new Error(`Erro ao recusar o recebimento: ${error.message}`)

		if (receipt.nfe_document_id) {
			await inv.from("nfe_document").update({ status: "refused" }).eq("id", receipt.nfe_document_id)
		}
		return { refused: true }
	})

/** Resolve a pendência fiscal do recebimento a menor. */
export const resolveFiscalPendingFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			receiptId: z.uuid(),
			resolution: z.enum(["return_nfe", "replacement_nfe", "glosa"]),
			reference: z.string().min(3).max(200),
		})
	)
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: receipt } = await inv.from("goods_receipt").select("kitchen_id, fiscal_pending").eq("id", data.receiptId).maybeSingle()
		if (!receipt) throw new Error("Recebimento não encontrado")
		const { userId } = await requireStorageForKitchen(3, Number(receipt.kitchen_id))
		if (!receipt.fiscal_pending) throw new Error("Este recebimento não tem pendência fiscal")

		// devolução e substituta são NOTAS: a referência é a chave de acesso
		if (data.resolution !== "glosa" && !parseNfeAccessKey(data.reference)) {
			throw new Error("Informe a chave de acesso (44 caracteres) da NF-e de devolução ou substituta")
		}

		// Condicional à pendência ainda aberta: duas resoluções simultâneas (duplo
		// clique, duas pessoas) gravavam as duas, e a segunda sobrescrevia a
		// referência da primeira.
		const { data: resolved, error } = await inv
			.from("goods_receipt")
			.update({
				fiscal_pending: false,
				fiscal_resolution: data.resolution,
				fiscal_resolution_reference: data.reference.trim(),
				fiscal_resolved_at: new Date().toISOString(),
				fiscal_resolved_by: userId,
			})
			.eq("id", data.receiptId)
			.eq("fiscal_pending", true)
			.select("id")
		if (error) throw new Error(`Erro ao resolver a pendência: ${error.message}`)
		if ((resolved ?? []).length === 0) throw new Error("A pendência fiscal já foi resolvida")
		return { resolved: true }
	})

/** Eventos de conferência de um recebimento, para o histórico e o termo. */
export const listScanEventsFn = createServerFn({ method: "GET" })
	.validator(z.object({ receiptId: z.uuid() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: receipt } = await inv.from("goods_receipt").select("kitchen_id").eq("id", data.receiptId).maybeSingle()
		if (!receipt) throw new Error("Recebimento não encontrado")
		await requireStorageForKitchen(1, Number(receipt.kitchen_id))
		const { data: events, error } = await inv
			.from("receipt_scan_event")
			.select(
				"id, seq, receipt_item_id, method, raw_code, gtin, lot_code, expiry_date, package_factor, quantity_base, reversed_event_id, created_by, created_at"
			)
			.eq("receipt_id", data.receiptId)
			.order("seq", { ascending: false })
			.limit(200)
		if (error) throw new Error(`Erro ao listar a conferência: ${error.message}`)
		return events ?? []
	})
