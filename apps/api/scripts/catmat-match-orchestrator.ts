import { createClient } from "@supabase/supabase-js"
import { env } from "../src/env.ts"

const DEFAULT_BATCH_SIZE = 50
const DEFAULT_BATCH_CONCURRENCY = 15
const PRODUCT_PAGE_SIZE = 1000
const REVIEW_THRESHOLD = 0.5
const MATCH_THRESHOLD = 0.75

type IngredientRow = {
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
	pdm_score: number
}

type MatchStatus = "matched" | "review" | "no_match" | "skip"

type IngredientDecision = {
	ingredientId: string
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
	// Modificadores de tamanho — não representam o conceito principal do produto
	"MINI",
	"GRANDE",
	"MEGA",
	"EXTRA",
	"INDIVIDUAL",
])

const GENERIC_CANDIDATE_HEAD_TOKENS = new Set([
	"ALIMENTO",
	"BEBIDA",
	"CALDA",
	"CARNE",    // ex: "CARNE DE AVE IN NATURA", "CARNE SALGADA" — categoria ampla
	"COMPOTA",
	"CONDIMENTO",
	"CONSERVA",
	"DOCE",
	"FRIOS",    // ex: "FRIOS, VARIEDADE: PEITO DE PERU" — categoria de fatiados
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
	// Modificadores de tamanho (não alteram conceito do produto para fins de matching)
	"MINI",
	"GRANDE",
	"MEGA",
	"EXTRA",
	"INDIVIDUAL",
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
	{ classCode: 8915, keywords: ["BANANA", "MACA", "MAMAO", "LARANJA", "ABACAXI", "MELANCIA", "ALFACE", "TOMATE", "BATATA", "CEBOLA", "ALHO", "CENOURA", "CHUCHU", "BETERRABA", "REPOLHO", "CACAU"] },
	{ classCode: 8920, keywords: ["ARROZ", "FEIJAO", "MACARRAO", "PÃO", "PAO", "FARINHA", "AVEIA", "TRIGO", "MILHO", "CANJICA", "AMIDO", "BISCOITO", "TORRADA"] },
	{ classCode: 8925, keywords: ["ACUCAR", "AÇUCAR", "DOCE", "BOMBOM", "CHOCOLATE", "CASTANHA", "AMENDOIM", "PAÇOCA", "PACOCA"] },
	{ classCode: 8930, keywords: ["GELEIA", "CONSERVA", "GELATINA", "COMPOTA", "AZEITONA", "PICLES"] },
	{ classCode: 8935, keywords: ["SOPA", "CALDO"] },
	{ classCode: 8940, keywords: ["DIET", "LIGHT", "SUPLEMENTO", "LACTOSE", "GLUTEN", "ENTERAL"] },
	{ classCode: 8945, keywords: ["OLEO", "ÓLEO", "AZEITE", "GORDURA", "MARGARINA"] },
	{ classCode: 8950, keywords: ["SAL", "TEMPERO", "CONDIMENTO", "VINAGRE", "MOLHO", "PIMENTA", "ORÉGANO", "OREGANO"] },
	{ classCode: 8955, keywords: ["CAFE", "CAFÉ", "CHA", "CHÁ", "CHOCOLATE"] },
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
	const candidateTokens = tokenize(normalizeText(`${candidate.nome_pdm} ${candidate.descricao_item}`))
	let hits = 0
	for (const pTok of productTokens) {
		// Aceita match exato ou prefixo (≥4 chars) para cobrir variações de número/diminutivo:
		// "COOKIE" bate em "COOKIES", "BATATINHA" bate em "BATATA", etc.
		const matched = candidateTokens.some((cTok) => {
			if (pTok === cTok) return true
			const minLen = Math.min(pTok.length, cTok.length)
			return minLen >= 4 && (pTok.startsWith(cTok) || cTok.startsWith(pTok))
		})
		if (matched) hits++
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

function evaluateCandidate(ingredient: IngredientRow, cleanedDescription: string, candidate: CandidateRow): number {
	// Sem teto em 1.0: candidatos com bônus maiores (match no PDM, tokens, classe) ficam
	// acima de 1.0, vencendo candidatos que chegaram exatamente em 1.0 via word_similarity
	// pura (ex: "CACAU" bate em "MANTEIGA DE CACAU" e em "CACAU EM PÓ" com score=1 cada;
	// os bônus do segundo são maiores e desempatam corretamente).
	let score = Math.max(0, candidate.score ?? 0)

	const productTokens = tokenize(cleanedDescription)
	score += tokenOverlapScore(productTokens, candidate) * 0.15

	const productPrimaryToken = getPrimaryToken(cleanedDescription)
	const candidatePrimaryToken = getPrimaryToken(normalizeText(candidate.nome_pdm))
	if (productPrimaryToken && candidatePrimaryToken) {
		if (productPrimaryToken === candidatePrimaryToken) {
			score += 0.06
		} else if (!GENERIC_CANDIDATE_HEAD_TOKENS.has(candidatePrimaryToken)) {
			score -= 0.07
		}
	}

	const measureUnit = normalizeMeasureUnit(ingredient.measure_unit)
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

	// Bônus para tokens curtos (2 chars) significativos presentes no produto.
	// Exemplo: "Cacau em PÓ" → token "PO" (len=2, abaixo do mínimo do tokenize) deve
	// dar leve bônus ao item "CACAU, APRESENTAÇÃO: PÓ" sobre "CACAU, APRESENTAÇÃO: IN NATURA".
	// Usa word-boundary para evitar match de "PO" dentro de "COMPOSICAO", "PRAZO", etc.
	const shortSuffixTokens = cleanedDescription.split(" ").filter((t) => t.length === 2 && !STOPWORDS.has(t))
	if (shortSuffixTokens.length > 0) {
		const normalizedItemDesc = normalizeText(candidate.descricao_item)
		for (const shortToken of shortSuffixTokens) {
			if (new RegExp(`\\b${shortToken}\\b`).test(normalizedItemDesc)) score += 0.02
		}
	}

	// Penaliza falsos positivos onde o produto aparece na descrição CATMAT como ingrediente,
	// recheio ou característica adicional — não como sujeito principal do item.
	// Exemplos de falsos positivos que estas penalidades evitam:
	//   "Cacau em Pó" → CHOCOLATE EXPRESSO (tem "CACAU EM PÓ" nos INGREDIENTES)
	//   "Presunto"    → ALIMENTO SEMIPRONTO LASANHA (tem "PRESUNTO" no RECHEIO)
	//   "Azeite"      → CONDIMENTO TOMATE SECO (tem "AZEITE DE OLIVA" em CARACTERÍSTICAS)
	//   "Bebida Vegetal de Cacau" → qualquer item onde CACAU aparece após COMPOSIÇÃO
	const pdmScore = candidate.pdm_score ?? 0
	if ((candidate.score ?? 0) > 0.7) {
		const normalizedItemDesc = normalizeText(candidate.descricao_item)
		const ingredientMarkerIdx = normalizedItemDesc.search(
			/\bCOMPOSICAO\b|\bINGREDIENTES\b|\bINGREDIENTE\b|\bCARACTERISTICAS\b|\bRECHEIO\b|\bSABOR\b/,
		)
		const productTokenInDesc = productPrimaryToken ? normalizedItemDesc.indexOf(productPrimaryToken) : -1
		const matchesViaIngredientList = ingredientMarkerIdx !== -1 && productTokenInDesc > ingredientMarkerIdx

		// Exceção: primários iguais confirmam mesma categoria; pdm_score baixo vem de busca
		// secundária (token discriminante), não de falso positivo por ingrediente.
		// Ex: "BISCOITO COOKIE" → busca secundária "COOKIE" → BISCOITO TIPO COOKIES: primários
		// "BISCOITO"="BISCOITO" confirmam que é o item correto apesar de pdm_score=0.
		const primaryTokensMatch =
			productPrimaryToken != null &&
			candidatePrimaryToken != null &&
			productPrimaryToken === candidatePrimaryToken

		if (!primaryTokensMatch) {
			// Penalidade A: PDM completamente diferente, não genérico — produto é "estranho"
			// ao candidato (score alto apenas por presença parcial do token na descrição longa).
			if (pdmScore < 0.2 && !GENERIC_CANDIDATE_HEAD_TOKENS.has(candidatePrimaryToken ?? "")) {
				score -= 0.35
			}

			// Penalidade B: produto aparece após marcador de receita/ingrediente/recheio.
			// Aplica independente de pdm_score e independente de o PDM ser genérico.
			// Ex: "PRESUNTO" após "RECHEIO:" → penaliza LASANHA; "AZEITE" após "CARACTERÍSTICAS:" → penaliza CONDIMENTO.
			if (matchesViaIngredientList) {
				score -= 0.25
			}
		}
	}

	// Só aplica floor (0). Teto removido intencionalmente: bônus acumulados (token,
	// classe, PDM match) podem empurrar além de 1.0, permitindo desempate correto
	// entre candidatos com mesmo word_similarity base. Score é clampeado a 1.0
	// apenas ao persistir no banco (em decideProduct).
	return Math.max(0, score)
}

async function loadIngredients(options: Options): Promise<IngredientRow[]> {
	const rows: IngredientRow[] = []
	let from = options.offset
	let remaining = options.limit ?? Number.POSITIVE_INFINITY

	while (remaining > 0) {
		const pageSize = Math.min(PRODUCT_PAGE_SIZE, remaining)
		const to = from + pageSize - 1

		let query = supabase
			.from("ingredient")
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
		if (error) throw new Error(`falha ao carregar ingredientes: ${error.message}`)
		if (!data || data.length === 0) break

		rows.push(...(data as IngredientRow[]))
		if (data.length < pageSize) break

		from += pageSize
		remaining -= pageSize
	}

	return rows
}

async function findCandidates(cleanedDescription: string): Promise<CandidateRow[]> {
	const { data, error } = await supabase.rpc("catmat_match_candidates", {
		p_product_description: cleanedDescription,
		p_limit: 25,
	})

	if (error) throw new Error(`falha ao buscar candidatos CATMAT: ${error.message}`)
	const primary = (data as CandidateRow[] | null) ?? []

	// Busca secundária: usa tokens não-primários (len≥5) para capturar itens CATMAT
	// que contêm o token discriminante mas ficam além do p_limit=25 pelo critério de
	// ordenação (codigo_item baixo dos genéricos satura o ranking antes dos específicos).
	// Exemplo: "BISCOITO COOKIE" → busca "COOKIE" separada encontra BISCOITO TIPO COOKIES
	// que aparecem na posição ~112 da busca principal.
	const allTokens = tokenize(cleanedDescription)
	const nonPrimaryTokens = allTokens.slice(1).filter((t) => t.length >= 5)
	if (nonPrimaryTokens.length > 0) {
		const secondaryQuery = nonPrimaryTokens.join(" ")
		const { data: secData } = await supabase.rpc("catmat_match_candidates", {
			p_product_description: secondaryQuery,
			p_limit: 10,
		})
		if (secData) {
			const seenIds = new Set(primary.map((c) => c.codigo_item))
			const productPrimary = getPrimaryToken(cleanedDescription)
			for (const c of secData as CandidateRow[]) {
				if (seenIds.has(c.codigo_item)) continue
				// Filtra candidatos secundários: aceita apenas se o token primário do produto
				// aparece na descrição CATMAT do candidato (exato ou prefixo ≥4 chars).
				// Garante que a busca secundária discrimina pelo TIPO/SABOR/APRESENTAÇÃO
				// sem trazer itens onde o produto é apenas ingrediente/modificador:
				//   ✓ "BISCOITO COOKIE"      → "BISCOITO TIPO COOKIES"   ("BISCOITO" presente)
				//   ✓ "FRANGO INTEIRO"       → "CARNE DE AVE TIPO FRANGO" ("FRANGO" presente)
				//   ✗ "MORTADELA COM PIMENTA"→ "CONDIMENTO PIMENTA"       ("MORTADELA" ausente)
				//   ✗ "SORVETE DE CREME"    → "CREME FRUTAS INFANTIL"    ("SORVETE" ausente)
				if (productPrimary != null) {
					const candidateTokens = tokenize(normalizeText(`${c.nome_pdm} ${c.descricao_item}`))
					const primaryInCandidate = candidateTokens.some((cTok) => {
						if (productPrimary === cTok) return true
						const minLen = Math.min(productPrimary.length, cTok.length)
						return minLen >= 4 && (productPrimary.startsWith(cTok) || cTok.startsWith(productPrimary))
					})
					if (!primaryInCandidate) continue
				}
				primary.push(c)
				seenIds.add(c.codigo_item)
			}
		}
	}

	return primary
}

async function persistDecision(decision: IngredientDecision): Promise<void> {
	const { error } = await supabase
		.from("ingredient")
		.update({
			catmat_item_codigo: decision.catmatItemCodigo,
			catmat_item_descricao: decision.catmatItemDescricao,
			catmat_match_status: decision.status,
			catmat_match_score: decision.score,
		})
		.eq("id", decision.ingredientId)

	if (error) throw new Error(`falha ao atualizar ingrediente ${decision.ingredientId}: ${error.message}`)
}

async function decideIngredient(ingredient: IngredientRow): Promise<IngredientDecision> {
	const cleanedDescription = buildSearchDescription(ingredient.description)

	if (!cleanedDescription) {
		return {
			ingredientId: ingredient.id,
			status: "no_match",
			score: 0,
			catmatItemCodigo: null,
			catmatItemDescricao: null,
			reason: "empty_description",
		}
	}

	if (isPreparedFoodWithoutClearInput(ingredient.description ?? "", cleanedDescription)) {
		return {
			ingredientId: ingredient.id,
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
			ingredientId: ingredient.id,
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
			finalScore: evaluateCandidate(ingredient, cleanedDescription, candidate),
		}))
		.sort((left, right) => right.finalScore - left.finalScore)[0]

	if (!best || best.finalScore < REVIEW_THRESHOLD) {
		return {
			ingredientId: ingredient.id,
			status: "no_match",
			score: Math.min(best?.finalScore ?? 0, 1),
			catmatItemCodigo: null,
			catmatItemDescricao: null,
			reason: "low_score",
		}
	}

	if (best.finalScore < MATCH_THRESHOLD) {
		return {
			ingredientId: ingredient.id,
			status: "review",
			score: Math.min(best.finalScore, 1),
			catmatItemCodigo: best.candidate.codigo_item,
			catmatItemDescricao: best.candidate.descricao_item,
			reason: "needs_review",
		}
	}

	return {
		ingredientId: ingredient.id,
		status: "matched",
		score: Math.min(best.finalScore, 1),
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

function incrementSummary(summary: Summary, decision: IngredientDecision) {
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

async function processBatch(batch: IngredientRow[], summary: Summary, batchNumber: number, totalBatches: number): Promise<void> {
	for (const ingredient of batch) {
		try {
			const decision = await decideIngredient(ingredient)
			await persistDecision(decision)
			incrementSummary(summary, decision)
		} catch (error) {
			summary.errors++
			const message = error instanceof Error ? error.message : String(error)
			console.error(`[catmat-match] ingrediente ${ingredient.id}: ${message}`)
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
		`[catmat-match] carregando ingredientes` +
			` | offset=${options.offset}` +
			` limit=${options.limit ?? "all"}` +
			` batchSize=${options.batchSize}` +
			` concurrency=${options.batchConcurrency}` +
			` reprocessAll=${options.reprocessAll}`
	)

	const ingredients = await loadIngredients(options)
	const batches = chunk(ingredients, options.batchSize)
	const summary: Summary = {
		processed: 0,
		matched: 0,
		review: 0,
		no_match: 0,
		skip: 0,
		errors: 0,
	}

	console.log(`[catmat-match] ${ingredients.length} ingrediente(s) carregado(s) em ${batches.length} batch(es)`)

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
