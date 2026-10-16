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
 *
 * O arredondamento é o `roundToCents` comum. O `round2` local que existia aqui
 * (#363) não seguia regra da SEFAZ (o leiaute da NF-e só fixa duas casas; o
 * modo de arredondar é do emissor): a intenção declarada era o meio-centavo
 * simétrico no negativo, que o `roundToCents` também dá. Só que o `EPSILON`
 * não alcançava o erro de representação (1,005 × 100 = 100,4999…), e 1,005
 * fechava em 1,00.
 */

import { roundToCents } from "./money.ts"

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

/**
 * Valor não numérico num item (ou no `vNF`): o cálculo recusa em vez de seguir.
 *
 * O `roundToCents` transforma NaN em 0, então um `vProd` ou `vDesc` que o parser deixou passar
 * entraria como custo zero legítimo, e total e diferença fechariam sem acusar nada.
 */
export class NfeCostError extends Error {
	readonly invalidItems: readonly number[]
	constructor(message: string, invalidItems: readonly number[]) {
		super(message)
		this.name = "NfeCostError"
		this.invalidItems = invalidItems
	}
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
 *
 * @throws {NfeCostError} item com valor não finito, ou `invoiceTotal` presente e não finito.
 */
export function computeNfeItemCosts(items: readonly NfeItemValues[], invoiceTotal?: number | null): NfeCostResult {
	const raw = items.map((item) => ({ item, total: itemTotal(item) }))
	const invalidItems = raw.filter((entry) => !Number.isFinite(entry.total)).map((entry) => entry.item.nItem)
	if (invalidItems.length > 0) {
		throw new NfeCostError(
			`NF-e com valor não numérico no(s) item(ns) ${invalidItems.join(", ")}: confira vProd, vDesc, vFrete, vSeg, vOutro, vIPI e vST`,
			invalidItems
		)
	}
	if (invoiceTotal != null && !Number.isFinite(invoiceTotal)) throw new NfeCostError("NF-e com valor total (vNF) não numérico", [])
	const computed = raw.map((entry) => ({ item: entry.item, total: roundToCents(entry.total) }))
	const sum = roundToCents(computed.reduce((acc, entry) => acc + entry.total, 0))

	let adjustment = 0
	if (invoiceTotal != null && Number.isFinite(invoiceTotal)) {
		adjustment = roundToCents(invoiceTotal - sum)
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
		if (entry) entry.total = roundToCents(entry.total + adjustment)
	}

	const finalSum = roundToCents(computed.reduce((acc, entry) => acc + entry.total, 0))

	return {
		items: computed.map((entry) => ({
			nItem: entry.item.nItem,
			totalCost: entry.total,
			unitCostBase: entry.item.baseQuantity != null && entry.item.baseQuantity > 0 ? Number((entry.total / entry.item.baseQuantity).toFixed(4)) : null,
		})),
		total: finalSum,
		invoiceDifference: invoiceTotal != null && Number.isFinite(invoiceTotal) ? roundToCents(invoiceTotal - finalSum) : 0,
	}
}
