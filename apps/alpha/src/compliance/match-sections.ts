/**
 * Etapa 1.5 — casamento estrutural entre documento submetido e modelo da AGU.
 *
 * Determinístico por decisão de projeto: comparar dois conjuntos ordenados de
 * seções é um problema de algoritmo, resolvido em milissegundos, com resultado
 * idêntico a cada execução e testável por fixture. Um LLM aqui compraria
 * não-determinismo e latência sem ganho — ele só entra depois, para redigir a
 * recomendação sobre um diff já classificado.
 */

import { normalizeTitle } from "../lib/text.ts"

export type MatchStatus = "MATCHED" | "MISSING" | "EXTRA" | "OUT_OF_ORDER" | "RENAMED"

export interface ComparableSection {
	path: string
	ordinal: number
	title: string
	title_norm: string
	is_required: boolean
}

export interface SectionFinding {
	status: MatchStatus
	/** Seção do modelo, quando existe. */
	model_path?: string
	model_title?: string
	/** Seção do documento submetido, quando existe. */
	document_path?: string
	document_title?: string
	is_required: boolean
	/** Como o par foi encontrado — vazio para MISSING/EXTRA. */
	matched_by?: "exact" | "fuzzy" | "semantic"
	similarity?: number
}

/** Limiar do casamento léxico. */
export const FUZZY_THRESHOLD = 0.85

/** Limiar do casamento semântico. */
export const SEMANTIC_THRESHOLD = 0.8

export type EmbedTitles = (titles: string[]) => Promise<number[][]>

/**
 * Coeficiente de Dice sobre os conjuntos de palavras.
 *
 * Implementado aqui em vez de trazer dependência de fuzzy matching — o que se
 * precisa é insensibilidade a ordem e a uma palavra a mais, não distância de
 * edição. Dice em vez de Jaccard porque renomeação real acrescenta ou remove
 * uma palavra ("requisitos da contratação" → "requisitos da contratação
 * pretendida"): em Jaccard isso cai para 0,75 e não casa; em Dice fica 0,86.
 */
export function tokenSetRatio(left: string, right: string): number {
	const leftTokens = new Set(left.split(" ").filter(Boolean))
	const rightTokens = new Set(right.split(" ").filter(Boolean))
	if (leftTokens.size === 0 || rightTokens.size === 0) return 0

	let shared = 0
	for (const token of leftTokens) if (rightTokens.has(token)) shared += 1

	return (2 * shared) / (leftTokens.size + rightTokens.size)
}

export function cosineSimilarity(left: number[], right: number[]): number {
	let dot = 0
	let leftNorm = 0
	let rightNorm = 0

	for (let index = 0; index < left.length; index++) {
		dot += left[index] * right[index]
		leftNorm += left[index] ** 2
		rightNorm += right[index] ** 2
	}

	if (leftNorm === 0 || rightNorm === 0) return 0
	return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

/**
 * Subsequência comum máxima sobre os índices casados.
 *
 * Serve para responder "quais seções estão fora de ordem" sem marcar as duas
 * pontas de cada inversão: só o que fica **fora** da maior subsequência
 * crescente é desalinhado.
 */
export function longestIncreasingSubsequence(values: number[]): Set<number> {
	if (values.length === 0) return new Set()

	const tails: number[] = []
	const tailIndex: number[] = []
	const previous = new Array<number>(values.length).fill(-1)

	for (let index = 0; index < values.length; index++) {
		let low = 0
		let high = tails.length

		while (low < high) {
			const middle = (low + high) >> 1
			if (tails[middle] < values[index]) low = middle + 1
			else high = middle
		}

		if (low > 0) previous[index] = tailIndex[low - 1]
		tails[low] = values[index]
		tailIndex[low] = index
	}

	const keep = new Set<number>()
	let cursor = tailIndex[tails.length - 1]
	while (cursor !== -1 && cursor !== undefined) {
		keep.add(cursor)
		cursor = previous[cursor]
	}

	return keep
}

interface Pair {
	modelIndex: number
	documentIndex: number
	matchedBy: "exact" | "fuzzy" | "semantic"
	similarity: number
}

/**
 * Casa as seções em três passadas, da mais barata para a mais cara.
 *
 * Cada seção do documento é consumida no máximo uma vez, e as passadas seguem a
 * ordem do modelo — o que torna o resultado independente da ordem de iteração e,
 * portanto, reproduzível.
 */
export async function matchSections(modelSections: ComparableSection[], documentSections: ComparableSection[], embed?: EmbedTitles): Promise<SectionFinding[]> {
	const usedDocument = new Set<number>()
	const pairs = new Map<number, Pair>()

	const takeMatch = (modelIndex: number, documentIndex: number, matchedBy: Pair["matchedBy"], similarity: number) => {
		pairs.set(modelIndex, { modelIndex, documentIndex, matchedBy, similarity })
		usedDocument.add(documentIndex)
	}

	// 1. Título exato após normalização.
	const byNormalized = new Map<string, number[]>()
	documentSections.forEach((section, index) => {
		const bucket = byNormalized.get(section.title_norm)
		if (bucket) bucket.push(index)
		else byNormalized.set(section.title_norm, [index])
	})

	modelSections.forEach((section, modelIndex) => {
		const candidates = byNormalized.get(section.title_norm) ?? []
		const free = candidates.find((index) => !usedDocument.has(index))
		if (free !== undefined) takeMatch(modelIndex, free, "exact", 1)
	})

	// 2. Similaridade léxica.
	modelSections.forEach((section, modelIndex) => {
		if (pairs.has(modelIndex)) return

		let best: { index: number; score: number } | null = null
		documentSections.forEach((candidate, index) => {
			if (usedDocument.has(index)) return
			const score = tokenSetRatio(section.title_norm, candidate.title_norm)
			if (!best || score > best.score) best = { index, score }
		})

		if (best && (best as { score: number }).score >= FUZZY_THRESHOLD) {
			takeMatch(modelIndex, (best as { index: number }).index, "fuzzy", (best as { score: number }).score)
		}
	})

	// 3. Similaridade semântica — só para o que sobrou, e só se houver embedder.
	const pendingModel = modelSections.map((_, index) => index).filter((index) => !pairs.has(index))
	const pendingDocument = documentSections.map((_, index) => index).filter((index) => !usedDocument.has(index))

	if (embed && pendingModel.length > 0 && pendingDocument.length > 0) {
		const vectors = await embed([...pendingModel.map((index) => modelSections[index].title), ...pendingDocument.map((index) => documentSections[index].title)])

		const modelVectors = vectors.slice(0, pendingModel.length)
		const documentVectors = vectors.slice(pendingModel.length)

		pendingModel.forEach((modelIndex, position) => {
			let best: { index: number; score: number } | null = null

			pendingDocument.forEach((documentIndex, documentPosition) => {
				if (usedDocument.has(documentIndex)) return
				const score = cosineSimilarity(modelVectors[position], documentVectors[documentPosition])
				if (!best || score > best.score) best = { index: documentIndex, score }
			})

			if (best && (best as { score: number }).score >= SEMANTIC_THRESHOLD) {
				takeMatch(modelIndex, (best as { index: number }).index, "semantic", (best as { score: number }).score)
			}
		})
	}

	// Ordem: sobre os pares, na ordem do modelo, o que sai da subsequência
	// crescente dos índices do documento está fora de ordem.
	const ordered = [...pairs.values()].sort((left, right) => left.modelIndex - right.modelIndex)
	const inOrder = longestIncreasingSubsequence(ordered.map((pair) => pair.documentIndex))

	const findings: SectionFinding[] = []

	ordered.forEach((pair, position) => {
		const model = modelSections[pair.modelIndex]
		const document = documentSections[pair.documentIndex]
		const outOfOrder = !inOrder.has(position)
		const renamed = pair.matchedBy !== "exact"

		findings.push({
			status: outOfOrder ? "OUT_OF_ORDER" : renamed ? "RENAMED" : "MATCHED",
			model_path: model.path,
			model_title: model.title,
			document_path: document.path,
			document_title: document.title,
			is_required: model.is_required,
			matched_by: pair.matchedBy,
			similarity: pair.similarity,
		})
	})

	modelSections.forEach((section, modelIndex) => {
		if (pairs.has(modelIndex)) return
		findings.push({ status: "MISSING", model_path: section.path, model_title: section.title, is_required: section.is_required })
	})

	documentSections.forEach((section, index) => {
		if (usedDocument.has(index)) return
		findings.push({ status: "EXTRA", document_path: section.path, document_title: section.title, is_required: false })
	})

	return findings
}

/** Conveniência para comparar a partir de títulos crus. */
export function toComparable(sections: Array<{ path: string; ordinal: number; title: string; is_required?: boolean }>): ComparableSection[] {
	return sections.map((section) => ({
		path: section.path,
		ordinal: section.ordinal,
		title: section.title,
		title_norm: normalizeTitle(section.title),
		is_required: section.is_required ?? true,
	}))
}
