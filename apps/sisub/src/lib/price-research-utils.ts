import { searchMaterialPricesFn } from "@/server/price-research.fn"
import type { ComprasMaterialPriceResult } from "@/types/domain/price-research"

export interface AutoSelectResult {
	price: number
	method: "mean" | "median"
	stats: {
		mean: number
		median: number
		stdDev: number
		cv: number
		min: number
		max: number
		uniqueSources: number
	}
	/** Amostras com preço, antes da janela de recência. */
	rawCount: number
	/** Amostras com preço que sobraram após a janela de recência. */
	dateFilteredCount: number
	/** Janela de recência aplicada, em meses; null quando a análise usou todo o histórico. */
	periodMonths: number | null
	validCount: number
	outlierCount: number
	validSamples: ComprasMaterialPriceResult[]
	outlierSamples: ComprasMaterialPriceResult[]
}

/**
 * Janela de recência padrão da pesquisa de preços.
 * IN SEGES/ME 65/2021, Art. 5º: preços de até 1 ano da data da pesquisa.
 */
export const DEFAULT_PERIOD_MONTHS = 12

/**
 * Teto de páginas por CATMAT (20 × 500 = 10.000 registros). Amostra mais que
 * suficiente para a estatística e evita rajada contra a API pública — que passa
 * pelo nosso próprio server, então uma consulta sem teto castiga os dois lados.
 */
export const MAX_PAGES = 20
const PAGE_SIZE = 500
const PAGE_CONCURRENCY = 4

export function sampleReferenceDate(r: ComprasMaterialPriceResult): string | null {
	return r.dataResultado ?? r.dataCompra ?? null
}

/** Início da janela: `months` meses antes de `now`, em YYYY-MM-DD. */
export function periodCutoff(months: number, now: Date = new Date()): string {
	const cutoff = new Date(now)
	cutoff.setMonth(cutoff.getMonth() - months)
	return cutoff.toISOString().slice(0, 10)
}

/**
 * Mantém apenas amostras dentro da janela de recência.
 * Amostra SEM data é mantida de propósito: não há como provar que é antiga, e
 * descartá-la reduziria a base sem justificativa auditável.
 */
export function filterByPeriod(results: ComprasMaterialPriceResult[], months: number, now?: Date): ComprasMaterialPriceResult[] {
	const cutoff = periodCutoff(months, now)
	return results.filter((r) => {
		const date = sampleReferenceDate(r)
		return !date || date.slice(0, 10) >= cutoff
	})
}

export interface CatmatPriceFetch {
	results: ComprasMaterialPriceResult[]
	/** Total informado pela API, mesmo quando o teto de páginas corta a coleta. */
	totalRegistros: number
	/** true quando a API tem mais páginas do que MAX_PAGES — a amostra é parcial. */
	truncated: boolean
}

function calcMediana(values: number[]): number {
	const sorted = values.toSorted((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function computeStats(prices: number[]) {
	if (prices.length === 0) return null
	const n = prices.length
	const mean = prices.reduce((s, v) => s + v, 0) / n
	const median = calcMediana(prices)
	const variance = prices.reduce((s, v) => s + (v - mean) ** 2, 0) / n
	const stdDev = Math.sqrt(variance)
	const cv = mean > 0 ? (stdDev / mean) * 100 : 0
	return { mean, median, stdDev, cv, min: Math.min(...prices), max: Math.max(...prices) }
}

/**
 * Coleta todas as páginas de um CATMAT, em lotes de PAGE_CONCURRENCY e até
 * MAX_PAGES. O corte é reportado em `truncated` — nunca silencioso.
 */
export async function fetchAllPagesForCatmat(code: number): Promise<CatmatPriceFetch> {
	const first = await searchMaterialPricesFn({ data: { codigoItemCatalogo: code, pagina: 1, tamanhoPagina: PAGE_SIZE } })
	const results = [...first.resultado]
	const totalPages = Math.min(first.totalPaginas, MAX_PAGES)

	for (let start = 2; start <= totalPages; start += PAGE_CONCURRENCY) {
		const end = Math.min(start + PAGE_CONCURRENCY - 1, totalPages)
		const pages = await Promise.all(
			Array.from({ length: end - start + 1 }, (_, i) =>
				searchMaterialPricesFn({ data: { codigoItemCatalogo: code, pagina: start + i, tamanhoPagina: PAGE_SIZE } })
			)
		)
		for (const page of pages) results.push(...page.resultado)
	}

	return { results, totalRegistros: first.totalRegistros, truncated: first.totalPaginas > MAX_PAGES }
}

// Mirrors the IQR + stats logic from PriceResearchModal, but returns the auto-selected price.
// CV < 15 → mean (homogeneous distribution); CV ≥ 15 → median (IN SEGES 65/2021 Art. 5º).
export function autoSelectPrice(allResults: ComprasMaterialPriceResult[], options?: { periodMonths?: number | null; now?: Date }): AutoSelectResult | null {
	const periodMonths = options?.periodMonths === undefined ? DEFAULT_PERIOD_MONTHS : options.periodMonths
	const rawCount = allResults.filter((r) => r.precoUnitario !== null).length
	const results = periodMonths ? filterByPeriod(allResults, periodMonths, options?.now) : allResults

	const prices = results.map((r) => r.precoUnitario).filter((p): p is number => p !== null)
	if (prices.length === 0) return null

	let validSamples: ComprasMaterialPriceResult[]
	let outlierSamples: ComprasMaterialPriceResult[]
	let validPrices: number[]
	let outlierCount: number

	if (prices.length < 4) {
		validSamples = results
		outlierSamples = []
		validPrices = prices
		outlierCount = 0
	} else {
		const sorted = prices.toSorted((a, b) => a - b)
		const n = sorted.length
		const q1 = sorted[Math.floor(n * 0.25)]
		const q3 = sorted[Math.floor(n * 0.75)]
		const iqr = q3 - q1
		if (iqr === 0) {
			validSamples = results
			outlierSamples = []
			validPrices = prices
			outlierCount = 0
		} else {
			const lower = q1 - 1.5 * iqr
			const upper = q3 + 1.5 * iqr
			validSamples = results.filter((r) => r.precoUnitario === null || (r.precoUnitario >= lower && r.precoUnitario <= upper))
			outlierSamples = results.filter((r) => r.precoUnitario !== null && (r.precoUnitario < lower || r.precoUnitario > upper))
			validPrices = prices.filter((v) => v >= lower && v <= upper)
			outlierCount = prices.length - validPrices.length
		}
	}

	const stats = computeStats(validPrices)
	if (!stats) return null

	// Fontes contadas só entre as amostras VÁLIDAS: quem foi descartado como
	// outlier não sustenta o preço de referência e não pode inflar o critério de
	// conformidade (≥ 3 UASGs distintas).
	const uniqueSources = new Set(validSamples.flatMap((r) => (r.codigoUasg ? [r.codigoUasg] : []))).size
	const method: "mean" | "median" = stats.cv < 15 ? "mean" : "median"
	const price = method === "mean" ? stats.mean : stats.median

	return {
		price,
		method,
		stats: { ...stats, uniqueSources },
		rawCount,
		dateFilteredCount: prices.length,
		periodMonths,
		validCount: validPrices.length,
		outlierCount,
		validSamples,
		outlierSamples,
	}
}
