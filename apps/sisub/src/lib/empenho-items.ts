/**
 * @module empenho-items
 * Leituras puras sobre os itens da nota de empenho (`finance.empenho_item`), a fonte do que a NE
 * cobre desde que o cabeçalho deixou de ter quantidade e preço. Somar itens só faz sentido quando
 * eles falam da mesma coisa: quantidade de itens em unidades diferentes (quilo com litro), ou de
 * item só por valor, não se soma.
 */

type Numeric = number | string | null

export interface EmpenhoItemAmounts {
	quantity: Numeric
	unit_price: Numeric
	value: number | string
}

/**
 * Quantidade empenhada da NE inteira: a soma quando todos os itens têm quantidade e a mesma
 * unidade informada; `null` ("—" na tela) quando há item só por valor, unidades diferentes, ou
 * mais de um item sem unidade (não dá para saber se são a mesma).
 */
export function committedQuantity(items: ReadonlyArray<{ quantity: Numeric; unit: string | null }>): number | null {
	if (items.length === 0 || items.some((item) => item.quantity == null)) return null
	if (items.length > 1) {
		const units = new Set(items.map((item) => item.unit?.trim().toLowerCase() || null))
		if (units.size !== 1 || units.has(null)) return null
	}
	return Number(items.reduce((sum, item) => sum + Number(item.quantity), 0).toFixed(4))
}

export interface ArpItemShare {
	/** Soma das quantidades; nula quando algum item é só por valor. */
	item_quantity: number | null
	/** Preço comum a todos os itens; nulo quando divergem (a tela mostra o preço médio, dito como médio). */
	item_unit_price: number | null
	item_value: number
}

/**
 * Parte de UMA NE num item da ARP: os itens dela que apontam para ele (a NE pode ter dois itens do
 * mesmo item de ARP, com preços diferentes). Sem itens, o valor é o `fallbackValue`.
 */
export function summarizeArpItemShare(items: readonly EmpenhoItemAmounts[], fallbackValue: number): ArpItemShare {
	if (items.length === 0) return { item_quantity: null, item_unit_price: null, item_value: fallbackValue }
	const value = Number(items.reduce((sum, item) => sum + Number(item.value), 0).toFixed(2))
	const quantified = items.every((item) => item.quantity != null)
	const quantity = quantified ? Number(items.reduce((sum, item) => sum + Number(item.quantity), 0).toFixed(4)) : null
	const prices = new Set(items.map((item) => (item.unit_price == null ? null : Number(item.unit_price))))
	const [onlyPrice] = [...prices]
	const unitPrice = quantified && prices.size === 1 && onlyPrice != null ? onlyPrice : null
	return { item_quantity: quantity, item_unit_price: unitPrice, item_value: value }
}
