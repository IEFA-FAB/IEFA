/**
 * Derivações puras da liquidação — extraídas de `liquidation.fn.ts`.
 *
 * As três decisões aqui mexem em dinheiro e em autorização: quanto a NS
 * sugere, em que competência ela cai, e contra QUAL unidade o escopo é
 * verificado. Nenhuma tinha teste.
 */

export interface ReceiptValueItem {
	receivedQtyBase: number
	unitCost: number | null
}

/**
 * Valor sugerido da NS: soma de quantidade × custo unitário, em centavos
 * fechados.
 *
 * Item sem custo entra como zero e NÃO derruba a soma — é a linha que ainda
 * não foi precificada, e travar aqui impediria liquidar o recebimento inteiro
 * por causa de uma. O valor é sugestão: quem confirma é quem assina a NS.
 */
export function suggestedLiquidationValue(items: readonly ReceiptValueItem[]): number {
	const total = items.reduce((acc, item) => {
		const qty = Number(item.receivedQtyBase)
		const cost = Number(item.unitCost ?? 0)
		if (!Number.isFinite(qty) || !Number.isFinite(cost)) return acc
		return acc + qty * cost
	}, 0)
	return roundToCents(total)
}

/**
 * Arredonda para centavo — e NÃO com `toFixed(2)`, que era o que estava em
 * produção.
 *
 * `(10.005).toFixed(2)` devolve "10.00": 10,005 em binário é 10,00499…, então
 * o meio-centavo cai sempre para baixo. Num valor só é um centavo; numa NS que
 * soma dezenas de itens, é um centavo por item sempre no mesmo sentido, e a
 * diferença aparece na conciliação contra o SIAFI sem ninguém saber de onde veio.
 *
 * `toPrecision(12)` normaliza o erro de representação ANTES do arredondamento,
 * então 1000,4999999999999 volta a ser 1000,5 e sobe para 1001 centavos.
 */
export function roundToCents(value: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.round(Number((value * 100).toPrecision(12))) / 100
}

/** Competência contábil de uma data ISO: sempre o primeiro dia do mês. */
export function competenciaFromDate(isoDate: string): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error(`Data inválida para competência: ${isoDate}`)
	return `${isoDate.substring(0, 7)}-01`
}

/** Número de NS canônico: sem espaço nas bordas, em caixa alta. */
export function normalizeNsNumber(raw: string): string {
	return raw.trim().toUpperCase()
}

export interface KitchenUnitRef {
	unitId: number | null
	purchaseUnitId: number | null
}

/**
 * Contra qual unidade o escopo é verificado.
 *
 * `purchase_unit_id` vence porque quem empenha e liquida é a unidade
 * COMPRADORA — uma cozinha pode ser servida por outra OM. Inverter a
 * precedência autorizaria contra a unidade errada, que é falha de autorização,
 * não de exibição.
 */
export function resolvePurchaseUnitId(kitchen: KitchenUnitRef | null | undefined): number | null {
	const resolved = kitchen?.purchaseUnitId ?? kitchen?.unitId ?? null
	return resolved != null && Number.isFinite(Number(resolved)) ? Number(resolved) : null
}

// ============================================================================
// Teto da liquidação pelo recebido (achado F2 / tarefa 5.3)
// ============================================================================

export type ReceiptLiquidationCeiling =
	/** Todos os itens têm custo: o teto é Σ quantidade recebida × custo. */
	| { basis: "itens"; value: number; unpricedItems: 0 }
	/** Algum item sem custo, mas o recebimento tem NF-e: vale o total da nota. */
	| { basis: "nfe"; value: number; unpricedItems: number }
	/** Item sem custo e sem NF-e: não há como dizer quanto chegou. */
	| { basis: "indeterminado"; value: null; unpricedItems: number }

/**
 * Quanto do recebimento pode ser liquidado.
 *
 * Liquidar é atestar o direito do credor pelo que foi entregue (Lei 4.320, art. 63, § 2º,
 * III): NS acima do recebido é pagar pelo que não chegou. Item sem custo não derruba o
 * teto para zero (seria recusar a NS inteira por uma linha não precificada); com NF-e,
 * vale o total da nota; sem ela, o teto é indeterminado e a liquidação segue com a
 * pendência de precificar o recebimento. É a mesma regra do trigger
 * `finance.check_liquidacao_within_receipt` (20260926216000).
 */
export function receiptLiquidationCeiling(items: readonly ReceiptValueItem[], nfeTotalValue: number | null): ReceiptLiquidationCeiling {
	const unpricedItems = items.filter((item) => item.unitCost == null || !Number.isFinite(Number(item.unitCost))).length
	if (unpricedItems === 0) return { basis: "itens", value: suggestedLiquidationValue(items), unpricedItems: 0 }
	if (nfeTotalValue != null && Number.isFinite(Number(nfeTotalValue))) return { basis: "nfe", value: roundToCents(Number(nfeTotalValue)), unpricedItems }
	return { basis: "indeterminado", value: null, unpricedItems }
}

/** Mensagem de recusa quando a NS passaria do recebido; `null` quando cabe (ou o teto é indeterminado). */
export function liquidationExceedsReceiptProblem(input: { ceiling: ReceiptLiquidationCeiling; alreadyLiquidated: number; valor: number }): string | null {
	if (input.ceiling.value == null) return null
	const total = roundToCents(input.alreadyLiquidated + input.valor)
	if (total <= input.ceiling.value) return null
	const saldo = Math.max(0, roundToCents(input.ceiling.value - input.alreadyLiquidated))
	const base = input.ceiling.basis === "nfe" ? "o total da NF-e" : "o valor recebido"
	return `A liquidação passa ${base} (R$ ${input.ceiling.value.toFixed(2)}; já liquidado R$ ${roundToCents(input.alreadyLiquidated).toFixed(2)}). Liquide no máximo R$ ${saldo.toFixed(2)} por este recebimento, ou vincule a NS a outro recebimento (Lei 4.320, art. 63).`
}

/**
 * Pendência "liquidação sem recebimento vinculado": a NS foi registrada sem o
 * recebimento que a sustenta. Não é recusa (despesa que não é gênero não passa
 * pelo almoxarifado, e o recebimento pode ser vinculado depois); é o que a lista de
 * pendências da execução mostra.
 */
export function isLiquidationWithoutReceipt(liquidacao: { goodsReceiptId: string | null | undefined }): boolean {
	return liquidacao.goodsReceiptId == null || liquidacao.goodsReceiptId === ""
}

// ============================================================================
// Retenções na liquidação e pagamento pelo líquido (achado F7)
// ============================================================================

/**
 * Tributos e contribuições retidos na fonte pelo órgão pagador: IR, CSLL, COFINS e
 * PIS/PASEP (Lei 9.430/1996, art. 64; Lei 10.833/2003, art. 34; IN RFB 1.234/2012),
 * INSS (Lei 8.212/1991, art. 31, cessão de mão de obra) e ISS (LC 116/2003, art. 6º).
 */
export const DEDUCTION_KINDS = ["ir", "csll", "cofins", "pis", "inss", "iss", "outra"] as const
export type DeductionKind = (typeof DEDUCTION_KINDS)[number]

export const DEDUCTION_LABELS: Record<DeductionKind, string> = {
	ir: "IR",
	csll: "CSLL",
	cofins: "COFINS",
	pis: "PIS/PASEP",
	inss: "INSS",
	iss: "ISS",
	outra: "Outra",
}

/** Documento de recolhimento: DARF (tributo federal), DAR (municipal/estadual), GPS (INSS). */
export const DEDUCTION_DOCUMENT_KINDS = ["darf", "dar", "gps", "outro"] as const
export type DeductionDocumentKind = (typeof DEDUCTION_DOCUMENT_KINDS)[number]

export interface DeductionEntry {
	valor: number
	/** Data do recolhimento; `null` = retida, ainda não recolhida. */
	recolhidaEm: string | null
}

export interface LiquidationNetBalance {
	bruto: number
	deducoes: number
	/** O que a OB paga ao credor: bruto − deduções. */
	liquido: number
	/** Σ OB ao credor. */
	pago: number
	/** Líquido ainda não pago ao credor. */
	aPagar: number
	/** Deduções retidas e ainda não recolhidas. */
	aRecolher: number
}

/**
 * Saldo da NS separado entre credor e fisco. O credor recebe o LÍQUIDO; a retenção
 * é paga ao fisco pelo DARF/DAR/GPS. Sem dedução, `liquido = bruto` e nada muda.
 */
export function liquidationNetBalance(input: { bruto: number; deducoes: readonly DeductionEntry[]; pagamentos: readonly number[] }): LiquidationNetBalance {
	const bruto = roundToCents(Number(input.bruto))
	const deducoes = roundToCents(input.deducoes.reduce((acc, d) => acc + Number(d.valor), 0))
	const aRecolher = roundToCents(input.deducoes.filter((d) => d.recolhidaEm == null).reduce((acc, d) => acc + Number(d.valor), 0))
	const liquido = roundToCents(bruto - deducoes)
	const pago = roundToCents(input.pagamentos.reduce((acc, v) => acc + Number(v), 0))
	return { bruto, deducoes, liquido, pago, aPagar: roundToCents(liquido - pago), aRecolher }
}

/** Recusa da OB acima do líquido (mesma regra do trigger `check_pagamento_within_liquidacao`). */
export function paymentExceedsNetProblem(balance: LiquidationNetBalance, valor: number): string | null {
	if (roundToCents(balance.pago + valor) <= balance.liquido) return null
	if (balance.deducoes === 0) {
		return `O pagamento passa o valor liquidado (R$ ${balance.bruto.toFixed(2)}; já pago R$ ${balance.pago.toFixed(2)}). Pague no máximo R$ ${Math.max(0, balance.aPagar).toFixed(2)}.`
	}
	return `A OB paga o líquido: bruto R$ ${balance.bruto.toFixed(2)} − deduções R$ ${balance.deducoes.toFixed(2)} = R$ ${balance.liquido.toFixed(2)} (já pago R$ ${balance.pago.toFixed(2)}). Pague no máximo R$ ${Math.max(0, balance.aPagar).toFixed(2)}; a retenção é recolhida por DARF/DAR/GPS.`
}

/** Recusa da dedução que, somada ao já pago, passaria o bruto. */
export function deductionExceedsProblem(balance: LiquidationNetBalance, valor: number): string | null {
	if (roundToCents(balance.deducoes + balance.pago + valor) <= balance.bruto) return null
	return `A dedução passa o que resta da NS: bruto R$ ${balance.bruto.toFixed(2)}, deduções R$ ${balance.deducoes.toFixed(2)}, já pago ao credor R$ ${balance.pago.toFixed(2)}. Registre a retenção antes da OB, ou corrija o valor.`
}
