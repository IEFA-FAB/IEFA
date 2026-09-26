/**
 * Recebimento sem NF-e e vínculo posterior (change `sisub-flexible-expense-execution`, D5).
 *
 * Regras puras: o casamento das linhas de um recebimento já registrado com os itens da NF-e
 * que chegou depois, e o que avisar antes de vincular. A aplicação é atômica no banco
 * (`inventory.link_receipt_documents`, 20260926215000), que confere o que chega daqui.
 *
 * A nota semanal do pão cobre cinco entregas diárias: cada entrega casa a sua linha com o
 * MESMO item da nota. Por isso o casamento não "consome" o item — duas linhas do mesmo
 * recebimento é que não disputam o mesmo item enquanto houver outro livre.
 */

import { unitCostFromNfe } from "./receiving-math.ts"

/** Origens do recebimento (`inventory.goods_receipt.source`). */
export const RECEIPT_SOURCES = ["nfe", "delivery_note", "ad_hoc"] as const
export type ReceiptSource = (typeof RECEIPT_SOURCES)[number]

export const RECEIPT_SOURCE_LABELS: Record<ReceiptSource, string> = {
	nfe: "NF-e",
	delivery_note: "Guia de remessa",
	ad_hoc: "Entrega sem documento",
}

export interface ReceiptLineForLink {
	id: string
	ingredientId: string | null
	purchaseItemId: string | null
	nfeItemId: string | null
	unitCost: number | null
}

export interface InvoiceItemForLink {
	id: string
	nItem: number | null
	description: string | null
	ingredientId: string | null
	purchaseItemId: string | null
	/** Quantidade da linha da nota na unidade base (`nfe_item.matched_qty_base`). */
	matchedQtyBase: number | null
	unitPrice: number | null
	commercialQty: number | null
}

export interface ReceiptInvoiceMatch {
	/** Linha → item da nota, só as que mudam (linha já ligada ao mesmo item não entra). */
	links: Array<{ receiptItemId: string; nfeItemId: string }>
	/** Custo da linha sem custo, pelo preço da nota na unidade base. */
	costs: Array<{ receiptItemId: string; unitCost: number }>
	/** Linhas sem item correspondente na nota. */
	unmatchedLineIds: string[]
	/** Linhas com mais de um item possível: casadas com o primeiro livre, pela ordem da nota. */
	ambiguousLineIds: string[]
	/** Itens da nota que nenhuma linha deste recebimento usou. */
	unusedInvoiceItemIds: string[]
}

function candidatesFor(line: ReceiptLineForLink, items: readonly InvoiceItemForLink[]): InvoiceItemForLink[] {
	// O insumo é o que a conferência conhece; o item de compra é o desempate quando a
	// nota ainda não teve o insumo resolvido.
	const byIngredient = line.ingredientId ? items.filter((item) => item.ingredientId === line.ingredientId) : []
	if (byIngredient.length > 0) return byIngredient
	return line.purchaseItemId ? items.filter((item) => item.purchaseItemId === line.purchaseItemId) : []
}

/**
 * Casa as linhas do recebimento com os itens da NF-e.
 *
 * Linha já ligada a um item desta nota fica como está. As demais procuram o item pelo insumo
 * (ou pelo item de compra); havendo vários, o primeiro ainda não usado por outra linha deste
 * recebimento, na ordem da nota. Linha sem candidato fica sem vínculo e é dita, não inventada.
 */
export function matchReceiptLinesToInvoice(lines: readonly ReceiptLineForLink[], items: readonly InvoiceItemForLink[]): ReceiptInvoiceMatch {
	const ordered = [...items].sort((a, b) => (a.nItem ?? Number.MAX_SAFE_INTEGER) - (b.nItem ?? Number.MAX_SAFE_INTEGER))
	const itemIds = new Set(ordered.map((item) => item.id))
	const used = new Set<string>()
	for (const line of lines) if (line.nfeItemId && itemIds.has(line.nfeItemId)) used.add(line.nfeItemId)

	const result: ReceiptInvoiceMatch = { links: [], costs: [], unmatchedLineIds: [], ambiguousLineIds: [], unusedInvoiceItemIds: [] }
	const chosenByLine = new Map<string, InvoiceItemForLink>()

	for (const line of lines) {
		if (line.nfeItemId && itemIds.has(line.nfeItemId)) {
			chosenByLine.set(line.id, ordered.find((item) => item.id === line.nfeItemId) as InvoiceItemForLink)
			continue
		}
		const candidates = candidatesFor(line, ordered)
		if (candidates.length === 0) {
			result.unmatchedLineIds.push(line.id)
			continue
		}
		if (candidates.length > 1) result.ambiguousLineIds.push(line.id)
		const chosen = candidates.find((item) => !used.has(item.id)) ?? candidates[0]
		used.add(chosen.id)
		chosenByLine.set(line.id, chosen)
		result.links.push({ receiptItemId: line.id, nfeItemId: chosen.id })
	}

	for (const line of lines) {
		const chosen = chosenByLine.get(line.id)
		if (!chosen || line.unitCost != null) continue
		// Custo pela LINHA DA NOTA (preço × quantidade comercial ÷ quantidade base da nota), nunca
		// pelo recebido: a nota semanal soma cinco entregas, e dividir o valor da semana pelo pão
		// de um dia inflaria o custo cinco vezes.
		const unitCost = unitCostFromNfe({ invoicedQtyBase: chosen.matchedQtyBase, unitPrice: chosen.unitPrice, commercialQty: chosen.commercialQty })
		if (unitCost != null) result.costs.push({ receiptItemId: line.id, unitCost })
	}

	result.unusedInvoiceItemIds = ordered.filter((item) => !used.has(item.id)).map((item) => item.id)
	return result
}

const digits = (value: string | null | undefined): string | null => {
	const only = (value ?? "").replace(/\D/g, "")
	return only.length > 0 ? only : null
}

export interface ReceiptLinkCheckInput {
	/** Documento de quem entregou, informado no recebimento sem nota. */
	receiptSupplierDocument: string | null
	/** Favorecido do empenho já ligado (ou a ligar). */
	empenhoSupplierCnpj: string | null
	/** Emitente da NF-e a ligar. */
	invoiceSupplierDocument: string | null
	/** A NF-e a ligar tem itens (XML importado)? Nota só pela chave não tem. */
	invoiceHasItems: boolean
	/** O recebimento já foi efetivado (o custo já está no estoque). */
	attested: boolean
}

/**
 * Avisos antes de vincular. Nenhum impede o vínculo — quem recusa é o banco, pelas regras de
 * unidade, cozinha e liquidação —, mas cada um diz o que o vínculo vai deixar de fora.
 */
export function receiptLinkWarnings(input: ReceiptLinkCheckInput): string[] {
	const warnings: string[] = []
	const invoice = digits(input.invoiceSupplierDocument)
	const receipt = digits(input.receiptSupplierDocument)
	const empenho = digits(input.empenhoSupplierCnpj)
	if (invoice && receipt && invoice !== receipt) {
		warnings.push("A NF-e é de outro emitente, não de quem entregou: confira se é a nota desta entrega.")
	}
	if (invoice && empenho && invoice !== empenho) {
		warnings.push("O emitente da NF-e não é o favorecido do empenho: a liquidação exige nota do credor do empenho (Lei 4.320, art. 63).")
	}
	if (!input.invoiceHasItems) {
		warnings.push("A NF-e só tem a chave (XML não importado): o vínculo fica, e os itens casam quando o XML chegar.")
	}
	if (input.attested) {
		warnings.push("O recebimento já foi efetivado: o vínculo não muda quantidade, custo nem estoque.")
	}
	return warnings
}

export interface ReceiptLineInput {
	ingredientId: string
	quantityBase: number
	unitCost?: number | null
}

/**
 * O que impede registrar uma entrega sem NF-e. Guia exige o número; toda linha precisa de
 * insumo e quantidade; o mesmo insumo duas vezes vira uma linha só na conferência (e o
 * lote é que separa validades).
 */
export function receiptWithoutInvoiceProblems(input: {
	source: Exclude<ReceiptSource, "nfe">
	deliveryNoteNumber: string | null
	supplierDocument: string | null
	lines: readonly ReceiptLineInput[]
}): string[] {
	const problems: string[] = []
	if (input.source === "delivery_note" && !input.deliveryNoteNumber?.trim()) {
		problems.push("Informe o número da guia de remessa — sem número, registre como entrega sem documento")
	}
	const document = digits(input.supplierDocument)
	if (input.supplierDocument?.trim() && (!document || (document.length !== 11 && document.length !== 14))) {
		problems.push("Documento do fornecedor inválido: informe o CNPJ (14 dígitos) ou o CPF (11)")
	}
	if (input.lines.length === 0) problems.push("Informe ao menos um item recebido")
	const seen = new Set<string>()
	for (const line of input.lines) {
		if (!(line.quantityBase > 0)) problems.push("Toda linha precisa de quantidade maior que zero")
		if (line.unitCost != null && !(line.unitCost >= 0)) problems.push("Custo unitário não pode ser negativo")
		if (seen.has(line.ingredientId))
			problems.push("O mesmo insumo aparece em duas linhas — some as quantidades numa linha só; validades diferentes vão nos lotes")
		seen.add(line.ingredientId)
	}
	return [...new Set(problems)]
}

/** CNPJ/CPF só com dígitos, ou nulo. */
export function normalizeSupplierDocument(value: string | null | undefined): string | null {
	return digits(value)
}
