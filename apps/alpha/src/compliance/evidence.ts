/**
 * @module evidence
 * A evidência citada num veredito existe mesmo no trecho analisado?
 *
 * O juiz devolve `evidence` como "trecho do documento que sustenta a constatação", e nada
 * conferia isso: a fundamentação repousava no prompt e no guard de citação, que olha a
 * NORMA citada, nunca o DOCUMENTO. Um achado podia apontar inconformidade citando uma frase
 * que o ETP não contém — e quem lê o parecer não tem como perceber, porque a frase parece
 * do documento.
 *
 * ─── Por que busca própria, e não `locateSpan` ────────────────────────────────
 * `locateSpan` foi afinado para outro problema: achar citação longa dentro do documento
 * INTEIRO. Aqui o alvo é um campo extraído, quase sempre curto. Reusá-lo quebrava dois
 * casos, ambos medidos: ele recusa citação com menos de 12 caracteres — `"12 meses"`
 * literal dava "não localizada", e regra sobre prazo, valor ou modalidade deixaria de
 * gerar QUALQUER achado — e a janela aproximada, presa ao tamanho do bloco, dilui a
 * similaridade quando a citação cobre quase todo um bloco curto.
 *
 * ─── Por que determinístico, e não uma segunda chamada de modelo ──────────────
 * O grader do grafo pergunta "esta afirmação decorre destes documentos?", que é
 * julgamento. Aqui a pergunta é "este texto está neste bloco?", que é busca — e busca se
 * resolve exatamente, sem inferência e sem poder alucinar.
 *
 * Módulo puro: `verify.ts` importa `db/supabase`, e importá-lo de um teste dispara a
 * validação de ambiente na carga e derruba a suíte.
 */

/** Similaridade mínima para aceitar uma correspondência aproximada. */
const MIN_SIMILARITY = 0.72

/** O que o guard precisa saber de um veredito. */
export interface EvidenceClaim {
	status: "CONFORME" | "INCONFORME" | "NAO_AVALIADA"
	evidence: string | null
}

/** Onde a evidência aparece no bloco original. */
export interface EvidenceSpan {
	start: number
	end: number
	text: string
	/** `exact` quando o texto foi encontrado literalmente; `fuzzy` quando por similaridade. */
	match: "exact" | "fuzzy"
}

/**
 * Forma comparável: sem acento, sem caixa, espaço colapsado.
 *
 * O mapa devolve, para cada posição normalizada, a posição correspondente no original —
 * é o que permite recortar o trecho real depois de casar na forma normalizada.
 */
function normalizeWithMap(text: string): { normalized: string; map: number[] } {
	const chars: string[] = []
	const map: number[] = []
	let lastWasSpace = true

	for (let i = 0; i < text.length; i++) {
		const char = text[i]
		if (/\s/.test(char)) {
			if (!lastWasSpace) {
				chars.push(" ")
				map.push(i)
				lastWasSpace = true
			}
			continue
		}
		chars.push(
			char
				.toLowerCase()
				.normalize("NFD")
				.replace(/\p{Diacritic}/gu, "")
		)
		map.push(i)
		lastWasSpace = false
	}

	return { normalized: chars.join("").trim(), map }
}

function tokens(text: string): Set<string> {
	return new Set(text.split(" ").filter(Boolean))
}

/** Jaccard entre os conjuntos de palavras. */
function similarity(left: string, right: string): number {
	const a = tokens(left)
	const b = tokens(right)
	if (a.size === 0 || b.size === 0) return 0

	let shared = 0
	for (const token of a) if (b.has(token)) shared += 1
	return shared / (a.size + b.size - shared)
}

/**
 * Localiza a evidência no bloco.
 *
 * Primeiro tenta conter literalmente na forma normalizada — o que resolve tanto a citação
 * curta (`"12 meses"`) quanto a longa, e absorve acento, caixa e espaçamento que o modelo
 * altera ao transcrever. Só então cai para similaridade, comparando a citação com a janela
 * de mesmo tamanho que melhor casa; num bloco menor que a citação, compara com o bloco
 * inteiro, sem diluir por padding.
 */
export function locateEvidence(claim: EvidenceClaim, blockText: string): EvidenceSpan | null {
	const evidence = claim.evidence?.trim()
	if (!evidence || !blockText.trim()) return null

	const { normalized: haystack, map } = normalizeWithMap(blockText)
	const { normalized: needle } = normalizeWithMap(evidence)
	if (!needle) return null

	const exact = haystack.indexOf(needle)
	if (exact >= 0) {
		const start = map[exact] ?? 0
		const end = (map[Math.min(exact + needle.length - 1, map.length - 1)] ?? start) + 1
		return { start, end, text: blockText.slice(start, end), match: "exact" }
	}

	// Bloco menor que a citação: comparar com o bloco inteiro. Deslizar uma janela maior
	// que o próprio bloco só acrescentaria vazio e derrubaria a similaridade.
	if (haystack.length <= needle.length) {
		return similarity(needle, haystack) >= MIN_SIMILARITY ? { start: 0, end: blockText.length, text: blockText, match: "fuzzy" } : null
	}

	const windowSize = needle.length
	const step = Math.max(1, Math.floor(windowSize / 4))
	let best: { score: number; offset: number } | null = null

	for (let offset = 0; offset + windowSize <= haystack.length; offset += step) {
		const score = similarity(needle, haystack.slice(offset, offset + windowSize))
		if (!best || score > best.score) best = { score, offset }
	}

	if (!best || best.score < MIN_SIMILARITY) return null

	const start = map[best.offset] ?? 0
	const end = (map[Math.min(best.offset + windowSize - 1, map.length - 1)] ?? start) + 1
	return { start, end, text: blockText.slice(start, end), match: "fuzzy" }
}

/** Por que um achado foi descartado por fundamentação. */
export type EvidenceGuardReason = "sem_evidencia" | "evidencia_nao_localizada"

export interface EvidenceOutcome {
	reason: EvidenceGuardReason | null
	span: EvidenceSpan | null
}

/**
 * Julga a fundamentação de um veredito.
 *
 * Só julga INCONFORME: `CONFORME` e `NAO_AVALIADA` não viram achado, e conferir ali
 * gastaria busca sem mudar nada. Inconformidade SEM evidência também é descartada — um
 * achado que não cita nada do documento não é conferível por quem lê o parecer, e o guard
 * de citação não cobre esse caso (ele exige referência à NORMA, não ao documento).
 */
export function judgeEvidence(claim: EvidenceClaim, blockText: string | undefined): EvidenceOutcome {
	if (claim.status !== "INCONFORME") return { reason: null, span: null }
	if (blockText === undefined) return { reason: null, span: null }
	if (!claim.evidence?.trim()) return { reason: "sem_evidencia", span: null }

	const span = locateEvidence(claim, blockText)
	return span ? { reason: null, span } : { reason: "evidencia_nao_localizada", span: null }
}
