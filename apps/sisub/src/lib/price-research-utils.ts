import { convertSamplePrice, resolveResearchUnit } from "@iefa/sisub-domain"
import { searchMaterialPricesFn } from "@/server/price-research.fn"
import type { ComprasMaterialPriceResult } from "@/types/domain/price-research"

export interface PriceStatsSummary {
	mean: number
	median: number
	stdDev: number
	cv: number
	min: number
	max: number
	uniqueSources: number
}

export interface AutoSelectResult {
	price: number
	method: "mean" | "median"
	stats: PriceStatsSummary
	/** Unidade em que os preços foram comparados (a do item, ou a predominante quando o item não tem). */
	unit: string
	/** true quando o item de compra não declara unidade reconhecível e a pesquisa herdou a das amostras. */
	unitInferred: boolean
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
	/** Amostras sem conteúdo comparável com a unidade do item (inconsistentes, art. 6º da IN 65/2021). */
	inconsistentSamples: ComprasMaterialPriceResult[]
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

export function computeStats(prices: number[]) {
	if (prices.length === 0) return null
	const n = prices.length
	const mean = prices.reduce((s, v) => s + v, 0) / n
	const median = calcMediana(prices)
	const variance = prices.reduce((s, v) => s + (v - mean) ** 2, 0) / n
	const stdDev = Math.sqrt(variance)
	const cv = mean > 0 ? (stdDev / mean) * 100 : 0
	return { mean, median, stdDev, cv, min: Math.min(...prices), max: Math.max(...prices) }
}

/** Preço da amostra na unidade da pesquisa, ou null quando ela não é comparável. */
export function samplePriceIn(sample: ComprasMaterialPriceResult, unit: string): number | null {
	const conversion = convertSamplePrice(sample, unit)
	return conversion.ok ? conversion.price : null
}

/**
 * Preço estimado a partir das estatísticas.
 *
 * Média só quando a série é homogênea (CV < 15%) E não passa da mediana: a fonte é o sistema
 * oficial de preços (inciso I do art. 5º da IN SEGES/ME 65/2021), e o art. 6º, § 6º, proíbe
 * preço estimado acima da mediana quando ele é a base única. Nos demais casos, a mediana.
 */
export function chooseReferencePrice(stats: { mean: number; median: number; cv: number }): { method: "mean" | "median"; price: number } {
	if (stats.cv < 15 && stats.mean <= stats.median) return { method: "mean", price: stats.mean }
	return { method: "median", price: stats.median }
}

/** true quando o método pedido respeita o teto da mediana (art. 6º, § 6º, da IN 65/2021). */
export function isMethodAllowed(method: "mean" | "median", stats: { mean: number; median: number }): boolean {
	return method === "median" || stats.mean <= stats.median
}

export interface PriceAnalysis {
	stats: PriceStatsSummary
	validSamples: ComprasMaterialPriceResult[]
	outlierSamples: ComprasMaterialPriceResult[]
	inconsistentSamples: ComprasMaterialPriceResult[]
	/** Amostras com preço comparável, antes do descarte de outliers. */
	comparableCount: number
}

/**
 * Converte, descarta inconsistentes e, se pedido, outliers por IQR (1,5×) sobre o preço JÁ
 * convertido. Mesma função no modal e na pesquisa em lote, para os dois não divergirem.
 */
export function analyzeSamples(samples: ComprasMaterialPriceResult[], unit: string, options: { removeOutliers: boolean }): PriceAnalysis | null {
	const comparable: Array<{ sample: ComprasMaterialPriceResult; price: number }> = []
	const inconsistentSamples: ComprasMaterialPriceResult[] = []
	for (const sample of samples) {
		if (sample.precoUnitario == null) continue
		const price = samplePriceIn(sample, unit)
		if (price == null) inconsistentSamples.push(sample)
		else comparable.push({ sample, price })
	}
	if (comparable.length === 0) return null

	let valid = comparable
	let outliers: typeof comparable = []
	if (options.removeOutliers && comparable.length >= 4) {
		const sorted = comparable.map((c) => c.price).toSorted((a, b) => a - b)
		const n = sorted.length
		const q1 = sorted[Math.floor(n * 0.25)]
		const q3 = sorted[Math.floor(n * 0.75)]
		const iqr = q3 - q1
		if (iqr > 0) {
			const lower = q1 - 1.5 * iqr
			const upper = q3 + 1.5 * iqr
			valid = comparable.filter((c) => c.price >= lower && c.price <= upper)
			outliers = comparable.filter((c) => c.price < lower || c.price > upper)
		}
	}

	const stats = computeStats(valid.map((c) => c.price))
	if (!stats) return null
	// Fontes contadas só entre as amostras VÁLIDAS: quem foi descartado não sustenta o preço
	// estimado e não pode inflar o critério de conformidade (≥ 3 UASGs distintas).
	const uniqueSources = new Set(valid.flatMap((c) => (c.sample.codigoUasg ? [c.sample.codigoUasg] : []))).size
	return {
		stats: { ...stats, uniqueSources },
		validSamples: valid.map((c) => c.sample),
		outlierSamples: outliers.map((c) => c.sample),
		inconsistentSamples,
		comparableCount: comparable.length,
	}
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

/**
 * Pesquisa automática de um item: janela de recência → conversão para a unidade do item
 * (descarta inconsistentes) → IQR → estatística → preço estimado com teto na mediana.
 */
export function autoSelectPrice(
	allResults: ComprasMaterialPriceResult[],
	options?: { periodMonths?: number | null; now?: Date; targetUnit?: string | null }
): AutoSelectResult | null {
	const periodMonths = options?.periodMonths === undefined ? DEFAULT_PERIOD_MONTHS : options.periodMonths
	const rawCount = allResults.filter((r) => r.precoUnitario !== null).length
	const results = periodMonths ? filterByPeriod(allResults, periodMonths, options?.now) : allResults
	const dateFilteredCount = results.filter((r) => r.precoUnitario !== null).length

	const researchUnit = resolveResearchUnit(options?.targetUnit, results)
	if (!researchUnit) return null

	const analysis = analyzeSamples(results, researchUnit.unit, { removeOutliers: true })
	if (!analysis) return null

	const { method, price } = chooseReferencePrice(analysis.stats)
	return {
		price,
		method,
		stats: analysis.stats,
		unit: researchUnit.unit,
		unitInferred: researchUnit.inferred,
		rawCount,
		dateFilteredCount,
		periodMonths,
		validCount: analysis.validSamples.length,
		outlierCount: analysis.outlierSamples.length,
		validSamples: analysis.validSamples,
		outlierSamples: analysis.outlierSamples,
		inconsistentSamples: analysis.inconsistentSamples,
	}
}
