/**
 * Localização do trecho de origem no documento submetido.
 *
 * O modelo devolve uma citação literal por campo; aqui ela é reencontrada no
 * texto para virar posição. Essa inversão é deliberada: pedir offsets ao modelo
 * produz números plausíveis e errados, enquanto uma citação errada simplesmente
 * não é encontrada — e o campo é descartado, como manda a regra de que valor
 * sem origem rastreável não é persistido.
 */

import { stripDiacritics } from "../lib/text.ts"
import type { SourceSpan } from "./schema.ts"

/** Similaridade mínima para aceitar um trecho aproximado. */
const MIN_SIMILARITY = 0.72

/** Trecho de busca aproximada — janela em caracteres ao redor de cada candidato. */
const WINDOW_PADDING = 40

function normalizeForSearch(value: string): string {
	return stripDiacritics(value).toLowerCase().replace(/\s+/g, " ").trim()
}

/**
 * Mapa da posição normalizada de volta para a posição no texto original.
 *
 * Sem ele, o span calculado sobre o texto normalizado apontaria para o lugar
 * errado em qualquer documento com espaçamento irregular — que é a norma em
 * `.docx` e `.pdf` de origem.
 */
function buildIndexMap(original: string): { normalized: string; map: number[] } {
	const map: number[] = []
	let normalized = ""
	let lastWasSpace = false

	for (let index = 0; index < original.length; index++) {
		const char = stripDiacritics(original[index]).toLowerCase()
		const isSpace = /\s/.test(char)

		if (isSpace) {
			if (lastWasSpace || normalized.length === 0) continue
			normalized += " "
			map.push(index)
			lastWasSpace = true
			continue
		}

		normalized += char
		map.push(index)
		lastWasSpace = false
	}

	return { normalized, map }
}

/** Similaridade por sobreposição de tokens (Jaccard sobre palavras). */
export function tokenSimilarity(left: string, right: string): number {
	const leftTokens = new Set(normalizeForSearch(left).split(" ").filter(Boolean))
	const rightTokens = new Set(normalizeForSearch(right).split(" ").filter(Boolean))
	if (leftTokens.size === 0 || rightTokens.size === 0) return 0

	let shared = 0
	for (const token of leftTokens) if (rightTokens.has(token)) shared += 1

	return shared / (leftTokens.size + rightTokens.size - shared)
}

/**
 * Encontra `evidence` em `documentText`.
 *
 * Tenta correspondência exata sobre a forma normalizada; se falhar, procura a
 * janela de maior similaridade, o que absorve as diferenças de espaçamento e
 * hifenização que o modelo introduz ao transcrever.
 */
export function locateSpan(documentText: string, evidence: string): SourceSpan | null {
	const trimmed = evidence.trim()
	if (trimmed.length < 12) return null

	const { normalized, map } = buildIndexMap(documentText)
	const needle = normalizeForSearch(trimmed)
	if (!needle) return null

	const exact = normalized.indexOf(needle)
	if (exact >= 0) {
		const start = map[exact]
		const end = (map[exact + needle.length - 1] ?? map[map.length - 1]) + 1
		return { start, end, text: documentText.slice(start, end) }
	}

	// Busca aproximada: desliza uma janela do tamanho da citação e fica com a de
	// maior similaridade, desde que passe do limiar.
	const windowSize = Math.min(needle.length + WINDOW_PADDING, normalized.length)
	const step = Math.max(1, Math.floor(windowSize / 4))

	let best: { score: number; offset: number } | null = null
	for (let offset = 0; offset + windowSize <= normalized.length; offset += step) {
		const score = tokenSimilarity(needle, normalized.slice(offset, offset + windowSize))
		if (!best || score > best.score) best = { score, offset }
	}

	if (!best || best.score < MIN_SIMILARITY) return null

	const start = map[best.offset]
	const end = (map[Math.min(best.offset + windowSize - 1, map.length - 1)] ?? map[map.length - 1]) + 1
	return { start, end, text: documentText.slice(start, end) }
}
