/**
 * Custo de aquisição por item da NF-e.
 *
 * `qCom × vUnCom` não é o custo do gênero. Pelo MCASP e pela NBC TSP 04, o
 * custo de aquisição inclui frete, seguro, outras despesas e tributos NÃO
 * recuperáveis, menos descontos — e o órgão público não recupera ICMS nem IPI.
 * Somando só produto, a conta não fecha com o `vNF` da nota, e o estoque entra
 * subvalorizado exatamente na parte que o frete representa (que em hortifrúti
 * de entrega diária não é desprezível).
 *
 * O rateio é por ITEM, com os valores que o próprio `det` traz. A diferença de
 * arredondamento sobra na linha de maior valor: espalhá-la faz cada linha
 * fechar em centavo diferente do que a nota diz.
 */

export interface NfeItemValues {
	/** Índice do item na nota (`nItem`) — usado para devolver o resultado. */
	nItem: number
	/** `vProd` — quantidade × valor unitário comercial. */
	productValue: number
	/** `vDesc` — desconto. */
	discount?: number | null
	/** `vFrete`. */
	freight?: number | null
	/** `vSeg` — seguro. */
	insurance?: number | null
	/** `vOutro` — outras despesas acessórias. */
	otherExpenses?: number | null
	/** `vIPI` — não recuperável pelo órgão. */
	ipi?: number | null
	/** `vST`/`vFCPST` — ICMS por substituição, também não recuperável. */
	icmsSt?: number | null
	fcpSt?: number | null
	/** Quantidade na unidade BASE do insumo (já convertida pelo matching). */
	baseQuantity?: number | null
}

export interface NfeItemCost {
	nItem: number
	/** Custo total do item, com rateio de frete, seguro, tributos e desconto. */
	totalCost: number
	/** Custo por unidade base; null quando a conversão ainda não existe. */
	unitCostBase: number | null
}

export interface NfeCostResult {
	items: NfeItemCost[]
	/** Soma dos custos dos itens — igual ao `vNF` quando a nota é consistente. */
	total: number
	/**
	 * Diferença entre a soma dos itens e o `vNF` informado, em reais. Zero
	 * quando fecha. Diferente de zero é dado da nota para o operador conferir,
	 * não algo para o sistema "corrigir" em silêncio.
	 */
	invoiceDifference: number
}

function round2(value: number): number {
	// arredondamento pela metade PARA CIMA em valor absoluto: o
	// `Math.round` do JS desce o meio-centavo negativo
	return (Math.sign(value) * Math.round(Math.abs(value) * 100 + Number.EPSILON)) / 100
}

function itemTotal(item: NfeItemValues): number {
	return (
		item.productValue -
		(item.discount ?? 0) +
		(item.freight ?? 0) +
		(item.insurance ?? 0) +
		(item.otherExpenses ?? 0) +
		(item.ipi ?? 0) +
		(item.icmsSt ?? 0) +
		(item.fcpSt ?? 0)
	)
}

/**
 * Calcula o custo de cada item e confere contra o `vNF`.
 *
 * `invoiceTotal` ausente desliga a conferência (nota sem total é nota que o
 * parser já deveria ter recusado, mas o cálculo não depende dela).
 */
export function computeNfeItemCosts(items: readonly NfeItemValues[], invoiceTotal?: number | null): NfeCostResult {
	const computed = items.map((item) => ({ item, total: round2(itemTotal(item)) }))
	const sum = round2(computed.reduce((acc, entry) => acc + entry.total, 0))

	let adjustment = 0
	if (invoiceTotal != null && Number.isFinite(invoiceTotal)) {
		adjustment = round2(invoiceTotal - sum)
	}

	// a sobra de arredondamento vai para a linha de maior valor
	let heaviest = -1
	let heaviestValue = Number.NEGATIVE_INFINITY
	for (const [index, entry] of computed.entries()) {
		if (entry.total > heaviestValue) {
			heaviestValue = entry.total
			heaviest = index
		}
	}
	// só absorve centavos de arredondamento; diferença grande é problema da nota
	// e precisa ficar visível, não escondida numa linha
	const absorbable = Math.abs(adjustment) <= Math.max(0.05, computed.length * 0.01)
	if (absorbable && heaviest >= 0 && adjustment !== 0) {
		const entry = computed[heaviest]
		if (entry) entry.total = round2(entry.total + adjustment)
	}

	const finalSum = round2(computed.reduce((acc, entry) => acc + entry.total, 0))

	return {
		items: computed.map((entry) => ({
			nItem: entry.item.nItem,
			totalCost: entry.total,
			unitCostBase: entry.item.baseQuantity != null && entry.item.baseQuantity > 0 ? Number((entry.total / entry.item.baseQuantity).toFixed(4)) : null,
		})),
		total: finalSum,
		invoiceDifference: invoiceTotal != null && Number.isFinite(invoiceTotal) ? round2(invoiceTotal - finalSum) : 0,
	}
}
