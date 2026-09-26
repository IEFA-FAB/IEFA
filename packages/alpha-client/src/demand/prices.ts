/**
 * Estimativa de preço por item a partir das cotações (IN SEGES/ME nº 65/2021).
 *
 * A regra é a que o processo das janelas consolidou: média das propostas; mediana quando o
 * coeficiente de variação passa de 25%, porque aí a média é puxada por um valor destoante.
 * Cotação afastada fica registrada com o motivo e não entra na conta. A pesquisa automática do
 * sistema, com dezenas de amostras de objetos diferentes, dá CV de centenas por cento (491,94%
 * na do forno): por isso a conta aqui é sobre o que o requisitante juntou, item a item.
 */

import type { DemandPayload, Item, PriceMethod, Quote } from "./schema"

/** CV acima do qual a média deixa de representar o conjunto. */
export const CV_THRESHOLD = 0.25
/** Mínimo de preços válidos por item. */
export const MIN_QUOTES = 3

export interface ItemPriceSummary {
	itemId: string
	/** Preços válidos (cotação não afastada), na ordem das cotações. */
	values: number[]
	quoteIds: string[]
	mean: number | null
	median: number | null
	min: number | null
	/** Coeficiente de variação (desvio padrão amostral / média). `null` com menos de 2 valores. */
	cv: number | null
	method: Exclude<PriceMethod, "auto"> | null
	unitPrice: number | null
	total: number | null
}

export interface PriceSummary {
	items: ItemPriceSummary[]
	/** Soma dos itens com preço; `null` se nenhum item tem preço ainda. */
	total: number | null
	/** Itens que ainda não têm nenhum preço válido. */
	missing: string[]
}

function round2(value: number): number {
	return Math.round(value * 100) / 100
}

export function mean(values: readonly number[]): number | null {
	if (values.length === 0) return null
	return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function median(values: readonly number[]): number | null {
	if (values.length === 0) return null
	const sorted = [...values].sort((a, b) => a - b)
	const middle = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 1 ? (sorted[middle] as number) : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
}

/** Desvio padrão amostral sobre a média: a mesma conta da planilha da pesquisa. */
export function coefficientOfVariation(values: readonly number[]): number | null {
	const average = mean(values)
	if (average === null || values.length < 2 || average === 0) return null
	const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)
	return Math.sqrt(variance) / average
}

function isValidQuote(quote: Quote): boolean {
	return quote.excludedReason.trim() === ""
}

export function summarizeItem(item: Item, quotes: readonly Quote[], method: PriceMethod): ItemPriceSummary {
	const used = quotes.filter((quote) => isValidQuote(quote) && typeof quote.prices[item.id] === "number")
	const values = used.map((quote) => quote.prices[item.id] as number)
	const cv = coefficientOfVariation(values)
	const chosen: ItemPriceSummary["method"] = values.length === 0 ? null : method === "auto" ? (cv !== null && cv > CV_THRESHOLD ? "mediana" : "media") : method

	const unitPrice =
		chosen === null ? null : round2(chosen === "media" ? (mean(values) as number) : chosen === "mediana" ? (median(values) as number) : Math.min(...values))

	return {
		itemId: item.id,
		values,
		quoteIds: used.map((quote) => quote.id),
		mean: mean(values),
		median: median(values),
		min: values.length ? Math.min(...values) : null,
		cv,
		method: chosen,
		unitPrice,
		total: unitPrice !== null && item.quantity !== null ? round2(unitPrice * item.quantity) : null,
	}
}

export function summarizePrices(demand: DemandPayload): PriceSummary {
	const items = demand.items.map((item) => summarizeItem(item, demand.quotes, demand.priceMethod))
	const priced = items.filter((item) => item.total !== null)
	return {
		items,
		total: priced.length === 0 ? null : round2(priced.reduce((sum, item) => sum + (item.total as number), 0)),
		missing: items.filter((item) => item.unitPrice === null).map((item) => item.itemId),
	}
}

/** Raiz do CNPJ (8 primeiros dígitos): identifica a empresa, com matriz e filiais. */
function cnpjRoot(document: string): string | null {
	return document.length === 14 ? document.slice(0, 8) : null
}

function emailDomain(email: string): string | null {
	const at = email.lastIndexOf("@")
	return at > 0
		? email
				.slice(at + 1)
				.trim()
				.toLowerCase() || null
		: null
}

/**
 * Pares de cotações que não parecem independentes: mesma raiz de CNPJ ou mesmo domínio de
 * e-mail. Foi o caso do forno (duas empresas do mesmo grupo, texto idêntico, mesmo domínio,
 * R$ 480 de diferença). Domínio de e-mail genérico não conta.
 */
export function dependentQuotes(quotes: readonly Quote[]): Array<{ a: string; b: string; reason: string }> {
	const GENERIC_DOMAINS = new Set([
		"gmail.com",
		"hotmail.com",
		"outlook.com",
		"yahoo.com",
		"yahoo.com.br",
		"uol.com.br",
		"bol.com.br",
		"icloud.com",
		"live.com",
	])
	const pairs: Array<{ a: string; b: string; reason: string }> = []
	const valid = quotes.filter(isValidQuote)
	for (let i = 0; i < valid.length; i++) {
		for (let j = i + 1; j < valid.length; j++) {
			const a = valid[i] as Quote
			const b = valid[j] as Quote
			const rootA = cnpjRoot(a.supplierDocument)
			if (rootA !== null && rootA === cnpjRoot(b.supplierDocument)) {
				pairs.push({ a: a.id, b: b.id, reason: "mesma raiz de CNPJ (mesma empresa)" })
				continue
			}
			const domainA = emailDomain(a.contactEmail)
			if (domainA !== null && !GENERIC_DOMAINS.has(domainA) && domainA === emailDomain(b.contactEmail)) {
				pairs.push({ a: a.id, b: b.id, reason: `mesmo domínio de e-mail (${domainA})` })
			}
		}
	}
	return pairs
}

/** Cotações vencidas na data de referência (a validade da proposta passou). */
export function expiredQuotes(quotes: readonly Quote[], today: string): string[] {
	return quotes.filter((quote) => isValidQuote(quote) && quote.validUntil !== null && quote.validUntil < today).map((quote) => quote.id)
}

export const QUOTE_SOURCE_LABEL: Record<Quote["source"], string> = {
	proposta: "Proposta de fornecedor (art. 5º, IV)",
	painel_precos: "Painel de Preços / Compras.gov.br (art. 5º, I)",
	contratacao_similar: "Contratação similar de outro ente (art. 5º, II)",
	midia_especializada: "Mídia especializada, tabela ou sítio (art. 5º, III)",
	nota_fiscal: "Nota fiscal eletrônica (art. 5º, V)",
	tabela_referencia: "Tabela de referência oficial, como SINAPI ou SICRO (art. 5º, III)",
}
