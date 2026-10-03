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
	CONSERVATION_CLASSES,
	type ConservationClass,
	canDesignateInUnit,
	composeLotDivergence,
	conservationDivergence,
	DEFINITIVE_RECEIPT_ROLES,
	designationMissingMessage,
	divergesFromInvoice,
	getBrasiliaToday,
	isReceiptEditable,
	isTemperatureOutOfRange,
	matchReceiptLinesToInvoice,
	matchScanToLine,
	normalizeSupplierDocument,
	type PackageType,
	PROVISIONAL_RECEIPT_ROLES,
	parseNfeAccessKey,
	type ReceiptLineForScan,
	type ReceiptSource,
	type ReceiptStage,
	receiptLinkWarnings,
	receiptWithoutInvoiceProblems,
	requiresDivergenceReason,
	shelfLifeDivergence,
	type TransportRequirement,
	temperatureDivergenceReason,
	temperatureVerdict,
	unitCostFromInvoiceLine,
	unitCostFromNfe,
} from "@iefa/sisub-domain/operations"
import type { UserContext } from "@iefa/sisub-domain/types"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { publicDbMessage } from "@/lib/db-error-message"
import { itemDescription } from "@/lib/item-description"
import { withDeferralRollback } from "@/lib/deferral-mark"
import { invoiceSituationProblem } from "@/lib/invoice-gate"
import { purchaseUnitIdOfKitchen } from "@/lib/kitchen-purchase-unit.server"
import { nfeOwnershipProblem } from "@/lib/nfe-ownership"
import { readAllPages } from "@/lib/read-all-pages"
import { decideReceiptInvoice, isInvoiceCancelled } from "@/lib/receipt-invoice-gate"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient, rpcWithNulls } from "@/lib/supabase.server"

const inventory = () => getServerClient("inventory")
const procurement = () => getServerClient("procurement")
const kitchen = () => getServerClient("kitchen")
const finance = () => getServerClient("finance")

const IsoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.nullable()

/** Recebimento já efetivado não aceita mais escrita — nem de lote. */
async function requireOpenReceipt(receiptId: string, level: 2 | 3) {
	const inv = inventory()
	const { data: receipt, error: receiptError } = await inv.from("goods_receipt").select("id, status, kitchen_id, created_at").eq("id", receiptId).maybeSingle()
	if (receiptError) throw new Error(`Erro ao carregar o recebimento: ${publicDbMessage(receiptError)}`)
	if (!receipt) throw new Error("Recebimento não encontrado")
	const auth = await requireStorageForKitchen(level, Number(receipt.kitchen_id))
	// `divergent` e `rejected` JÁ passaram pela efetivação (o ledger foi gravado
	// ou o recebimento foi recusado): aceitar escrita neles mudava o termo e o
	// valor sugerido de liquidação depois do fato. A UI já bloqueava; a API não.
	if (!isReceiptEditable(receipt.status)) throw new Error("Recebimento já efetivado — não pode ser alterado")
	return { receipt, ...auth }
}

/** A linha do recebimento, com o que a conferência dela precisa; sobe até o recebimento (o guard é por cozinha). */
async function receiptItemOf(receiptItemId: string) {
	const { data: item, error: itemError } = await inventory()
		.from("goods_receipt_item")
		.select("receipt_id, purchase_item_id, ingredient_id")
		.eq("id", receiptItemId)
		.maybeSingle()
	if (itemError) throw new Error(`Erro ao carregar o item do recebimento: ${publicDbMessage(itemError)}`)
	if (!item) throw new Error("Linha do recebimento não encontrada")
	return item
}

async function receiptIdForItem(receiptItemId: string): Promise<string> {
	return (await receiptItemOf(receiptItemId)).receipt_id
}

/**
 * O que a especificação de compra da linha SUGERE: classe, faixa de temperatura e validade
 * mínima na entrega.
 *
 * A classe segue EXATAMENTE a resolução de `finalize_goods_receipt`: a do purchase_item da
 * linha; nula (ou sem purchase_item), a da especificação padrão do insumo, desde que não
 * excluída. Faixa e validade vêm da especificação da linha quando ela existe, senão da padrão.
 */
async function requiredRangeFor(
	purchaseItemId: string | null,
	ingredientId: string | null
): Promise<{ minC: number | null; maxC: number | null; conservationClass: ConservationClass | null; minShelfLifeDays: number | null }> {
	const proc = procurement()
	const columns = "conservation_class, storage_temp_min_c, storage_temp_max_c, min_shelf_life_days_on_delivery, deleted_at"

	let lineSpec: Record<string, unknown> | null = null
	if (purchaseItemId) {
		// Falha aqui não é "sem especificação": a faixa de temperatura sumiria e o item fora dela entraria.
		const { data, error } = await proc.from("purchase_item").select(columns).eq("id", purchaseItemId).maybeSingle()
		if (error) throw new Error(`Erro ao carregar a especificação do item de compra: ${publicDbMessage(error)}`)
		lineSpec = data ?? null
	}
	let defaultSpec: Record<string, unknown> | null = null
	if ((!lineSpec || lineSpec.conservation_class == null) && ingredientId) {
		const { data, error } = await proc
			.from("purchase_item_ingredient")
			.select(`purchase_item:purchase_item_id (${columns})`)
			.eq("ingredient_id", ingredientId)
			.eq("is_default", true)
			.maybeSingle()
		if (error) throw new Error(`Erro ao carregar a especificação padrão do insumo: ${publicDbMessage(error)}`)
		const candidate = (data as { purchase_item?: Record<string, unknown> | null } | null)?.purchase_item ?? null
		defaultSpec = candidate && candidate.deleted_at == null ? candidate : null
	}

	const spec = lineSpec ?? defaultSpec
	return {
		minC: spec?.storage_temp_min_c != null ? Number(spec.storage_temp_min_c) : null,
		maxC: spec?.storage_temp_max_c != null ? Number(spec.storage_temp_max_c) : null,
		conservationClass: ((lineSpec?.conservation_class ?? defaultSpec?.conservation_class) as ConservationClass | undefined) ?? null,
		minShelfLifeDays: spec?.min_shelf_life_days_on_delivery != null ? Number(spec.min_shelf_life_days_on_delivery) : null,
	}
}

/** Data (Brasília) em que a carga chegou: a criação do recebimento. É contra ela que se mede a validade. */
function arrivalDate(receiptCreatedAt: string | null | undefined): string {
	return getBrasiliaToday(receiptCreatedAt ? new Date(receiptCreatedAt) : new Date())
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
		const { data: doc, error: docError } = await inv.from("nfe_document").select("kitchen_id, unit_id").eq("id", data.nfeDocumentId).maybeSingle()
		if (docError) throw new Error(`Erro ao carregar a NF-e: ${publicDbMessage(docError)}`)
		if (!doc) throw new Error("NF-e não encontrada")
		const unitId = await purchaseUnitIdOfKitchen(data.kitchenId)
		// Nota sem cozinha é da UNIDADE destinatária: só cozinha cuja unidade de compra é aquela
		// recebe por ela. Antes, `kitchen_id` nulo passava direto — inclusive nota da triagem
		// global e nota endereçada a outra OM.
		const ownership = nfeOwnershipProblem({
			docKitchenId: doc.kitchen_id != null ? Number(doc.kitchen_id) : null,
			docUnitId: doc.unit_id != null ? Number(doc.unit_id) : null,
			kitchenId: data.kitchenId,
			kitchenPurchaseUnitId: unitId,
		})
		if (ownership) throw new Error(ownership)
		// A mesma regra da entrega sem nota: OF enviada desta cozinha, e empenho da unidade
		// compradora, não anulado e coerente com a OF. Antes, o empenho do payload ia direto para
		// o recebimento — NE de outra unidade ou anulada sustentava a entrega.
		const { empenhoId } = await resolveOrderAndEmpenho(data.kitchenId, unitId, data.supplyOrderId ?? null, data.empenhoId ?? null)
		// Nota que já fecha entregas recebidas sem ela (o pão da semana) não gera recebimento
		// próprio: o estoque seria contado duas vezes. O banco também recusa
		// (`goods_receipt_nfe_single_use`); aqui a frase diz o que fazer.
		const { count: linkedDeliveries, error: linkedError } = await inv
			.from("goods_receipt")
			.select("id", { count: "exact", head: true })
			.eq("nfe_document_id", data.nfeDocumentId)
			.neq("source", "nfe")
			.neq("status", "rejected")
		if (linkedError) throw new Error(`Erro ao conferir as entregas da nota: ${publicDbMessage(linkedError)}`)
		if ((linkedDeliveries ?? 0) > 0) {
			throw new Error(
				`Esta NF-e já está vinculada a ${linkedDeliveries} entrega(s) recebida(s) sem nota — não crie outro recebimento: confira os itens nas entregas vinculadas`
			)
		}

		const { data: items, error: itemsError } = await inv
			.from("nfe_item")
			.select(
				"id, n_item, description, ingredient_id, ingredient_item_id, purchase_item_id, matched_qty_base, unit_price, commercial_qty, lot_code, expiry_date, match_status"
			)
			.eq("nfe_document_id", data.nfeDocumentId)
		if (itemsError) throw new Error(`Erro ao carregar itens da NF-e: ${publicDbMessage(itemsError)}`)

		const resolvable = (items ?? []).filter((item) => item.ingredient_id != null)
		if (resolvable.length === 0) {
			throw new Error("Nenhum item da NF-e está vinculado a um insumo — resolva o matching antes de receber")
		}
		// Linha sem insumo resolvido SUMIA do recebimento (ia como `skipped`): o
		// conferente recebia uma nota de 6 linhas com 5 na tela e nada dizia que a
		// sexta existia. Enquanto a linha não casada não tem onde morar no
		// recebimento (goods_receipt_item exige ingrediente XOR preparação), o
		// caminho honesto é recusar apontando quais faltam.
		const unresolved = (items ?? []).filter((item) => item.ingredient_id == null)
		if (unresolved.length > 0) {
			// Nº do item na nota + descrição: é o que o conferente acha no DANFE. O id interno
			// que ia aqui não dizia nada a ninguém.
			const descriptions = unresolved
				.slice(0, 5)
				.map((item) => `#${item.n_item ?? "?"} ${item.description ?? item.id}`)
				.join("; ")
			throw new Error(
				`${unresolved.length} item(ns) da NF-e ainda sem insumo vinculado — resolva o matching antes de receber (itens: ${descriptions}${unresolved.length > 5 ? "…" : ""})`
			)
		}

		const { data: receipt, error } = await inv
			.from("goods_receipt")
			.insert({
				kitchen_id: data.kitchenId,
				nfe_document_id: data.nfeDocumentId,
				source: "nfe",
				supply_order_id: data.supplyOrderId ?? null,
				empenho_id: empenhoId,
				created_by: userId,
			})
			.select("id")
			.single()
		if (error || !receipt) {
			if (error?.code === "23505") throw new Error("Esta NF-e já tem um recebimento em andamento ou efetivado")
			throw new Error(`Erro ao criar recebimento: ${publicDbMessage(error)}`)
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
			throw new Error(`Erro ao criar itens do recebimento: ${publicDbMessage(insertError)}`)
		}

		// Lote inicial com o rastro da nota. Quantidade zero não gera lote: o
		// check `quantity_base > 0` recusaria, e um item faturado com zero é
		// justamente o que o conferente ainda vai preencher.
		const byNfeItem = new Map(prepared.map((entry) => [entry.row.nfe_item_id, entry]))
		const today = arrivalDate(null)
		// A especificação é lida aqui, depois de os itens existirem: falha nela apaga o recebimento,
		// como as falhas de inserção abaixo. Sem isso ficava um rascunho sem lote preso à nota, e a
		// nova tentativa esbarrava em "esta NF-e já tem um recebimento em andamento".
		const lotRows = await Promise.all(
			inserted
				.filter((item) => Number(item.received_qty_base) > 0)
				.map(async (item, index) => {
					const source = item.nfe_item_id ? byNfeItem.get(item.nfe_item_id) : undefined
					const expiryDate = source?.expiryDate ?? null
					// A validade que veio na nota também é julgada contra o mínimo da especificação:
					// lote que ninguém edita antes de efetivar não pode escapar do critério (EST-REC-05).
					const minShelfLifeDays = expiryDate
						? (await requiredRangeFor(source?.row.purchase_item_id ?? null, source?.row.ingredient_id ?? null)).minShelfLifeDays
						: null
					return {
						receipt_item_id: item.id,
						lot_code: source?.lotCode?.trim() || `SEM-LOTE-${today}-${index + 1}`,
						expiry_date: expiryDate,
						quantity_base: Number(item.received_qty_base),
						unit_cost: item.unit_cost,
						divergence_reason: shelfLifeDivergence(expiryDate, today, minShelfLifeDays),
					}
				})
		).catch(async (specError: unknown) => {
			await inv.from("goods_receipt").delete().eq("id", receipt.id)
			throw specError
		})

		if (lotRows.length > 0) {
			const { error: lotError } = await inv.from("goods_receipt_item_lot").insert(lotRows)
			if (lotError) {
				await inv.from("goods_receipt").delete().eq("id", receipt.id)
				throw new Error(`Erro ao criar lotes do recebimento: ${publicDbMessage(lotError)}`)
			}
		}

		// `skipped` fica em zero por construção: nota com linha não casada não
		// chega a criar recebimento.
		return { receiptId: receipt.id, itemsCount: prepared.length, skipped: 0 }
	})

/** Conferência da LINHA: quantidade física + motivo de divergência. Lote é escrita à parte. */
export const updateReceiptItemFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			receiptItemId: z.uuid(),
			receivedQtyBase: z.number().nonnegative(),
			divergenceReason: z.string().nullable().optional(),
			/**
			 * A quantidade que a tela carregou. Mudar só o motivo não pode virar um
			 * "total informado" com o número que a tela mostrava — se outra pessoa
			 * leu caixas no meio, esse número está velho e apagaria as leituras dela.
			 */
			baselineQtyBase: z.number().nonnegative().optional(),
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
		if (itemError) throw new Error(`Erro ao carregar o item: ${publicDbMessage(itemError)}`)
		if (!item) throw new Error("Item do recebimento não encontrado")
		const { userId } = await requireOpenReceipt(item.receipt_id, 2)

		const invoiced = item.invoiced_qty_base != null ? Number(item.invoiced_qty_base) : null
		const diverges = divergesFromInvoice(invoiced, data.receivedQtyBase)
		if (requiresDivergenceReason(invoiced, data.receivedQtyBase, data.divergenceReason)) {
			throw new Error("Quantidade física difere da faturada — informe o motivo da divergência")
		}

		// A quantidade da linha tem UMA fonte: os eventos. Escrever o total direto
		// fazia a próxima leitura recalcular da soma dos eventos e apagar a edição —
		// e a edição sumia sem rastro no termo. Mudou o total, vira evento `typed`
		// (o operador dizendo o total), e a linha é recalculada a partir dele.
		// A tela julgou a divergência pela quantidade que carregou: se a linha mudou
		// por baixo (outra leitura), salvar — mesmo só o motivo — decidiria sobre um
		// número velho, e podia apagar o motivo de uma linha que de fato diverge.
		const current = Number(item.received_qty_base)
		const baseline = data.baselineQtyBase ?? current
		const conflict = "A quantidade desta linha mudou enquanto você editava (outra leitura entrou) — recarregue e confira antes de salvar"
		if (current !== baseline) throw new Error(conflict)
		const reason = diverges ? (data.divergenceReason?.trim() ?? null) : null

		if (data.receivedQtyBase !== baseline) {
			// total e motivo numa transação só; linha que volta a bater com a nota
			// perde o motivo no próprio recálculo
			await recordReceiptEvent({
				receiptId: item.receipt_id,
				receiptItemId: data.receiptItemId,
				clientEventId: crypto.randomUUID(),
				method: "typed",
				quantityBase: data.receivedQtyBase,
				userId,
				divergenceReason: reason,
				// a checagem acima é a resposta rápida; esta, sob a trava, é a que vale
				expectedTotal: baseline,
			})
			return
		}
		// só o motivo: condicionado à quantidade que a tela viu
		const { data: updated, error } = await inv
			.from("goods_receipt_item")
			.update({ divergence_reason: reason })
			.eq("id", data.receiptItemId)
			.eq("received_qty_base", current)
			.select("id")
		if (error) throw new Error(`Erro ao atualizar item: ${publicDbMessage(error)}`)
		if (!updated?.length) throw new Error(conflict)
	})

/**
 * Cria ou atualiza um lote da linha.
 *
 * Nada aqui bloqueia o que chegou diferente do sugerido — registra:
 *   - temperatura fora da faixa: grava o motivo e quem aceitou. Travar faria a cozinha sem
 *     termômetro calibrado digitar um número plausível — pior que a ausência, porque parece prova;
 *   - classe de conservação diferente da sugerida (EST-REC-04: freezer quebrado, chegou
 *     resfriado a vácuo em vez de congelado): o lote entra na classe que CHEGOU, e a faixa de
 *     temperatura da especificação deixa de valer para ele — era a da outra classe;
 *   - validade abaixo do mínimo da especificação.
 * Cada caso vira uma frase no `divergence_reason`, com a nota opcional do conferente, e o
 * recebimento termina como `divergent`.
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
			/** Classe em que o lote chegou. Ausente/nula = a sugerida pela especificação. */
			conservationClass: z.enum(CONSERVATION_CLASSES).nullable().optional(),
			/** Nota opcional do conferente, anexada ao motivo quando há divergência. */
			divergenceNote: z.string().trim().max(280).nullable().optional(),
		})
	)
	.handler(async ({ data }) => {
		const item = await receiptItemOf(data.receiptItemId)
		const { userId, receipt } = await requireOpenReceipt(item.receipt_id, 2)
		const inv = inventory()

		const spec = await requiredRangeFor(item.purchase_item_id ?? null, item.ingredient_id ?? null)
		const received = data.conservationClass ?? null
		const measured = data.measuredTemperatureC ?? null
		const classReason = conservationDivergence(spec.conservationClass, received, measured)
		// Chegou em outra classe: a faixa sugerida era a da classe sugerida, não a desta. A
		// temperatura medida vai na frase da classe, para quem fiscaliza julgar.
		const range = classReason ? { minC: null, maxC: null } : spec
		const verdict = temperatureVerdict(measured, range)
		const outOfRange = isTemperatureOutOfRange(verdict)

		if (outOfRange && !data.acceptOutOfRange) {
			throw new Error(`${temperatureDivergenceReason(measured as number, range)} Confirme o aceite para registrar mesmo assim.`)
		}

		const divergence = composeLotDivergence(
			[
				classReason,
				outOfRange ? temperatureDivergenceReason(measured as number, range) : null,
				// Contra o dia em que a carga CHEGOU: editar o lote dias depois não pode torná-lo divergente.
				shelfLifeDivergence(data.expiryDate ?? null, arrivalDate(receipt.created_at), spec.minShelfLifeDays),
			],
			data.divergenceNote
		)

		const payload = {
			receipt_item_id: data.receiptItemId,
			lot_code: data.lotCode.trim(),
			expiry_date: data.expiryDate ?? null,
			quantity_base: data.quantityBase,
			unit_cost: data.unitCost ?? null,
			measured_temperature_c: measured,
			// Gravada sempre que informada — igual à sugerida inclusive. Nula só quando ninguém
			// escolheu; aí a efetivação usa a da especificação. Assim o lote de estoque recebe
			// exatamente o que a tela mostrou, sem depender de as duas resoluções coincidirem.
			conservation_class: received,
			divergence_note: data.divergenceNote?.trim() || null,
			divergence_reason: divergence,
			temperature_ack_by: outOfRange ? userId : null,
			temperature_ack_at: outOfRange ? new Date().toISOString() : null,
		}

		const lotError = (error: { code?: string; message: string }): Error =>
			error.code === "23505" ? new Error(`Lote "${data.lotCode}" já lançado nesta linha`) : new Error(`Erro ao gravar lote: ${publicDbMessage(error)}`)

		if (data.lotId) {
			// O lote é localizado pelo PAR (lote, linha) — a mesma amarração do delete abaixo. A
			// autorização acima vale para `receiptItemId`; filtrar só por `lotId` deixava quem
			// tem um recebimento aberto reescrever (e mover para a sua linha) o lote de qualquer
			// outro recebimento, de qualquer cozinha, só sabendo o UUID.
			const { data: updated, error } = await inv
				.from("goods_receipt_item_lot")
				.update(payload)
				.eq("id", data.lotId)
				.eq("receipt_item_id", data.receiptItemId)
				.select("id")
			if (error) throw lotError(error)
			if (!updated || updated.length === 0) throw new Error("Lote não encontrado nesta linha do recebimento")
		} else {
			const { error } = await inv.from("goods_receipt_item_lot").insert(payload)
			if (error) throw lotError(error)
		}
		return { verdict, outOfRange, divergence }
	})

export const deleteReceiptLotFn = createServerFn({ method: "POST" })
	.validator(z.object({ lotId: z.uuid(), receiptItemId: z.uuid() }))
	.handler(async ({ data }) => {
		const receiptId = await receiptIdForItem(data.receiptItemId)
		await requireOpenReceipt(receiptId, 2)
		const { error } = await inventory().from("goods_receipt_item_lot").delete().eq("id", data.lotId).eq("receipt_item_id", data.receiptItemId)
		if (error) throw new Error(`Erro ao remover lote: ${publicDbMessage(error)}`)
	})

/** Unidade COMPRADORA da cozinha: é nela que a designação e o empenho moram. */
async function purchaseUnitOfKitchen(kitchenId: number): Promise<number> {
	const unitId = await purchaseUnitIdOfKitchen(kitchenId)
	if (unitId == null) throw new Error("Cozinha sem unidade vinculada — não há como verificar a designação")
	return unitId
}

/** O que a busca de designação precisa do recebimento: a unidade compradora e o empenho. */
interface DesignationScope {
	unitId: number
	empenhoId: string | null
}

async function designationScopeOf(receiptId: string): Promise<DesignationScope> {
	const { data: receipt, error } = await inventory().from("goods_receipt").select("kitchen_id, empenho_id").eq("id", receiptId).maybeSingle()
	if (error) throw new Error(`Erro ao carregar o recebimento: ${publicDbMessage(error)}`)
	if (!receipt) throw new Error("Recebimento não encontrado")
	return { unitId: await purchaseUnitOfKitchen(Number(receipt.kitchen_id)), empenhoId: receipt.empenho_id ?? null }
}

/** A designação vigente da pessoa para o recebimento, ou `null`. */
async function findDesignation(scope: DesignationScope, userId: string, stage: ReceiptStage): Promise<string | null> {
	// `p_empenho_id` não tem default no SQL e é nulo no recebimento sem empenho.
	const { data: designationId, error } = await rpcWithNulls("inventory", "find_designation", {
		p_person: userId,
		p_unit_id: scope.unitId,
		p_empenho_id: scope.empenhoId,
		p_roles: stage === "provisional" ? [...PROVISIONAL_RECEIPT_ROLES] : [...DEFINITIVE_RECEIPT_ROLES],
	})
	// Falha de leitura não pode virar "sem designação": a recusa mandaria designar quem já está.
	if (error) throw new Error(`Erro ao conferir a designação: ${publicDbMessage(error)}`)
	return designationId ?? null
}

/**
 * Competência para receber (Lei 14.133/2021, art. 140, II; Decreto 11.246/2022, art. 25).
 *
 * Nível de PBAC é pré-condição, não competência: o provisório é do fiscal designado (alínea
 * a), o definitivo é de servidor ou comissão designada — gestor do contrato, gestor setorial
 * ou membro de comissão (alínea b; Decreto 11.246/2022, art. 25). Termo assinado por quem não tem competência vicia a liquidação apoiada
 * nele. O que NÃO depende de designação é a conferência física (itens, lotes, temperatura,
 * validade): ela fica registrada e o fiscal a confirma depois, sem redigitar.
 *
 * A designação vem de ato (boletim/portaria) do contrato ou de ato permanente da OM para
 * recebimento de gêneros. A recusa diz quem designa e onde; para quem tem `unit:2` na OM,
 * que dá para designar ali mesmo.
 */
async function requireDesignation(receiptId: string, ctx: UserContext, stage: ReceiptStage): Promise<string> {
	const scope = await designationScopeOf(receiptId)
	const designationId = await findDesignation(scope, ctx.userId, stage)
	if (!designationId) throw new Error(designationMissingMessage(stage, canDesignateInUnit(ctx.permissions, scope.unitId)))
	return designationId
}

/**
 * A nota ainda vale?
 *
 * Sem coletor DF-e não há como saber que o emitente cancelou a nota depois da
 * importação — e efetivar (e depois liquidar) nota cancelada é pagamento sem
 * documento hábil (Lei 4.320, art. 63). Por isso a consulta de situação, feita
 * no portal da SEFAZ e registrada no sistema, precisa ser recente.
 */
async function readReceiptInvoice(receiptId: string): Promise<{ status: string; situationResult: string | null; situationCheckedAt: string | null } | null> {
	const inv = inventory()
	const { data: receipt, error: receiptError } = await inv.from("goods_receipt").select("nfe_document_id").eq("id", receiptId).maybeSingle()
	// Esta é a ÚNICA trava de autenticidade da cadeia. Se a leitura falha e o
	// erro some, `receipt` vem vazio e a falha passaria por "recebimento sem
	// nota" — e a nota nunca confirmada seria efetivada.
	if (receiptError) throw new Error(`Erro ao conferir a nota do recebimento: ${publicDbMessage(receiptError)}`)
	if (!receipt) throw new Error("Recebimento não encontrado")
	return readInvoiceSituation(receipt.nfe_document_id ?? null)
}

/** Situação da NF-e pelo id; `null` = recebimento sem nota (guia, avulso). */
async function readInvoiceSituation(
	nfeDocumentId: string | null
): Promise<{ status: string; situationResult: string | null; situationCheckedAt: string | null } | null> {
	if (!nfeDocumentId) return null
	const { data: doc, error: docError } = await inventory()
		.from("nfe_document")
		.select("status, situation_result, situation_checked_at")
		.eq("id", nfeDocumentId)
		.maybeSingle()
	if (docError) throw new Error(`Erro ao conferir a situação da NF-e: ${publicDbMessage(docError)}`)
	// recebimento que aponta para nota que não se encontra NÃO é recebimento sem
	// nota: antes, este caso passava calado pela trava
	if (!doc) throw new Error("A NF-e deste recebimento não foi encontrada")
	return { status: doc.status, situationResult: doc.situation_result, situationCheckedAt: doc.situation_checked_at }
}

/**
 * A nota ainda vale para EFETIVAR? A regra da nota é a da liquidação, de um lugar só
 * (`invoice-gate.ts`). Com a SEFAZ fora do ar e o motivo informado, o estoque entra com a
 * consulta pendente (`decideReceiptInvoice`); a liquidação continua exigindo a consulta.
 */
async function assertInvoiceUsable(receiptId: string, deferral: { reason: string } | null): Promise<{ deferred: boolean }> {
	const decision = decideReceiptInvoice(await readReceiptInvoice(receiptId), deferral)
	if (decision.kind === "refuse") throw new Error(decision.message)
	return { deferred: decision.kind === "defer" }
}

/**
 * Linha sem conversão (faturado em unidade base nulo) entra com o custo da própria nota:
 * valor da linha ÷ quantidade conferida. Sem isto o lote era efetivado a custo nulo e o
 * estoque ficava valorado a menor exatamente no valor dessas linhas.
 *
 * Só vale quando a linha chegou INTEIRA: com recusa ou divergência registrada, o valor da
 * nota cobre mais do que entrou (25 de 30 fardos com os R$ 825 da linha dariam custo a
 * maior). Aí o custo fica para quem resolve a pendência — nulo é visível; inflado, não.
 */
async function fillCostFromInvoiceLine(receiptId: string) {
	const inv = inventory()
	// Só no recebimento criado DA nota. A entrega vinculada depois a uma nota semanal (o pão)
	// divide o valor da semana pelo pão de um dia: o custo sairia cinco vezes maior. Essa já
	// recebe o custo pela linha da nota, no vínculo (`linkReceiptDocumentsFn`).
	const { data: receipt, error: receiptError } = await inv.from("goods_receipt").select("source").eq("id", receiptId).maybeSingle()
	if (receiptError) throw new Error(`Erro ao ler a origem do recebimento: ${publicDbMessage(receiptError)}`)
	if (receipt?.source !== "nfe") return
	const { data: lines, error } = await inv
		.from("goods_receipt_item")
		.select("id, nfe_item_id, received_qty_base, nfe_item:nfe_item_id (acquisition_cost, product_value, unit_price, commercial_qty)")
		.eq("receipt_id", receiptId)
		.is("unit_cost", null)
		.is("invoiced_qty_base", null)
		.is("divergence_reason", null)
		.not("nfe_item_id", "is", null)
	if (error) throw new Error(`Erro ao ler o custo das linhas: ${publicDbMessage(error)}`)
	for (const line of lines ?? []) {
		const nfe = line.nfe_item as {
			acquisition_cost: number | null
			product_value: number | null
			unit_price: number | null
			commercial_qty: number | null
		} | null
		const lineValue =
			nfe?.acquisition_cost ?? nfe?.product_value ?? (nfe?.unit_price != null && nfe?.commercial_qty != null ? nfe.unit_price * nfe.commercial_qty : null)
		const unitCost = unitCostFromInvoiceLine({ lineValue: lineValue == null ? null : Number(lineValue), receivedQtyBase: Number(line.received_qty_base) })
		if (unitCost == null) continue
		const { error: itemError } = await inv.from("goods_receipt_item").update({ unit_cost: unitCost }).eq("id", line.id).is("unit_cost", null)
		if (itemError) throw new Error(`Erro ao gravar o custo da linha: ${publicDbMessage(itemError)}`)
		const { error: lotError } = await inv.from("goods_receipt_item_lot").update({ unit_cost: unitCost }).eq("receipt_item_id", line.id).is("unit_cost", null)
		if (lotError) throw new Error(`Erro ao gravar o custo do lote: ${publicDbMessage(lotError)}`)
	}
}

/**
 * Estágio 1: recebimento provisório (não movimenta estoque). Confirma a conferência que já
 * está registrada — quem conferiu pode não ser o fiscal, e nada é redigitado.
 */
export const setReceiptProvisionalFn = createServerFn({ method: "POST" })
	.validator(z.object({ receiptId: z.uuid() }))
	.handler(async ({ data }) => {
		const { data: receipt, error: receiptError } = await inventory().from("goods_receipt").select("kitchen_id").eq("id", data.receiptId).maybeSingle()
		if (receiptError) throw new Error(`Erro ao carregar o recebimento: ${publicDbMessage(receiptError)}`)
		if (!receipt) throw new Error("Recebimento não encontrado")
		const ctx = await requireStorageForKitchen(2, Number(receipt.kitchen_id))
		const { userId } = ctx
		const designationId = await requireDesignation(data.receiptId, ctx, "provisional")
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
		if (error) throw new Error(`Erro no recebimento provisório: ${publicDbMessage(error)}`)
	})

/**
 * Estágio 2: efetivação atômica (função SQL) — lotes + movimentos + OF.
 *
 * `invoiceCheckDeferral`: a SEFAZ está fora do ar e a consulta da nota não pôde ser feita. O
 * estoque entra, a pendência fica registrada com quem, quando e por quê, e a liquidação
 * continua exigindo a consulta recente (`invoice-gate.ts`). Nota cancelada nunca passa.
 */
export const finalizeReceiptFn = createServerFn({ method: "POST" })
	.validator(z.object({ receiptId: z.uuid(), invoiceCheckDeferral: z.object({ reason: z.string().trim().max(300) }).optional() }))
	.handler(async ({ data }) => {
		const { data: receipt, error: receiptError } = await inventory().from("goods_receipt").select("kitchen_id").eq("id", data.receiptId).maybeSingle()
		if (receiptError) throw new Error(`Erro ao carregar o recebimento: ${publicDbMessage(receiptError)}`)
		if (!receipt) throw new Error("Recebimento não encontrado")
		const ctx = await requireStorageForKitchen(3, Number(receipt.kitchen_id))
		const { userId } = ctx
		const designationId = await requireDesignation(data.receiptId, ctx, "definitive")
		const { deferred } = await assertInvoiceUsable(data.receiptId, data.invoiceCheckDeferral ?? null)

		const inv = inventory()
		// Divergência sem motivo não efetiva (art. 140) — a checagem mora em
		// `finalize_goods_receipt`, depois da trava do recebimento (20260920250000).
		// Aqui, antes da RPC, uma leitura que entrasse no meio passava por ela.
		// sem a designação gravada, o termo sairia sem quem efetivou
		// A consulta adiada vai junto, ANTES da efetivação: gravada depois, uma falha deixaria o
		// estoque dentro sem o registro de que a nota não foi confirmada.
		// Sem adiamento, os três campos vão nulos: apagam a marca de uma tentativa anterior.
		const deferral = deferred
			? {
					invoice_check_deferred_at: new Date().toISOString(),
					invoice_check_deferred_by: userId,
					invoice_check_deferred_reason: data.invoiceCheckDeferral?.reason.trim() ?? null,
				}
			: { invoice_check_deferred_at: null, invoice_check_deferred_by: null, invoice_check_deferred_reason: null }
		const { error: designationError } = await inv
			.from("goods_receipt")
			.update({ definitive_designation_id: designationId, ...deferral })
			.eq("id", data.receiptId)
		if (designationError) throw new Error(`Erro ao registrar a designação: ${publicDbMessage(designationError)}`)

		// Qualquer falha daqui até a efetivação (custo da nota, a própria RPC) desfaz a marca:
		// a consulta adiada não vale para uma tentativa que não aconteceu.
		const result = await withDeferralRollback(
			deferred,
			async () => {
				await fillCostFromInvoiceLine(data.receiptId)
				const { data: finalized, error } = await inv.rpc("finalize_goods_receipt", { p_receipt_id: data.receiptId, p_user: userId })
				if (error) throw new Error(`Efetivação falhou: ${publicDbMessage(error)}`)
				return finalized
			},
			async () => {
				const { error: clearError } = await inv
					.from("goods_receipt")
					.update({ invoice_check_deferred_at: null, invoice_check_deferred_by: null, invoice_check_deferred_reason: null })
					.eq("id", data.receiptId)
					.is("definitive_at", null)
				if (clearError) throw new Error(publicDbMessage(clearError))
			}
		)

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
		if (readError) throw new Error(`Recebimento efetivado, mas não foi possível ler a pendência fiscal: ${publicDbMessage(readError)}`)
		const shortfall = finalized.fiscal_pending ? Number(finalized.fiscal_pending_value ?? 0) : 0

		return { movements: Number(result?.[0]?.movements ?? 0), fiscalPendingValue: shortfall }
	})

/** Lista recebimentos da cozinha. */
export const listReceiptsFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		// Cliente tipado: as colunas da listagem já estão no `generated.ts` (o `inventory()` frouxo fica para o resto).
		const { data: receipts, error } = await getServerClient("inventory")
			.from("goods_receipt")
			.select(
				"id, nfe_document_id, supply_order_id, empenho_id, status, source, delivery_note_number, supplier_name, provisional_at, definitive_at, rejected_at, created_at"
			)
			.eq("kitchen_id", data.kitchenId)
			.order("created_at", { ascending: false })
			.limit(50)
		if (error) throw new Error(`Erro ao listar recebimentos: ${publicDbMessage(error)}`)
		return receipts ?? []
	})

/** Colunas de acondicionamento da especificação de compra que a conferência mostra; o cliente tipado infere a linha delas. */
const SPEC_COLUMNS =
	"id, conservation_class, storage_temp_min_c, storage_temp_max_c, package_type, package_net_content, package_net_content_unit, transport_requirement, min_shelf_life_days_on_delivery, delivery_conditioning, deleted_at"

/** Estreita as colunas de CHECK da especificação (o tipo gerado as declara `string`). */
function narrowSpec<T extends { conservation_class: string | null; package_type: string | null; transport_requirement: string | null }>(spec: T) {
	return {
		...spec,
		conservation_class: spec.conservation_class as ConservationClass | null,
		package_type: spec.package_type as PackageType | null,
		transport_requirement: spec.transport_requirement as TransportRequirement | null,
	}
}

/** Detalhe do recebimento: itens + lotes + acondicionamento exigido (para conferência e termo). */
export const fetchReceiptFn = createServerFn({ method: "GET" })
	.validator(z.object({ receiptId: z.uuid() }))
	.handler(async ({ data }) => {
		await requireAuthWithPermission("storage", 1)
		// Clientes tipados: a tela lê as colunas de vínculo (origem, NF-e esperada, fornecedor) e as
		// dos lotes direto destas linhas, e o compilador confere cada uma contra o `generated.ts`.
		const inv = getServerClient("inventory")
		const kit = getServerClient("kitchen")

		const { data: receipt, error } = await inv.from("goods_receipt").select("*").eq("id", data.receiptId).single()
		if (error || !receipt) throw new Error("Recebimento não encontrado")
		await requireStorageForKitchen(1, Number(receipt.kitchen_id))
		// Linhas e lotes lançam no erro: vazios, a conferência mostraria um
		// recebimento sem nada a conferir — e o termo sairia sem as linhas.
		const { data: items, error: itemsError } = await inv.from("goods_receipt_item").select("*").eq("receipt_id", data.receiptId)
		if (itemsError) throw new Error(`Erro ao carregar as linhas do recebimento: ${publicDbMessage(itemsError)}`)

		const itemRows = items ?? []
		const itemIds = itemRows.map((item) => item.id)
		const ingredientIds = [...new Set(itemRows.map((item) => item.ingredient_id).filter((id) => id != null))]
		// GTINs vinculados aos itens (para a conferência por scanner)
		const skuIds = [...new Set(itemRows.map((item) => item.ingredient_item_id).filter((id) => id != null))]
		const purchaseItemIds = [...new Set(itemRows.map((item) => item.purchase_item_id).filter((id) => id != null))]
		const proc = getServerClient("procurement")

		// Lotes, nomes, GTINs e especificações dependem só das linhas: uma ida só ao PostgREST.
		const [lotsResult, ingredientsResult, skusResult, specsResult] = await Promise.all([
			itemIds.length > 0 ? inv.from("goods_receipt_item_lot").select("*").in("receipt_item_id", itemIds) : { data: [], error: null },
			ingredientIds.length > 0 ? kit.from("ingredient").select("id, description, measure_unit").in("id", ingredientIds) : { data: [], error: null },
			skuIds.length > 0 ? kit.from("ingredient_item").select("id, gtin").in("id", skuIds) : { data: [], error: null },
			purchaseItemIds.length > 0 ? proc.from("purchase_item").select(SPEC_COLUMNS).in("id", purchaseItemIds) : { data: [], error: null },
		])
		if (lotsResult.error) throw new Error(`Erro ao carregar os lotes do recebimento: ${publicDbMessage(lotsResult.error)}`)
		if (ingredientsResult.error) throw new Error(`Erro ao carregar os insumos: ${publicDbMessage(ingredientsResult.error)}`)
		if (skusResult.error) throw new Error(`Erro ao carregar os códigos dos itens: ${publicDbMessage(skusResult.error)}`)
		// Acondicionamento sugerido, por especificação de compra da linha. Linha sem
		// purchase_item — ou com ele sem classe — cai na especificação padrão do insumo, desde
		// que não excluída: a MESMA resolução de `requiredRangeFor` (que grava o lote) e de
		// `finalize_goods_receipt`. Tela e servidor divergindo, o conferente via uma sugestão
		// e o recebimento era julgado por outra — por isso a leitura que falha lança, em vez de
		// mostrar a linha sem especificação.
		if (specsResult.error) throw new Error(`Erro ao carregar as especificações de compra: ${publicDbMessage(specsResult.error)}`)

		const narrowedLots = (lotsResult.data ?? []).map((lot) => ({ ...lot, conservation_class: lot.conservation_class as ConservationClass | null }))
		const lotsByItem = new Map<string, typeof narrowedLots>()
		for (const lot of narrowedLots) {
			const bucket = lotsByItem.get(lot.receipt_item_id)
			if (bucket) bucket.push(lot)
			else lotsByItem.set(lot.receipt_item_id, [lot])
		}
		const names = new Map((ingredientsResult.data ?? []).map((ing) => [ing.id, ing]))
		const gtinByItemId = new Map((skusResult.data ?? []).map((sku) => [sku.id, sku.gtin]))
		const specById = new Map((specsResult.data ?? []).map((spec) => [spec.id, narrowSpec(spec)]))
		const needsDefault = (item: (typeof itemRows)[number]) =>
			!!item.ingredient_id && (!item.purchase_item_id || specById.get(item.purchase_item_id)?.conservation_class == null)
		const fallbackIngredientIds = [
			...new Set(
				itemRows
					.filter(needsDefault)
					.map((item) => item.ingredient_id)
					.filter((id) => id != null)
			),
		]
		const { data: links, error: linksError } =
			fallbackIngredientIds.length > 0
				? await proc
						.from("purchase_item_ingredient")
						.select(`ingredient_id, purchase_item:purchase_item_id (${SPEC_COLUMNS})`)
						.in("ingredient_id", fallbackIngredientIds)
						.eq("is_default", true)
				: { data: [], error: null }
		if (linksError) throw new Error(`Erro ao carregar as especificações padrão dos insumos: ${publicDbMessage(linksError)}`)
		const defaultSpecByIngredient = new Map(
			(links ?? []).flatMap((link) =>
				link.purchase_item && link.purchase_item.deleted_at == null ? [[link.ingredient_id, narrowSpec(link.purchase_item)] as const] : []
			)
		)

		return {
			...receipt,
			items: itemRows.map((item) => {
				const lineSpec = item.purchase_item_id ? specById.get(item.purchase_item_id) : undefined
				const defaultSpec = item.ingredient_id ? defaultSpecByIngredient.get(item.ingredient_id) : undefined
				const name = item.ingredient_id ? names.get(item.ingredient_id) : undefined
				return {
					...item,
					description: name?.description ?? "—",
					measure_unit: name?.measure_unit ?? null,
					gtin: item.ingredient_item_id ? (gtinByItemId.get(item.ingredient_item_id) ?? null) : null,
					conditioning: lineSpec ?? defaultSpec ?? null,
					// A classe que a conferência sugere: a da linha, ou a da padrão quando a da linha é nula.
					suggested_conservation_class: lineSpec?.conservation_class ?? (needsDefault(item) ? defaultSpec?.conservation_class : null) ?? null,
					lots: lotsByItem.get(item.id) ?? [],
				}
			}),
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
	if (itemsError) throw new Error(`Erro ao carregar as linhas do recebimento: ${publicDbMessage(itemsError)}`)
	const rows = items ?? []
	if (rows.length === 0) return []

	// o que a NOTA declara (cEAN, cEANTrib, qCom, qTrib)
	const nfeItemIds = rows.map((row) => row.nfe_item_id).filter((id) => id != null)
	const nfeById = new Map<string, { gtin: string | null; gtin_trib: string | null; commercial_qty: number | null; taxable_qty: number | null }>()
	if (nfeItemIds.length > 0) {
		const { data: nfeItems, error: nfeError } = await inv.from("nfe_item").select("id, gtin, gtin_trib, commercial_qty, taxable_qty").in("id", nfeItemIds)
		if (nfeError) throw new Error(`Erro ao carregar os itens da nota: ${publicDbMessage(nfeError)}`)
		for (const item of nfeItems ?? []) nfeById.set(item.id, item)
	}

	// o que o CATÁLOGO conhece: GTIN do SKU + aliases aprendidos na operação
	const skuIds = rows.map((row) => row.ingredient_item_id).filter((id) => id != null)
	const catalogByItem = new Map<string, string[]>()
	const hierarchyByItem = new Map<string, string[]>()
	if (skuIds.length > 0) {
		const { data: skus, error: skuError } = await kit.from("ingredient_item").select("id, gtin").in("id", skuIds)
		if (skuError) throw new Error(`Erro ao carregar os códigos do catálogo: ${publicDbMessage(skuError)}`)
		for (const sku of skus ?? []) {
			if (sku.gtin) catalogByItem.set(sku.id, [sku.gtin])
		}
		const gs1 = getServerClient("gs1_integration")
		const { data: aliases, error: aliasError } = await gs1
			.from("gtin_alias")
			.select("gtin, ingredient_item_id, status")
			.in("ingredient_item_id", skuIds)
			.neq("status", "rejected")
		if (aliasError) throw new Error(`Erro ao carregar os códigos aprendidos: ${publicDbMessage(aliasError)}`)
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
			if (hierarchyError) throw new Error(`Erro ao carregar a hierarquia de embalagens: ${publicDbMessage(hierarchyError)}`)
			const nodes = hierarchy ?? []
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
 * Grava UM evento e recalcula a linha na MESMA transação
 * (`inventory.record_receipt_event`, 20260920250000). Gravar e recalcular em
 * duas idas deixava a leitura fora do total quando o recálculo falhava — o
 * reenvio caía no "já registrada" e não recalculava mais.
 */
async function recordReceiptEvent(event: {
	receiptId: string
	receiptItemId: string
	clientEventId: string
	method: "scanner" | "camera" | "manual_confirm" | "typed" | "reversal" | "refusal"
	quantityBase: number
	userId: string
	rawCode?: string | null
	gtin?: string | null
	lotCode?: string | null
	expiryDate?: string | null
	packageFactor?: number | null
	reversedEventId?: string | null
	/** Gravado na linha na mesma transação do evento (e só se o evento entrou). */
	divergenceReason?: string | null
	/** Recusa o evento se a linha não estiver mais com este total (checado sob a trava). */
	expectedTotal?: number | null
}): Promise<{ duplicate: boolean; total: number }> {
	const { data, error } = await inventory().rpc("record_receipt_event", {
		p_receipt_id: event.receiptId,
		p_receipt_item_id: event.receiptItemId,
		p_client_event_id: event.clientEventId,
		p_method: event.method,
		p_quantity: event.quantityBase,
		p_user: event.userId,
		p_raw_code: event.rawCode ?? undefined,
		p_gtin: event.gtin ?? undefined,
		p_lot_code: event.lotCode ?? undefined,
		p_expiry_date: event.expiryDate ?? undefined,
		p_package_factor: event.packageFactor ?? undefined,
		p_reversed_event_id: event.reversedEventId ?? undefined,
		p_divergence_reason: event.divergenceReason ?? undefined,
		p_expected_total: event.expectedTotal ?? undefined,
	})
	if (error) throw new Error(`Erro ao registrar a conferência: ${publicDbMessage(error)}`)
	const row = data?.[0]
	return { duplicate: Boolean(row?.duplicate), total: Number(row?.total ?? 0) }
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

		if (!data.gtin) throw new Error("Leitura sem GTIN — use a confirmação manual para item sem código")
		const lines = await scanLinesFor(data.receiptId)
		const match = matchScanToLine(data.gtin, lines)
		if (!match) {
			// o sistema NÃO adiciona linha que a nota não tem: quem decide é o
			// operador (associar, registrar troca ou ignorar)
			return { matched: false as const, receiptId: receipt.id, gtin: data.gtin }
		}

		const quantity = (match.quantityBase ?? 0) * data.multiplier
		// mesma leitura reenviada: reconhecida pelo `clientEventId`, e a linha é
		// recalculada mesmo assim
		const recorded = await recordReceiptEvent({
			receiptId: data.receiptId,
			receiptItemId: match.receiptItemId,
			clientEventId: data.clientEventId,
			method: data.method,
			quantityBase: quantity,
			userId,
			rawCode: data.rawCode,
			gtin: data.gtin,
			lotCode: data.lotCode ?? null,
			expiryDate: data.expiryDate ?? null,
			packageFactor: match.packageFactor * data.multiplier,
		})
		return {
			matched: true as const,
			receiptItemId: match.receiptItemId,
			duplicate: recorded.duplicate,
			quantityBase: recorded.duplicate ? 0 : quantity,
			confirmedQtyBase: recorded.total,
			source: match.source,
		}
	})

/** Confirmação manual de linha sem código (hortifrúti, granel, "SEM GTIN"). */
export const confirmLineManuallyFn = createServerFn({ method: "POST" })
	.validator(z.object({ receiptItemId: z.uuid(), clientEventId: z.string().min(8).max(64), quantityBase: z.number().min(0) }))
	.handler(async ({ data }) => {
		const receiptId = await receiptIdForItem(data.receiptItemId)
		const { userId } = await requireOpenReceipt(receiptId, 2)
		// é o TOTAL da linha (override), não mais uma embalagem
		const recorded = await recordReceiptEvent({
			receiptId,
			receiptItemId: data.receiptItemId,
			clientEventId: data.clientEventId,
			method: "manual_confirm",
			quantityBase: data.quantityBase,
			userId,
		})
		return { confirmedQtyBase: recorded.total }
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
		// Linha a linha, com a linha travada, no banco: decidir aqui quais linhas
		// ninguém tocou deixava uma leitura que chegasse no meio somar ao faturado.
		const { data: confirmed, error } = await inventory().rpc("bulk_confirm_receipt", {
			p_receipt_id: data.receiptId,
			p_client_event_id: data.clientEventId,
			p_user: userId,
		})
		if (error) throw new Error(`Erro ao aceitar as linhas: ${publicDbMessage(error)}`)
		return { confirmed: Number(confirmed ?? 0) }
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
		if (eventError) throw new Error(`Erro ao carregar a leitura: ${publicDbMessage(eventError)}`)
		if (!event) throw new Error("Leitura não encontrada")
		if (event.method === "reversal") throw new Error("Um estorno não se desfaz — registre a leitura de novo")
		const { userId } = await requireOpenReceipt(event.receipt_id, 2)
		if (!event.receipt_item_id) throw new Error("Leitura sem linha — nada a desfazer")

		const recorded = await recordReceiptEvent({
			receiptId: event.receipt_id,
			receiptItemId: event.receipt_item_id,
			clientEventId: data.clientEventId,
			method: "reversal",
			quantityBase: 0,
			userId,
			reversedEventId: event.id,
		})
		return { confirmedQtyBase: recorded.total, alreadyReversed: recorded.duplicate }
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

		const { data: item, error: itemError } = await inv.from("goods_receipt_item").select("ingredient_item_id").eq("id", data.receiptItemId).maybeSingle()
		if (itemError) throw new Error(`Erro ao carregar o item do recebimento: ${publicDbMessage(itemError)}`)
		if (!item?.ingredient_item_id) throw new Error("Linha sem SKU vinculado — resolva o casamento do item antes de associar o código")

		const { data: doc, error: docError } = await inv.from("goods_receipt").select("nfe_document_id").eq("id", receiptId).maybeSingle()
		if (docError) throw new Error(`Erro ao carregar o recebimento: ${publicDbMessage(docError)}`)
		let supplierCnpj: string | null = null
		if (doc?.nfe_document_id) {
			const { data: nfe, error: nfeError } = await inv.from("nfe_document").select("supplier_cnpj").eq("id", doc.nfe_document_id).maybeSingle()
			if (nfeError) throw new Error(`Erro ao carregar a NF-e: ${publicDbMessage(nfeError)}`)
			supplierCnpj = nfe?.supplier_cnpj ?? null
		}

		const gs1 = getServerClient("gs1_integration")
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
		if (error) throw new Error(`Erro ao associar o código: ${publicDbMessage(error)}`)
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
		// Motivo e evento na MESMA transação: em duas, uma leitura no meio apagava
		// o motivo, e a falha do segundo passo deixava a linha "Recusado:" com a
		// quantidade inteira indo para o estoque.
		await recordReceiptEvent({
			receiptId,
			receiptItemId: data.receiptItemId,
			clientEventId: data.clientEventId,
			method: "refusal",
			quantityBase: 0,
			userId,
			divergenceReason: `Recusado: ${label}${data.note ? ` — ${data.note.trim()}` : ""}${data.replacementPromised ? " (reposição prometida)" : ""}`,
		})
		return { refused: true }
	})

/** Recusa do recebimento inteiro: nada entra, e a nota fica recusada. */
export const refuseReceiptFn = createServerFn({ method: "POST" })
	.validator(z.object({ receiptId: z.uuid(), reason: z.string().min(5).max(500) }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: receipt, error: receiptError } = await inv
			.from("goods_receipt")
			.select("kitchen_id, status, nfe_document_id, source")
			.eq("id", data.receiptId)
			.maybeSingle()
		if (receiptError) throw new Error(`Erro ao carregar o recebimento: ${publicDbMessage(receiptError)}`)
		if (!receipt) throw new Error("Recebimento não encontrado")
		const ctx = await requireStorageForKitchen(3, Number(receipt.kitchen_id))
		const { userId } = ctx
		if (!isReceiptEditable(receipt.status)) throw new Error("Recebimento já efetivado")
		// Recusar o todo é decisão de quem recebe definitivamente (art. 140, II, b; § 1º).
		await requireDesignation(data.receiptId, ctx, "definitive")

		const { error } = await inv
			.from("goods_receipt")
			// A recusa tem colunas próprias: `definitive_at` é "entrega atestada" para todo leitor (e o
			// banco recusa recusado com ele preenchido — goods_receipt_rejected_not_attested).
			.update({ status: "rejected", notes: data.reason.trim(), rejected_by: userId, rejected_at: new Date().toISOString() })
			.eq("id", data.receiptId)
		if (error) throw new Error(`Erro ao recusar o recebimento: ${publicDbMessage(error)}`)

		// Só a nota do recebimento criado DELA vira recusada: a NF-e semanal vinculada à entrega
		// de um dia cobre as outras entregas da semana, que foram aceitas.
		if (receipt.nfe_document_id && receipt.source === "nfe") {
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
		const { data: receipt, error: receiptError } = await inv.from("goods_receipt").select("kitchen_id, fiscal_pending").eq("id", data.receiptId).maybeSingle()
		if (receiptError) throw new Error(`Erro ao carregar o recebimento: ${publicDbMessage(receiptError)}`)
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
		if (error) throw new Error(`Erro ao resolver a pendência: ${publicDbMessage(error)}`)
		if ((resolved ?? []).length === 0) throw new Error("A pendência fiscal já foi resolvida")
		return { resolved: true }
	})

/** Eventos de conferência de um recebimento, para o histórico e o termo. */
export const listScanEventsFn = createServerFn({ method: "GET" })
	.validator(z.object({ receiptId: z.uuid() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: receipt, error: receiptError } = await inv.from("goods_receipt").select("kitchen_id").eq("id", data.receiptId).maybeSingle()
		if (receiptError) throw new Error(`Erro ao carregar o recebimento: ${publicDbMessage(receiptError)}`)
		if (!receipt) throw new Error("Recebimento não encontrado")
		await requireStorageForKitchen(1, Number(receipt.kitchen_id))
		// TODAS as páginas: com o corte em 200, linha de nota grande cujos eventos
		// eram mais antigos aparecia "não conferida" e a leitura dela não se desfazia
		return await readAllPages("a conferência", (from, to) =>
			inv
				.from("receipt_scan_event")
				.select(
					"id, seq, receipt_item_id, method, raw_code, gtin, lot_code, expiry_date, package_factor, quantity_base, reversed_event_id, created_by, created_at"
				)
				.eq("receipt_id", data.receiptId)
				.order("seq", { ascending: false })
				.range(from, to)
		)
	})

// ────────────────────────────────────────────────────────────────────────────
// Recebimento sem NF-e e vínculo posterior (change sisub-flexible-expense-execution, D5)
// ────────────────────────────────────────────────────────────────────────────

/** Insumos para a linha da entrega sem nota. Catálogo global, busca no servidor. */
export const searchReceivableIngredientsFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive(), query: z.string().trim().min(2).max(80) }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(2, data.kitchenId)
		const pattern = `%${data.query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
		const { data: rows, error } = await kitchen()
			.from("ingredient")
			.select("id, description, measure_unit")
			.is("deleted_at", null)
			.ilike("description", pattern)
			.order("description")
			.limit(20)
		if (error) throw new Error(`Erro ao buscar insumos: ${publicDbMessage(error)}`)
		return rows ?? []
	})

/** OF da cozinha e empenho da unidade compradora, conferidos como na criação pela NF-e. */
async function resolveOrderAndEmpenho(kitchenId: number, unitId: number | null, supplyOrderId: string | null, empenhoId: string | null) {
	let resolvedEmpenhoId = empenhoId
	if (supplyOrderId) {
		const { data: order, error } = await procurement().from("supply_order").select("kitchen_id, empenho_id, status").eq("id", supplyOrderId).maybeSingle()
		if (error) throw new Error(`Erro ao carregar a OF: ${publicDbMessage(error)}`)
		if (!order || Number(order.kitchen_id) !== kitchenId) throw new Error("OF não encontrada ou de outra cozinha")
		if (order.status === "draft" || order.status === "cancelled") throw new Error("Só OF enviada sustenta a entrega — envie a OF ou registre sem ela")
		if (order.empenho_id) {
			if (resolvedEmpenhoId && resolvedEmpenhoId !== order.empenho_id) throw new Error("A OF é de outro empenho — escolha o empenho da OF, ou registre sem OF")
			resolvedEmpenhoId = order.empenho_id
		} else if (resolvedEmpenhoId) {
			// a mesma regra de `link_receipt_documents`: a NE da OF aguardando empenho entra NA OF (SICAF)
			throw new Error("A OF está aguardando empenho: vincule a NE na própria OF, que confere o SICAF — ou registre a entrega com a OF e sem NE")
		}
	}
	let empenho: { favorecido_nome: string | null; favorecido_cnpj: string | null } | null = null
	if (resolvedEmpenhoId) {
		const { data: row, error } = await finance()
			.from("empenho")
			.select("unit_id, status, favorecido_nome, favorecido_cnpj")
			.eq("id", resolvedEmpenhoId)
			.maybeSingle()
		if (error) throw new Error(`Erro ao carregar o empenho: ${publicDbMessage(error)}`)
		if (!row || unitId == null || Number(row.unit_id) !== unitId) throw new Error("Empenho não encontrado nesta unidade")
		if (row.status === "anulado") throw new Error("Empenho anulado não sustenta entrega — registre sem empenho e vincule a NE vigente depois")
		empenho = row
	}
	return { empenhoId: resolvedEmpenhoId, empenho }
}

/**
 * Registra a entrega que chegou sem NF-e: guia de remessa (o pão diário, a remessa do
 * depósito) ou sem documento nenhum. Os itens são os que a conferência informa; a nota,
 * a OF e o empenho se vinculam depois (`linkReceiptDocumentsFn`), sem refazer nada.
 *
 * A quantidade de cada linha entra como evento `typed` da conferência — a quantidade da
 * linha tem UMA fonte, os eventos —, e o lote informado substitui o lote sem código que a
 * conferência cria. Sem lote, a efetivação cria o sintético como sempre.
 */
export const createReceiptWithoutInvoiceFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			source: z.enum(["delivery_note", "ad_hoc"]),
			deliveryNoteNumber: z.string().trim().max(60).nullable().optional(),
			supplierName: z.string().trim().max(200).nullable().optional(),
			supplierDocument: z.string().trim().max(20).nullable().optional(),
			/** Falso na remessa de depósito e no apoio de outra OM: não haverá NF-e de fornecedor. */
			invoiceExpected: z.boolean().default(true),
			supplyOrderId: z.uuid().nullable().optional(),
			empenhoId: z.uuid().nullable().optional(),
			notes: z.string().trim().max(500).nullable().optional(),
			lines: z
				.array(
					z.object({
						ingredientId: z.uuid(),
						quantityBase: z.number().positive(),
						unitCost: z.number().nonnegative().nullable().optional(),
						lotCode: z.string().trim().max(40).nullable().optional(),
						expiryDate: IsoDate.optional(),
					})
				)
				.min(1)
				.max(100),
		})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireStorageForKitchen(2, data.kitchenId)
		const problems = receiptWithoutInvoiceProblems({
			source: data.source,
			deliveryNoteNumber: data.deliveryNoteNumber ?? null,
			supplierDocument: data.supplierDocument ?? null,
			lines: data.lines,
		})
		if (problems.length > 0) throw new Error(problems.join(". "))

		const unitId = await purchaseUnitOfKitchen(data.kitchenId)
		const { empenhoId, empenho } = await resolveOrderAndEmpenho(data.kitchenId, unitId, data.supplyOrderId ?? null, data.empenhoId ?? null)

		const ingredientIds = data.lines.map((line) => line.ingredientId)
		const { data: ingredients, error: ingredientError } = await kitchen().from("ingredient").select("id, description, deleted_at").in("id", ingredientIds)
		if (ingredientError) throw new Error(`Erro ao carregar os insumos: ${publicDbMessage(ingredientError)}`)
		const known = new Map<string, string>()
		for (const row of ingredients ?? []) {
			if (row.deleted_at == null) known.set(row.id, itemDescription(row.description))
		}
		if (ingredientIds.some((id) => !known.has(id))) throw new Error("Insumo não encontrado ou excluído — escolha outro no catálogo")

		// A especificação padrão do insumo dá a conservação sugerida e a validade mínima (EST-REC-04/05).
		const { data: defaults, error: defaultsError } = await procurement()
			.from("purchase_item_ingredient")
			.select("ingredient_id, purchase_item_id")
			.in("ingredient_id", ingredientIds)
			.eq("is_default", true)
		if (defaultsError) throw new Error(`Erro ao carregar as especificações de compra: ${publicDbMessage(defaultsError)}`)
		const purchaseItemBy = new Map<string, string>()
		for (const row of defaults ?? []) purchaseItemBy.set(row.ingredient_id, row.purchase_item_id)

		const inv = inventory()
		const { data: receipt, error } = await inv
			.from("goods_receipt")
			.insert({
				kitchen_id: data.kitchenId,
				source: data.source,
				delivery_note_number: data.deliveryNoteNumber?.trim() || null,
				supplier_name: data.supplierName?.trim() || empenho?.favorecido_nome || null,
				supplier_document: normalizeSupplierDocument(data.supplierDocument) ?? empenho?.favorecido_cnpj ?? null,
				invoice_expected: data.invoiceExpected,
				supply_order_id: data.supplyOrderId ?? null,
				empenho_id: empenhoId,
				notes: data.notes?.trim() || null,
				created_by: userId,
			})
			.select("id, created_at")
			.single()
		if (error || !receipt) throw new Error(`Erro ao registrar a entrega: ${publicDbMessage(error)}`)

		const { data: items, error: itemsError } = await inv
			.from("goods_receipt_item")
			.insert(
				data.lines.map((line) => ({
					receipt_id: receipt.id,
					ingredient_id: line.ingredientId,
					frozen_preparation_id: null,
					purchase_item_id: purchaseItemBy.get(line.ingredientId) ?? null,
					// sem nota, não há faturado: a linha não é "divergente" de nada
					invoiced_qty_base: null,
					received_qty_base: 0,
					unit_cost: line.unitCost ?? null,
				}))
			)
			.select("id, ingredient_id, purchase_item_id")
		if (itemsError || !items) {
			// ainda sem evento de conferência: o recebimento se apaga inteiro
			const { error: rollbackError } = await inv.from("goods_receipt").delete().eq("id", receipt.id)
			throw new Error(
				`Erro ao registrar os itens da entrega: ${publicDbMessage(itemsError)}${rollbackError ? ` (e o recebimento vazio ficou em rascunho: ${publicDbMessage(rollbackError)})` : ""}`
			)
		}

		// Daqui em diante há eventos (append-only): uma falha deixa o recebimento em rascunho
		// com a linha a conferir, e diz qual — nunca apaga o que já foi registrado.
		const itemByIngredient = new Map<string, { id: string; ingredient_id: string; purchase_item_id: string | null }>()
		for (const item of items) if (item.ingredient_id) itemByIngredient.set(item.ingredient_id, { ...item, ingredient_id: item.ingredient_id })
		const warnings: string[] = []
		const arrival = arrivalDate(receipt.created_at)
		for (const line of data.lines) {
			const item = itemByIngredient.get(line.ingredientId)
			if (!item) continue
			const label = known.get(line.ingredientId) ?? line.ingredientId
			try {
				await recordReceiptEvent({
					receiptId: receipt.id,
					receiptItemId: item.id,
					clientEventId: crypto.randomUUID(),
					method: "typed",
					quantityBase: line.quantityBase,
					userId,
				})
			} catch (eventError) {
				warnings.push(`${label}: quantidade não registrada (${eventError instanceof Error ? eventError.message : "erro"}) — informe na conferência`)
				continue
			}
			if (!line.lotCode?.trim() && !line.expiryDate) continue
			// Especificação que não se lê vira aviso desta linha, como as outras falhas daqui: o lote vai
			// para a conferência, que julga a validade ao gravar.
			let spec: Awaited<ReturnType<typeof requiredRangeFor>> | null = null
			if (line.expiryDate) {
				try {
					spec = await requiredRangeFor(item.purchase_item_id, item.ingredient_id)
				} catch (specError) {
					warnings.push(
						`${label}: validade mínima não conferida (${specError instanceof Error ? specError.message : "erro"}) — informe lote e validade na conferência`
					)
					continue
				}
			}
			const { error: lotError } = await inv
				.from("goods_receipt_item_lot")
				.update({
					...(line.lotCode?.trim() ? { lot_code: line.lotCode.trim() } : {}),
					expiry_date: line.expiryDate ?? null,
					divergence_reason: shelfLifeDivergence(line.expiryDate ?? null, arrival, spec?.minShelfLifeDays ?? null),
				})
				.eq("receipt_item_id", item.id)
				.like("lot_code", "SEM-LOTE-%")
			if (lotError) warnings.push(`${label}: lote e validade não gravados (${publicDbMessage(lotError)}) — informe na conferência`)
		}

		return { receiptId: receipt.id, itemsCount: items.length, warnings }
	})

/** NF-e, OF e empenho que podem ser ligados ao recebimento, com a sugestão pelo fornecedor. */
export const listReceiptLinkCandidatesFn = createServerFn({ method: "GET" })
	.validator(z.object({ receiptId: z.uuid() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: receipt, error: receiptError } = await inv
			.from("goods_receipt")
			.select("kitchen_id, supplier_document, empenho_id, nfe_document_id")
			.eq("id", data.receiptId)
			.maybeSingle()
		if (receiptError) throw new Error(`Erro ao carregar o recebimento: ${publicDbMessage(receiptError)}`)
		if (!receipt) throw new Error("Recebimento não encontrado")
		const kitchenId = Number(receipt.kitchen_id)
		await requireStorageForKitchen(2, kitchenId)
		const unitId = await purchaseUnitOfKitchen(kitchenId)
		const supplier = normalizeSupplierDocument(receipt.supplier_document)

		const since = new Date(Date.now() - 120 * 86_400_000).toISOString()
		const [notes, orders, empenhos] = await Promise.all([
			inv
				.from("nfe_document")
				.select("id, access_key, supplier_name, supplier_cnpj, supplier_cpf, issued_at, total_value, situation_result")
				.or(`kitchen_id.eq.${kitchenId},and(kitchen_id.is.null,unit_id.eq.${unitId})`)
				.not("status", "in", "(cancelled,refused)")
				.gte("created_at", since)
				.order("issued_at", { ascending: false })
				.limit(100),
			procurement()
				.from("supply_order")
				.select("id, number, sent_at, empenho_id")
				.eq("kitchen_id", kitchenId)
				.in("status", ["sent", "partially_received", "received"])
				.order("sent_at", { ascending: false })
				.limit(50),
			finance()
				.from("empenho")
				.select("id, numero_empenho, favorecido_nome, favorecido_cnpj")
				.eq("unit_id", unitId)
				.eq("status", "ativo")
				.order("data_empenho", { ascending: false })
				.limit(100),
		])
		for (const result of [notes, orders, empenhos]) {
			if (result.error) throw new Error(`Erro ao carregar os documentos: ${publicDbMessage(result.error)}`)
		}

		const noteList = notes.data ?? []
		// Nota com recebimento PRÓPRIO não fecha outra entrega (o estoque seria contado duas vezes).
		const taken = new Set<string>()
		if (noteList.length > 0) {
			const { data: own, error: ownError } = await inv
				.from("goods_receipt")
				.select("nfe_document_id")
				.eq("source", "nfe")
				.neq("status", "rejected")
				.in(
					"nfe_document_id",
					noteList.map((note) => note.id)
				)
			if (ownError) throw new Error(`Erro ao conferir as notas já recebidas: ${publicDbMessage(ownError)}`)
			for (const row of own ?? []) if (row.nfe_document_id) taken.add(row.nfe_document_id)
		}
		const matchesSupplier = (document: string | null | undefined) => supplier != null && normalizeSupplierDocument(document) === supplier

		const noteRows = noteList
			.filter((note) => !taken.has(note.id) || note.id === receipt.nfe_document_id)
			.map((note) => ({
				id: note.id,
				label: `NF-e ${note.access_key.slice(25, 34)} · ${note.supplier_name ?? note.supplier_cnpj ?? "emitente não identificado"}`,
				issuedAt: note.issued_at,
				totalValue: note.total_value == null ? null : Number(note.total_value),
				suggested: matchesSupplier(note.supplier_cnpj ?? note.supplier_cpf),
				cancelled: note.situation_result === "cancelled",
			}))
			.sort((a, b) => Number(b.suggested) - Number(a.suggested))
		const empenhoRows = (empenhos.data ?? [])
			.map((row) => ({
				id: row.id,
				label: `${row.numero_empenho}${row.favorecido_nome ? ` · ${row.favorecido_nome}` : ""}`,
				suggested: matchesSupplier(row.favorecido_cnpj),
			}))
			.sort((a, b) => Number(b.suggested) - Number(a.suggested))
		const orderRows = (orders.data ?? []).map((row) => ({
			id: row.id,
			label: `${row.number ? `OF ${row.number}` : "OF sem número"}${row.sent_at ? ` · enviada em ${new Date(`${row.sent_at}T12:00:00Z`).toLocaleDateString("pt-BR")}` : ""}`,
			empenhoId: row.empenho_id,
			suggested: receipt.empenho_id != null && row.empenho_id === receipt.empenho_id,
		}))

		return { notes: noteRows, supplyOrders: orderRows, empenhos: empenhoRows }
	})

/**
 * Vincula NF-e, OF e empenho a um recebimento já registrado — inclusive efetivado.
 *
 * A NF-e casa as linhas pelos itens (`matchReceiptLinesToInvoice`); com o recebimento ainda
 * aberto, a linha sem custo ganha o custo da linha da nota. Efetivado, nada muda no estoque:
 * o vínculo é documental. Chamado sem documento novo, refaz o casamento dos itens (o XML
 * que chegou depois da chave). A aplicação é atômica no banco (`link_receipt_documents`),
 * que recusa o que a regra de unidade, cozinha e liquidação não permite.
 */
export const linkReceiptDocumentsFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			receiptId: z.uuid(),
			nfeDocumentId: z.uuid().nullable().optional(),
			supplyOrderId: z.uuid().nullable().optional(),
			// também a NE recém-registrada pelo `QuickEmpenhoDialog`, que devolve o id dela
			empenhoId: z.uuid().nullable().optional(),
		})
	)
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: receipt, error: receiptError } = await inv
			.from("goods_receipt")
			.select("kitchen_id, definitive_at, nfe_document_id, supplier_document, empenho_id")
			.eq("id", data.receiptId)
			.maybeSingle()
		if (receiptError) throw new Error(`Erro ao carregar o recebimento: ${publicDbMessage(receiptError)}`)
		if (!receipt) throw new Error("Recebimento não encontrado")
		const { userId } = await requireStorageForKitchen(2, Number(receipt.kitchen_id))

		const nfeDocumentId = data.nfeDocumentId ?? receipt.nfe_document_id
		let links: Array<{ receipt_item_id: string; nfe_item_id: string }> = []
		let costs: Array<{ receipt_item_id: string; unit_cost: number }> = []
		let unmatchedLines: string[] = []
		let warnings: string[] = []

		if (nfeDocumentId) {
			const [doc, nfeItems, lines] = await Promise.all([
				inv.from("nfe_document").select("supplier_cnpj, supplier_cpf").eq("id", nfeDocumentId).maybeSingle(),
				inv
					.from("nfe_item")
					.select("id, n_item, description, ingredient_id, purchase_item_id, matched_qty_base, unit_price, commercial_qty")
					.eq("nfe_document_id", nfeDocumentId),
				inv.from("goods_receipt_item").select("id, ingredient_id, purchase_item_id, nfe_item_id, unit_cost, unit_cost_source").eq("receipt_id", data.receiptId),
			])
			for (const result of [doc, nfeItems, lines]) {
				if (result.error) throw new Error(`Erro ao carregar a nota e as linhas: ${publicDbMessage(result.error)}`)
			}
			if (!doc.data) throw new Error("NF-e não encontrada")
			const toNumber = (value: unknown) => (value == null ? null : Number(value))
			const lineRows = lines.data ?? []
			// Trocando de nota: o custo que veio da nota antiga sai no banco e a nova o repõe onde
			// casar — então, para o casamento, ele não existe. O item da nota antiga também não.
			const switchingNfe = data.nfeDocumentId != null && receipt.nfe_document_id != null && data.nfeDocumentId !== receipt.nfe_document_id
			const match = matchReceiptLinesToInvoice(
				lineRows.map((line) => ({
					id: String(line.id),
					ingredientId: line.ingredient_id ?? null,
					purchaseItemId: line.purchase_item_id ?? null,
					nfeItemId: switchingNfe ? null : (line.nfe_item_id ?? null),
					unitCost: switchingNfe && line.unit_cost_source === "invoice_link" ? null : toNumber(line.unit_cost),
				})),
				(nfeItems.data ?? []).map((item) => ({
					id: String(item.id),
					nItem: toNumber(item.n_item),
					description: item.description ?? null,
					ingredientId: item.ingredient_id ?? null,
					purchaseItemId: item.purchase_item_id ?? null,
					matchedQtyBase: toNumber(item.matched_qty_base),
					unitPrice: toNumber(item.unit_price),
					commercialQty: toNumber(item.commercial_qty),
				}))
			)
			links = match.links.map((link) => ({ receipt_item_id: link.receiptItemId, nfe_item_id: link.nfeItemId }))
			// efetivado: o custo já está no estoque e não muda
			costs = receipt.definitive_at ? [] : match.costs.map((cost) => ({ receipt_item_id: cost.receiptItemId, unit_cost: cost.unitCost }))

			const unmatchedIds = new Set(match.unmatchedLineIds)
			const unmatchedIngredients = lineRows.filter((line) => unmatchedIds.has(String(line.id)) && line.ingredient_id).map((line) => String(line.ingredient_id))
			if (unmatchedIngredients.length > 0) {
				const { data: names, error: namesError } = await kitchen().from("ingredient").select("description").in("id", unmatchedIngredients)
				if (namesError) throw new Error(`Erro ao carregar os insumos: ${publicDbMessage(namesError)}`)
				unmatchedLines = (names ?? []).map((row) => itemDescription(row.description))
			}

			const empenhoId = data.empenhoId ?? receipt.empenho_id
			let empenhoSupplierCnpj: string | null = null
			if (empenhoId) {
				const { data: empenho, error: empenhoError } = await finance().from("empenho").select("favorecido_cnpj").eq("id", empenhoId).maybeSingle()
				if (empenhoError) throw new Error(`Erro ao carregar o empenho: ${publicDbMessage(empenhoError)}`)
				empenhoSupplierCnpj = empenho?.favorecido_cnpj ?? null
			}
			warnings = receiptLinkWarnings({
				receiptSupplierDocument: receipt.supplier_document ?? null,
				empenhoSupplierCnpj,
				invoiceSupplierDocument: doc.data.supplier_cnpj ?? doc.data.supplier_cpf ?? null,
				invoiceHasItems: (nfeItems.data ?? []).length > 0,
				attested: receipt.definitive_at != null,
			})
		}

		const { data: result, error } = await inv.rpc("link_receipt_documents", {
			p_receipt_id: data.receiptId,
			p_user: userId,
			p_nfe_document_id: data.nfeDocumentId ?? undefined,
			p_supply_order_id: data.supplyOrderId ?? undefined,
			p_empenho_id: data.empenhoId ?? undefined,
			p_item_links: links,
			p_line_costs: costs,
		})
		// As recusas da função já dizem o que fazer ("A OF é de outro empenho — …").
		if (error) throw new Error(publicDbMessage(error))
		const row = (result ?? [])[0]
		return {
			linkedItems: Number(row?.linked_items ?? 0),
			costedItems: Number(row?.costed_items ?? 0),
			unmatchedLines,
			warnings,
		}
	})

/**
 * O que a tela do recebimento precisa saber além das linhas: a designação de quem está
 * olhando (e se pode designar ali mesmo), a situação da nota para efetivar, os documentos
 * ligados e se já há liquidação.
 */
export const fetchReceiptContextFn = createServerFn({ method: "GET" })
	.validator(z.object({ receiptId: z.uuid() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		// Recebimento e cozinha lidos UMA vez; designação e nota recebem o que já está em mãos.
		const { data: receipt, error } = await inv
			.from("goods_receipt")
			.select("kitchen_id, empenho_id, supply_order_id, nfe_document_id, source")
			.eq("id", data.receiptId)
			.maybeSingle()
		if (error) throw new Error(`Erro ao carregar o recebimento: ${publicDbMessage(error)}`)
		if (!receipt) throw new Error("Recebimento não encontrado")
		const ctx = await requireStorageForKitchen(1, Number(receipt.kitchen_id))
		const scope: DesignationScope = {
			unitId: await purchaseUnitOfKitchen(Number(receipt.kitchen_id)),
			empenhoId: receipt.empenho_id ?? null,
		}

		const [provisional, definitive, note, order, empenho, liquidacoes] = await Promise.all([
			findDesignation(scope, ctx.userId, "provisional"),
			findDesignation(scope, ctx.userId, "definitive"),
			receipt.nfe_document_id
				? inv
						.from("nfe_document")
						.select("access_key, supplier_name, status, situation_result, situation_checked_at")
						.eq("id", receipt.nfe_document_id)
						.maybeSingle()
				: Promise.resolve({ data: null, error: null }),
			receipt.supply_order_id
				? procurement().from("supply_order").select("number, empenho_id").eq("id", receipt.supply_order_id).maybeSingle()
				: Promise.resolve({ data: null, error: null }),
			receipt.empenho_id
				? finance().from("empenho").select("numero_empenho, favorecido_nome").eq("id", receipt.empenho_id).maybeSingle()
				: Promise.resolve({ data: null, error: null }),
			finance().from("liquidacao").select("id", { count: "exact", head: true }).eq("goods_receipt_id", data.receiptId),
		])
		for (const result of [note, order, empenho, liquidacoes]) {
			if (result.error) throw new Error(`Erro ao carregar os documentos do recebimento: ${publicDbMessage(result.error)}`)
		}
		if (receipt.nfe_document_id && !note.data) throw new Error("A NF-e deste recebimento não foi encontrada")
		const invoice = note.data
			? { status: String(note.data.status), situationResult: note.data.situation_result ?? null, situationCheckedAt: note.data.situation_checked_at ?? null }
			: null

		return {
			unitId: scope.unitId,
			source: String(receipt.source) as ReceiptSource,
			canDesignate: canDesignateInUnit(ctx.permissions, scope.unitId),
			designation: { provisional, definitive },
			invoice:
				invoice && note.data
					? {
							problem: invoiceSituationProblem(invoice),
							cancelled: isInvoiceCancelled(invoice),
							label: `NF-e ${String(note.data.access_key).slice(25, 34)}${note.data.supplier_name ? ` · ${note.data.supplier_name}` : ""}`,
						}
					: null,
			supplyOrder: order.data
				? {
						id: String(receipt.supply_order_id),
						label: order.data.number ? `OF ${order.data.number}` : "OF sem número",
						// a NE desta entrega se vincula na OF (SICAF), e o recebimento a acompanha
						awaitingEmpenho: order.data.empenho_id == null,
					}
				: null,
			empenho: empenho.data ? { label: `${empenho.data.numero_empenho}${empenho.data.favorecido_nome ? ` · ${empenho.data.favorecido_nome}` : ""}` } : null,
			liquidated: (liquidacoes.count ?? 0) > 0,
		}
	})
