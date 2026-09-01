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
