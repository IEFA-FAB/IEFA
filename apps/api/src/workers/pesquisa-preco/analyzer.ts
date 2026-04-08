import type { AmostraPreco, ComprasMaterialPrecoItem, LegalCompliance, PriceAnalysis, PriceStatistics } from "./types.ts"

// ─── Normalização de texto para comparação ───────────────────────────────────

/**
 * Tokens sem valor semântico para comparação de itens.
 * Inclui: preposições, artigos, unidades de medida genéricas,
 * embalagens comuns e abreviações numéricas.
 */
const STOP_TOKENS = new Set([
	// Preposições e artigos
	"de",
	"da",
	"do",
	"dos",
	"das",
	"e",
	"em",
	"com",
	"para",
	"por",
	"um",
	"uma",
	"o",
	"a",
	"os",
	"as",
	"ao",
	// Unidades de medida (aparecem em qualquer produto)
	"kg",
	"g",
	"mg",
	"ml",
	"l",
	"lt",
	"un",
	"und",
	"pct",
	"cx",
	"emb",
	"unid",
	"unidade",
	"unidades",
	"pc",
	"frasco",
	"lata",
	"saco",
	"caixa",
	"pacote",
	"fardo",
	"galao",
	"ampola",
	"tubo",
	"bisnaga",
	// Qualificadores genéricos
	"tipo",
	"nao",
	"se",
	"ou",
	"sem",
	"produto",
	"item",
	"marca",
])

/**
 * Tokeniza e normaliza uma descrição para comparação semântica:
 * remove acentos, converte para minúsculas, remove pontuação,
 * filtra stop tokens e tokens muito curtos.
 */
function tokenizar(texto: string): Set<string> {
	return new Set(
		texto
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^a-z0-9\s]/g, " ")
			.split(/\s+/)
			.filter((t) => t.length >= 2 && !STOP_TOKENS.has(t))
	)
}

/**
 * Calcula o recall de tokens: que fração dos tokens relevantes da
 * descrição CATMAT está presente na descrição do item comprado?
 *
 * Recall é preferível ao Jaccard aqui porque não penaliza itens
 * cujas descrições de compra são mais detalhadas que o nome CATMAT.
 */
function calcularSimilaridade(catmatDescricao: string, itemDescricao: string): number {
	const catmatTokens = tokenizar(catmatDescricao)
	if (catmatTokens.size === 0) return 1

	const itemTokens = tokenizar(itemDescricao)
	let matches = 0
	for (const token of catmatTokens) {
		if (itemTokens.has(token)) matches++
	}
	return matches / catmatTokens.size
}

// ─── Normalização de preço ───────────────────────────────────────────────────

/**
 * Retorna o preço normalizado por unidade de medida.
 * A API retorna `precoUnitario` por "unidade de fornecimento" (ex: CAIXA COM 12).
 * Dividimos pela `capacidadeUnidadeFornecimento` para obter preço por unidade de medida,
 * permitindo comparação homogênea entre diferentes apresentações.
 */
function calcularNormalizedPrice(item: ComprasMaterialPrecoItem): number {
	const cap = item.capacidadeUnidadeFornecimento
	if (cap && cap > 1) return item.precoUnitario / cap
	return item.precoUnitario
}

// ─── Data de referência ──────────────────────────────────────────────────────

function extrairReferenceDate(item: ComprasMaterialPrecoItem): Date | null {
	const str = item.dataResultado ?? item.dataCompra
	if (!str) return null
	const d = new Date(str)
	return Number.isNaN(d.getTime()) ? null : d
}

// ─── Detecção de outliers — método IQR ───────────────────────────────────────

/**
 * Remove outliers usando o método IQR (intervalo interquartil).
 * Fences: Q1 − 1.5×IQR e Q3 + 1.5×IQR.
 * Robusto para distribuições assimétricas típicas de licitação.
 * Com menos de 4 amostras não há quartis confiáveis — nada é removido.
 */
function detectarOutliers(amostras: AmostraPreco[]): {
	valid: AmostraPreco[]
	outliers: AmostraPreco[]
} {
	if (amostras.length < 4) return { valid: amostras, outliers: [] }

	const prices = amostras.map((a) => a.normalizedPrice).sort((a, b) => a - b)
	const n = prices.length
	const q1 = prices[Math.floor(n * 0.25)]
	const q3 = prices[Math.floor(n * 0.75)]
	const iqr = q3 - q1

	if (iqr === 0) return { valid: amostras, outliers: [] }

	const lower = q1 - 1.5 * iqr
	const upper = q3 + 1.5 * iqr

	const valid: AmostraPreco[] = []
	const outliers: AmostraPreco[] = []
	for (const a of amostras) {
		if (a.normalizedPrice >= lower && a.normalizedPrice <= upper) valid.push(a)
		else outliers.push(a)
	}
	return { valid, outliers }
}

// ─── Estatísticas descritivas ────────────────────────────────────────────────

function calcularMediana(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function calcularStatistics(samples: AmostraPreco[]): PriceStatistics | null {
	if (samples.length === 0) return null

	const prices = samples.map((a) => a.normalizedPrice)
	const n = prices.length
	const sum = prices.reduce((s, p) => s + p, 0)
	const mean = sum / n
	const median = calcularMediana(prices)
	const variance = prices.reduce((s, p) => s + (p - mean) ** 2, 0) / n
	const stdDev = Math.sqrt(variance)
	const cv = mean > 0 ? (stdDev / mean) * 100 : 0
	const uniqueSources = new Set(samples.map((a) => a.codigoUasg)).size

	return {
		min: +Math.min(...prices).toFixed(4),
		max: +Math.max(...prices).toFixed(4),
		mean: +mean.toFixed(4),
		median: +median.toFixed(4),
		stdDev: +stdDev.toFixed(4),
		cv: +cv.toFixed(2),
		uniqueSources,
	}
}

// ─── Conformidade Lei 14.133 / IN SEGES 65/2021 ──────────────────────────────

const MIN_SAMPLES = 3
const MIN_SOURCES = 3
const MAX_PERIOD_MONTHS = 12

function avaliarCompliance(samples: AmostraPreco[], months: number): LegalCompliance {
	const reasons: string[] = []
	const uniqueSources = new Set(samples.map((a) => a.codigoUasg)).size

	if (samples.length < MIN_SAMPLES) {
		reasons.push(`Amostras válidas insuficientes: ${samples.length} (mínimo: ${MIN_SAMPLES} — Art. 5º IN 65/2021)`)
	}
	if (uniqueSources < MIN_SOURCES) {
		reasons.push(`Fontes distintas insuficientes: ${uniqueSources} UASG(s) (mínimo: ${MIN_SOURCES} — independência das amostras)`)
	}
	if (months > MAX_PERIOD_MONTHS) {
		reasons.push(`Período solicitado (${months} meses) superior ao recomendado de ${MAX_PERIOD_MONTHS} meses (IN 65/2021)`)
	}

	return {
		compliant: reasons.length === 0,
		validSamples: samples.length,
		uniqueSources,
		nonComplianceReasons: reasons,
	}
}

// ─── Parâmetros de pesquisa (internos) ───────────────────────────────────────

export interface OpcoesPesquisa {
	/** Período de análise em meses. Default: 12 (recomendado pela IN 65/2021) */
	months?: number
	/**
	 * Recall mínimo de tokens CATMAT na descrição do item (0–1). Default: 0.4.
	 * Valores menores = mais permissivo. Valores maiores = mais restritivo.
	 */
	similarityThreshold?: number
	// Filtros opcionais — referenciam campos do sistema externo Compras.gov.br
	estado?: string
	codigoUasg?: string
	codigoMunicipio?: number
}

// ─── Função principal de análise ─────────────────────────────────────────────

/**
 * Analisa preços praticados em compras públicas para um item CATMAT,
 * aplicando pipeline de 5 etapas:
 *
 * 1. Filtro temporal (compras dentro do período solicitado)
 * 2. Filtro de poluição CATMAT (recall de tokens vs descrição oficial)
 * 3. Normalização de preço por unidade de medida
 * 4. Remoção de outliers (IQR)
 * 5. Estatísticas + conformidade Lei 14.133 / IN 65/2021
 */
export function analisarPrecos(
	catmatCodigo: number,
	catmatDescricao: string | null,
	rawItems: ComprasMaterialPrecoItem[],
	opcoes: OpcoesPesquisa = {}
): PriceAnalysis {
	const months = opcoes.months ?? 12
	const threshold = opcoes.similarityThreshold ?? 0.4
	const cutoffDate = new Date()
	cutoffDate.setMonth(cutoffDate.getMonth() - months)
	const consultedAt = new Date().toISOString()

	// ── Passo 1: Filtrar por data e validade básica ───────────────────────────
	const afterDateFilter = rawItems.filter((item) => {
		if (!item.precoUnitario || item.precoUnitario <= 0) return false
		const d = extrairReferenceDate(item)
		if (!d) return true // sem data → não filtrar
		return d >= cutoffDate
	})

	// ── Passo 2: Filtrar poluição e construir amostras ────────────────────────
	const pollutionDiscards: AmostraPreco[] = []
	const candidates: AmostraPreco[] = []

	for (const item of afterDateFilter) {
		const similarity = catmatDescricao ? calcularSimilaridade(catmatDescricao, item.descricaoItem) : 1

		const amostra: AmostraPreco = {
			// Campos externos (nomes do Compras.gov.br)
			idCompra: item.idCompra,
			idItemCompra: item.idItemCompra,
			descricaoItem: item.descricaoItem,
			precoUnitario: item.precoUnitario,
			capacidadeUnidadeFornecimento: item.capacidadeUnidadeFornecimento ?? 1,
			siglaUnidadeFornecimento: item.siglaUnidadeFornecimento ?? null,
			siglaUnidadeMedida: item.siglaUnidadeMedida ?? null,
			quantidade: item.quantidade ?? null,
			codigoUasg: item.codigoUasg,
			nomeUasg: item.nomeUasg ?? null,
			municipio: item.municipio ?? null,
			estado: item.estado ?? null,
			esfera: item.esfera ?? null,
			marca: item.marca ?? null,
			// Campos internos (inglês)
			normalizedPrice: +calcularNormalizedPrice(item).toFixed(6),
			referenceDate: item.dataResultado ?? item.dataCompra ?? null,
			similarity: +similarity.toFixed(3),
		}

		if (similarity >= threshold) candidates.push(amostra)
		else pollutionDiscards.push(amostra)
	}

	// ── Passo 3: Remover outliers ─────────────────────────────────────────────
	const { valid: samples, outliers } = detectarOutliers(candidates)

	// ── Passo 4: Estatísticas e conformidade ──────────────────────────────────
	const statistics = calcularStatistics(samples)
	const compliance = avaliarCompliance(samples, months)

	// ── Passo 5: Unidade de medida predominante ───────────────────────────────
	const unitCounts: Record<string, number> = {}
	for (const a of samples) {
		const u = a.siglaUnidadeMedida ?? a.siglaUnidadeFornecimento ?? "?"
		unitCounts[u] = (unitCounts[u] ?? 0) + 1
	}
	const primaryMeasureUnit = Object.entries(unitCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

	return {
		catmatCodigo,
		catmatDescricao: catmatDescricao ?? null,
		params: {
			months,
			similarityThreshold: threshold,
			...(opcoes.estado ? { estado: opcoes.estado } : {}),
			...(opcoes.codigoUasg ? { codigoUasg: opcoes.codigoUasg } : {}),
			...(opcoes.codigoMunicipio ? { codigoMunicipio: opcoes.codigoMunicipio } : {}),
		},
		counts: {
			raw: rawItems.length,
			afterDateFilter: afterDateFilter.length,
			afterPollutionFilter: candidates.length,
			afterOutlierRemoval: samples.length,
		},
		statistics,
		compliance,
		referencePrice: statistics?.median ?? null,
		primaryMeasureUnit,
		samples,
		outliers,
		pollutionDiscards,
		consultedAt,
	}
}
