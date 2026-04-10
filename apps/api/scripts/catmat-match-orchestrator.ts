import { createClient } from "@supabase/supabase-js"
import { env } from "../src/env.ts"

const DEFAULT_BATCH_SIZE = 50
const DEFAULT_BATCH_CONCURRENCY = 15
const PRODUCT_PAGE_SIZE = 1000
const REVIEW_THRESHOLD = 0.5
const MATCH_THRESHOLD = 0.75

type ProductRow = {
	id: string
	description: string | null
	measure_unit: string | null
}

type CandidateRow = {
	codigo_item: number
	descricao_item: string
	codigo_pdm: number
	nome_pdm: string
	codigo_classe: number
	nome_classe: string
	unidades: string[]
	score: number
}

type MatchStatus = "matched" | "review" | "no_match" | "skip"

type ProductDecision = {
	productId: string
	status: MatchStatus
	score: number | null
	catmatItemCodigo: number | null
	catmatItemDescricao: string | null
	reason?: string
}

type Summary = {
	processed: number
	matched: number
	review: number
	no_match: number
	skip: number
	errors: number
}

type Options = {
	limit?: number
	offset: number
	batchSize: number
	batchConcurrency: number
	reprocessAll: boolean
}

const STOPWORDS = new Set([
	"DE",
	"DA",
	"DO",
	"DAS",
	"DOS",
	"COM",
	"SEM",
	"PARA",
	"TIPO",
	"BASE",
	"EM",
	"AO",
	"AO",
	"A",
	"E",
	"O",
	"OS",
	"AS",
	"INTEGRAL",
	"REFINADO",
	"REFINADA",
	"TRADICIONAL",
	"PRIMEIRA",
	"ESPECIAL",
	"PACOTE",
	"EMBALAGEM",
	"UNIDADE",
	"UNIDADES",
	"QUILOGRAMA",
	"QUILOGRAMAS",
	"LITRO",
	"LITROS",
])

const GENERIC_CANDIDATE_HEAD_TOKENS = new Set([
	"ALIMENTO",
	"BEBIDA",
	"CALDA",
	"COMPOTA",
	"CONDIMENTO",
	"CONSERVA",
	"DOCE",
	"FRUTA",
	"GELEIA",
	"GELATINA",
	"LEGUME",
	"MOLHO",
	"REFEICAO",
	"SALADA",
	"SUCO",
	"VERDURA",
])

const GENERIC_PREPARATION_TERMS = [
	"CONGELADO",
	"CONGELADA",
	"PRE COZIDO",
	"PRE COZIDA",
	"PRE ASSADO",
	"PRE ASSADA",
	"SEMIPRONTO",
	"SEMIPRONTA",
	"PRONTO",
	"PRONTA",
	"REFOGADO",
	"REFOGADA",
	"GRATINADO",
	"GRATINADA",
	"EMPANADO",
	"EMPANADA",
	"TEMPERADO",
	"TEMPERADA",
	"AO MOLHO",
]

const READY_MEAL_PATTERNS = [
	/\bESTROGONOFE\b/,
	/\bLASANHA\b/,
	/\bRISOTO\b/,
	/\bYAKISSOBA\b/,
	/\bPRATO PRONTO\b/,
	/\bREFEICAO PRONTA\b/,
	/\bMARMITA\b/,
	/\bSALADA PRONTA\b/,
]

const CLASS_HINTS: Array<{ classCode: number; keywords: string[] }> = [
	{ classCode: 8905, keywords: ["CARNE", "BOVINA", "SUINA", "SUINO", "FRANGO", "GALINHA", "PEIXE", "PESCADO", "ATUM", "SARDINHA", "CAMARAO", "LINGUICA", "BACON", "PERU"] },
	{ classCode: 8910, keywords: ["LEITE", "QUEIJO", "IOGURTE", "REQUEIJAO", "MANTEIGA", "OVO", "OVOS", "CREME DE LEITE"] },
	{ classCode: 8915, keywords: ["BANANA", "MACA", "MAMAO", "LARANJA", "ABACAXI", "MELANCIA", "ALFACE", "TOMATE", "BATATA", "CEBOLA", "ALHO", "CENOURA", "CHUCHU", "BETERRABA", "REPOLHO"] },
	{ classCode: 8920, keywords: ["ARROZ", "FEIJAO", "MACARRAO", "PÃO", "PAO", "FARINHA", "AVEIA", "TRIGO", "MILHO", "CANJICA", "AMIDO", "BISCOITO", "TORRADA"] },
	{ classCode: 8925, keywords: ["ACUCAR", "AÇUCAR", "DOCE", "BOMBOM", "CHOCOLATE", "CASTANHA", "AMENDOIM", "PAÇOCA", "PACOCA"] },
	{ classCode: 8930, keywords: ["GELEIA", "CONSERVA", "GELATINA", "COMPOTA", "AZEITONA", "PICLES"] },
	{ classCode: 8935, keywords: ["SOPA", "CALDO"] },
	{ classCode: 8940, keywords: ["DIET", "LIGHT", "SUPLEMENTO", "LACTOSE", "GLUTEN", "ENTERAL"] },
	{ classCode: 8945, keywords: ["OLEO", "ÓLEO", "AZEITE", "GORDURA", "MARGARINA"] },
	{ classCode: 8950, keywords: ["SAL", "TEMPERO", "CONDIMENTO", "VINAGRE", "MOLHO", "PIMENTA", "ORÉGANO", "OREGANO"] },
	{ classCode: 8955, keywords: ["CAFE", "CAFÉ", "CHA", "CHÁ", "CACAU", "CHOCOLATE"] },
	{ classCode: 8960, keywords: ["SUCO", "REFRIGERANTE", "BEBIDA", "AGUA", "ÁGUA", "XAROPE", "NECTAR", "NÉCTAR"] },
]

function getSupabase() {
	return createClient(env.API_SUPABASE_URL, env.API_SUPABASE_SERVICE_ROLE_KEY, {
		db: { schema: "sisub" },
		auth: { persistSession: false },
	})
}

const supabase = getSupabase()

function parseArgs(argv: string[]): Options {
	const options: Options = {
		offset: 0,
		batchSize: DEFAULT_BATCH_SIZE,
		batchConcurrency: DEFAULT_BATCH_CONCURRENCY,
		reprocessAll: false,
	}

	for (const arg of argv) {
		if (arg === "--reprocess-all") {
			options.reprocessAll = true
			continue
		}

		const [rawKey, rawValue] = arg.split("=")
		const value = rawValue == null ? NaN : Number(rawValue)

		switch (rawKey) {
			case "--limit":
				if (Number.isFinite(value) && value > 0) options.limit = Math.trunc(value)
				break
			case "--offset":
				if (Number.isFinite(value) && value >= 0) options.offset = Math.trunc(value)
				break
			case "--batch-size":
				if (Number.isFinite(value) && value > 0) options.batchSize = Math.trunc(value)
				break
			case "--concurrency":
				if (Number.isFinite(value) && value > 0) options.batchConcurrency = Math.trunc(value)
				break
		}
	}

	return options
}

function normalizeText(value: string): string {
	return value
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toUpperCase()
		.replace(/[^A-Z0-9 ]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
}

function removePreparationTerms(value: string): string {
	let normalized = value
	for (const term of GENERIC_PREPARATION_TERMS) {
		normalized = normalized.replace(new RegExp(`\\b${term}\\b`, "g"), " ")
	}
	return normalized.replace(/\s+/g, " ").trim()
}

function tokenize(value: string): string[] {
	return value
		.split(" ")
		.map((token) => token.trim())
		.filter((token) => token.length >= 3 && !STOPWORDS.has(token))
}

function getPrimaryToken(value: string): string | null {
	return tokenize(value)[0] ?? null
}

function inferClassHint(normalizedDescription: string): number | null {
	for (const hint of CLASS_HINTS) {
		if (hint.keywords.some((keyword) => normalizedDescription.includes(normalizeText(keyword)))) {
			return hint.classCode
		}
	}
	return null
}

function normalizeMeasureUnit(unit: string | null): "mass" | "volume" | "unit" | null {
	const normalized = normalizeText(unit ?? "")
	if (!normalized) return null
	const tokens = new Set(normalized.split(" "))
	if (["KG", "G", "GR", "GRAMA", "GRAMAS"].some((value) => tokens.has(value))) return "mass"
	if (["L", "LT", "ML", "LITRO", "LITROS"].some((value) => tokens.has(value))) return "volume"
	if (["UN", "UND", "UNIDADE", "UNIDADES", "DZ", "DUZIA", "DUZIAS"].some((value) => tokens.has(value))) return "unit"
	return null
}

function inferCandidateMeasure(candidate: CandidateRow): "mass" | "volume" | "unit" | null {
	for (const unit of candidate.unidades ?? []) {
		const normalized = normalizeMeasureUnit(unit)
		if (normalized) return normalized
	}

	const description = normalizeText(`${candidate.nome_classe} ${candidate.nome_pdm} ${candidate.descricao_item}`)
	if (/\bSUCO\b|\bREFRIGERANTE\b|\bBEBIDA\b|\bLEITE\b|\bOLEO\b|\bAGUA\b/.test(description)) return "volume"
	return null
}

function tokenOverlapScore(productTokens: string[], candidate: CandidateRow): number {
	if (productTokens.length === 0) return 0
	const candidateTokens = new Set(tokenize(normalizeText(`${candidate.nome_pdm} ${candidate.descricao_item}`)))
	let hits = 0
	for (const token of productTokens) {
		if (candidateTokens.has(token)) hits++
	}
	return hits / productTokens.length
}

function isPreparedFoodWithoutClearInput(description: string, cleanedDescription: string): boolean {
	if (!description) return false
	const normalized = normalizeText(description)
	if (!READY_MEAL_PATTERNS.some((pattern) => pattern.test(normalized))) return false
	return tokenize(cleanedDescription).length < 2
}

function buildSearchDescription(description: string | null): string {
	const normalized = normalizeText(description ?? "")
	return removePreparationTerms(normalized)
}

function evaluateCandidate(product: ProductRow, cleanedDescription: string, candidate: CandidateRow): number {
	let score = Math.max(0, Math.min(candidate.score ?? 0, 1))

	const productTokens = tokenize(cleanedDescription)
	score += tokenOverlapScore(productTokens, candidate) * 0.12

	const productPrimaryToken = getPrimaryToken(cleanedDescription)
	const candidatePrimaryToken = getPrimaryToken(normalizeText(candidate.nome_pdm))
	if (productPrimaryToken && candidatePrimaryToken) {
		if (productPrimaryToken === candidatePrimaryToken) {
			score += 0.06
		} else if (!GENERIC_CANDIDATE_HEAD_TOKENS.has(candidatePrimaryToken)) {
			score -= 0.07
		}
	}

	const measureUnit = normalizeMeasureUnit(product.measure_unit)
	const candidateMeasure = inferCandidateMeasure(candidate)
	if (measureUnit && candidateMeasure) {
		score += measureUnit === candidateMeasure ? 0.06 : -0.07
	}

	const classHint = inferClassHint(cleanedDescription)
	if (classHint != null) {
		score += classHint === candidate.codigo_classe ? 0.08 : -0.05
	}

	if (cleanedDescription.startsWith(normalizeText(candidate.nome_pdm))) {
		score += 0.04
	}

	return Math.max(0, Math.min(score, 1))
}

async function loadProducts(options: Options): Promise<ProductRow[]> {
	const rows: ProductRow[] = []
	let from = options.offset
	let remaining = options.limit ?? Number.POSITIVE_INFINITY

	while (remaining > 0) {
		const pageSize = Math.min(PRODUCT_PAGE_SIZE, remaining)
		const to = from + pageSize - 1

		let query = supabase
			.from("product")
			.select("id, description, measure_unit")
			.is("deleted_at", null)
			.order("description", { ascending: true, nullsFirst: false })
			.range(from, to)

		if (!options.reprocessAll) {
			query = query.is("catmat_item_codigo", null)
		}

		if (!options.reprocessAll) {
			query = query.or("catmat_match_status.is.null,catmat_match_status.eq.pending")
		}

		const { data, error } = await query
		if (error) throw new Error(`falha ao carregar produtos: ${error.message}`)
		if (!data || data.length === 0) break

		rows.push(...(data as ProductRow[]))
		if (data.length < pageSize) break

		from += pageSize
		remaining -= pageSize
	}

	return rows
}

async function findCandidates(cleanedDescription: string): Promise<CandidateRow[]> {
	const { data, error } = await supabase.rpc("catmat_match_candidates", {
		p_product_description: cleanedDescription,
		p_limit: 5,
	})

	if (error) throw new Error(`falha ao buscar candidatos CATMAT: ${error.message}`)
	return (data as CandidateRow[] | null) ?? []
}

async function persistDecision(decision: ProductDecision): Promise<void> {
	const { error } = await supabase
		.from("product")
		.update({
			catmat_item_codigo: decision.catmatItemCodigo,
			catmat_item_descricao: decision.catmatItemDescricao,
			catmat_match_status: decision.status,
			catmat_match_score: decision.score,
		})
		.eq("id", decision.productId)

	if (error) throw new Error(`falha ao atualizar produto ${decision.productId}: ${error.message}`)
}

async function decideProduct(product: ProductRow): Promise<ProductDecision> {
	const cleanedDescription = buildSearchDescription(product.description)

	if (!cleanedDescription) {
		return {
			productId: product.id,
			status: "no_match",
			score: 0,
			catmatItemCodigo: null,
			catmatItemDescricao: null,
			reason: "empty_description",
		}
	}

	if (isPreparedFoodWithoutClearInput(product.description ?? "", cleanedDescription)) {
		return {
			productId: product.id,
			status: "skip",
			score: null,
			catmatItemCodigo: null,
			catmatItemDescricao: null,
			reason: "prepared_food",
		}
	}

	const candidates = await findCandidates(cleanedDescription)
	if (candidates.length === 0) {
		return {
			productId: product.id,
			status: "no_match",
			score: 0,
			catmatItemCodigo: null,
			catmatItemDescricao: null,
			reason: "no_candidates",
		}
	}

	const best = candidates
		.map((candidate) => ({
			candidate,
			finalScore: evaluateCandidate(product, cleanedDescription, candidate),
		}))
		.sort((left, right) => right.finalScore - left.finalScore)[0]

	if (!best || best.finalScore < REVIEW_THRESHOLD) {
		return {
			productId: product.id,
			status: "no_match",
			score: best?.finalScore ?? 0,
			catmatItemCodigo: null,
			catmatItemDescricao: null,
			reason: "low_score",
		}
	}

	if (best.finalScore < MATCH_THRESHOLD) {
		return {
			productId: product.id,
			status: "review",
			score: best.finalScore,
			catmatItemCodigo: best.candidate.codigo_item,
			catmatItemDescricao: best.candidate.descricao_item,
			reason: "needs_review",
		}
	}

	return {
		productId: product.id,
		status: "matched",
		score: best.finalScore,
		catmatItemCodigo: best.candidate.codigo_item,
		catmatItemDescricao: best.candidate.descricao_item,
	}
}

function chunk<T>(items: T[], size: number): T[][] {
	const batches: T[][] = []
	for (let index = 0; index < items.length; index += size) {
		batches.push(items.slice(index, index + size))
	}
	return batches
}

function incrementSummary(summary: Summary, decision: ProductDecision) {
	summary.processed++
	switch (decision.status) {
		case "matched":
			summary.matched++
			break
		case "review":
			summary.review++
			break
		case "no_match":
			summary.no_match++
			break
		case "skip":
			summary.skip++
			break
	}
}

async function processBatch(batch: ProductRow[], summary: Summary, batchNumber: number, totalBatches: number): Promise<void> {
	for (const product of batch) {
		try {
			const decision = await decideProduct(product)
			await persistDecision(decision)
			incrementSummary(summary, decision)
		} catch (error) {
			summary.errors++
			const message = error instanceof Error ? error.message : String(error)
			console.error(`[catmat-match] produto ${product.id}: ${message}`)
		}
	}

	console.log(
		`[catmat-match] batch ${batchNumber}/${totalBatches} concluído` +
			` | processed=${summary.processed}` +
			` matched=${summary.matched}` +
			` review=${summary.review}` +
			` no_match=${summary.no_match}` +
			` skip=${summary.skip}` +
			` errors=${summary.errors}`
	)
}

async function run(): Promise<void> {
	const startedAt = Date.now()
	const options = parseArgs(Bun.argv.slice(2))

	console.log(
		`[catmat-match] carregando produtos` +
			` | offset=${options.offset}` +
			` limit=${options.limit ?? "all"}` +
			` batchSize=${options.batchSize}` +
			` concurrency=${options.batchConcurrency}` +
			` reprocessAll=${options.reprocessAll}`
	)

	const products = await loadProducts(options)
	const batches = chunk(products, options.batchSize)
	const summary: Summary = {
		processed: 0,
		matched: 0,
		review: 0,
		no_match: 0,
		skip: 0,
		errors: 0,
	}

	console.log(`[catmat-match] ${products.length} produto(s) carregado(s) em ${batches.length} batch(es)`)

	let nextBatchIndex = 0

	async function worker(workerId: number): Promise<void> {
		while (true) {
			const current = nextBatchIndex++
			if (current >= batches.length) return
			await processBatch(batches[current], summary, current + 1, batches.length)
			if ((current + 1) % 10 === 0 || current + 1 === batches.length) {
				console.log(`[catmat-match] worker ${workerId} avançou até o batch ${current + 1}/${batches.length}`)
			}
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(options.batchConcurrency, Math.max(batches.length, 1)) }, (_, index) => worker(index + 1))
	)

	const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1)
	console.log(`[catmat-match] concluído em ${elapsedSeconds}s`)
	console.log(JSON.stringify(summary, null, 2))

	if (summary.errors > 0) {
		process.exitCode = 1
	}
}

await run()
