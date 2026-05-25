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
	rawCount: number
	validCount: number
	outlierCount: number
	validSamples: ComprasMaterialPriceResult[]
	outlierSamples: ComprasMaterialPriceResult[]
}

function calcMediana(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b)
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

export async function fetchAllPagesForCatmat(code: number): Promise<ComprasMaterialPriceResult[]> {
	const first = await searchMaterialPricesFn({ data: { codigoItemCatalogo: code, pagina: 1, tamanhoPagina: 500 } })
	if (first.totalPaginas <= 1) return first.resultado
	const rest = await Promise.all(
		Array.from({ length: first.totalPaginas - 1 }, (_, i) => searchMaterialPricesFn({ data: { codigoItemCatalogo: code, pagina: i + 2, tamanhoPagina: 500 } }))
	)
	return [...first.resultado, ...rest.flatMap((p) => p.resultado)]
}

// Mirrors the IQR + stats logic from PriceResearchModal, but returns the auto-selected price.
// CV < 15 → mean (homogeneous distribution); CV ≥ 15 → median (IN SEGES 65/2021 Art. 5º).
export function autoSelectPrice(results: ComprasMaterialPriceResult[]): AutoSelectResult | null {
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
		const sorted = [...prices].sort((a, b) => a - b)
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

	const uniqueSources = new Set(results.map((r) => r.codigoUasg).filter(Boolean)).size
	const method: "mean" | "median" = stats.cv < 15 ? "mean" : "median"
	const price = method === "mean" ? stats.mean : stats.median

	return {
		price,
		method,
		stats: { ...stats, uniqueSources },
		rawCount: prices.length,
		validCount: validPrices.length,
		outlierCount,
		validSamples,
		outlierSamples,
	}
}
