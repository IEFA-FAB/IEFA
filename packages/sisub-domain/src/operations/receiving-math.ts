/**
 * Derivações puras do recebimento — extraídas de `receiving.fn.ts`.
 *
 * Motivo da extração: o que estas funções decidem é custo unitário no ledger e
 * se a linha exige justificativa. Enquanto viviam dentro do `.handler()`, junto
 * de auth e I/O, não havia como testá-las — e teste que importa `@/server/*`
 * puxa `env.server.ts`, que valida credencial na carga do módulo e passa na
 * máquina de quem tem `.env` enquanto quebra no CI.
 */

/** Escala do `numeric(12,4)` de custo. */
const COST_SCALE = 4

export interface NfeCostInput {
	/** Quantidade na unidade base já correlacionada (matched_qty_base). */
	invoicedQtyBase: number | null
	/** Preço unitário COMERCIAL da nota — por caixa, fardo, o que a nota usar. */
	unitPrice: number | null
	/** Quantidade comercial da nota, na mesma unidade do unitPrice. */
	commercialQty: number | null
}

/**
 * Custo unitário na UNIDADE BASE a partir da nota.
 *
 * A nota preça a embalagem (R$ 125 o fardo); o ledger valora o gênero (R$/kg).
 * Sem a divisão pelo conteúdo, o custo médio ponderado entra 25× maior num
 * fardo de 5 kg — e o ledger é append-only, então o conserto é movimento de
 * ajuste, não UPDATE.
 *
 * Devolve null quando não dá para dividir: sem preço, sem quantidade comercial
 * ou com quantidade base zero. Null é honesto — zero seria um custo afirmado.
 */
export function unitCostFromNfe(input: NfeCostInput): number | null {
	const { invoicedQtyBase, unitPrice, commercialQty } = input
	if (unitPrice == null || commercialQty == null) return null
	if (invoicedQtyBase == null || !(invoicedQtyBase > 0)) return null

	const totalValue = unitPrice * commercialQty
	if (!Number.isFinite(totalValue)) return null

	const unitCost = Number((totalValue / invoicedQtyBase).toFixed(COST_SCALE))
	return Number.isFinite(unitCost) ? unitCost : null
}

/**
 * A quantidade conferida diverge da faturada?
 *
 * Só há divergência quando existe faturado com que comparar: recebimento sem
 * nota (entrega direta) não é divergente por não ter referência.
 */
export function divergesFromInvoice(invoicedQtyBase: number | null, receivedQtyBase: number): boolean {
	if (invoicedQtyBase == null) return false
	return receivedQtyBase !== invoicedQtyBase
}

/**
 * Divergência sem motivo não passa. É a regra do art. 140: recusar ou aceitar a
 * menos é decisão registrada, não silêncio.
 */
export function requiresDivergenceReason(invoicedQtyBase: number | null, receivedQtyBase: number, reason: string | null | undefined): boolean {
	return divergesFromInvoice(invoicedQtyBase, receivedQtyBase) && !reason?.trim()
}
