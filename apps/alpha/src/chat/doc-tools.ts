/**
 * Leitura das fontes que não couberam inteiras no prompt (`ler_secao`, `buscar_no_documento`).
 *
 * Puro: opera sobre o texto e a árvore já carregados no turno. Nenhuma das duas lê banco
 * ou Storage — o que a ferramenta devolve é o que o turno já tinha, e por isso uma seção
 * lida aqui é citável como `[D1:3.2]` sem outra conferência.
 */

import type { DocumentSource, SectionNode } from "./sources.ts"

/** Teto do corpo devolvido por `ler_secao` — uma seção enorme não pode reencher o prompt. */
export const MAX_SECTION_CHARS = 20_000

export const MAX_SEARCH_HITS = 8

export const SEARCH_CONTEXT_CHARS = 400

/**
 * Corpo de uma seção e das subseções dela, na ordem do documento. `null` quando o caminho
 * não existe — e o agente devolve isso ao modelo como erro legível, não como vazio.
 */
export function readSection(nodes: readonly SectionNode[], path: string): { path: string; title: string; text: string; truncated: boolean } | null {
	const wanted = path.trim().replace(/\.$/, "")
	const index = nodes.findIndex((node) => node.path === wanted)
	if (index < 0) return null

	const root = nodes[index]
	const parts: string[] = []
	for (let i = index; i < nodes.length; i += 1) {
		const node = nodes[i]
		if (i > index && !(node.path.startsWith(`${root.path}.`) && node.level > root.level)) break
		parts.push(`${node.path} ${node.title}`)
		if (node.body) parts.push(node.body)
	}

	const text = parts.join("\n")
	return { path: root.path, title: root.title, text: text.slice(0, MAX_SECTION_CHARS), truncated: text.length > MAX_SECTION_CHARS }
}

/** Minúsculas e sem acento. Aplicado caractere a caractere em `searchDocument`, para o índice voltar ao original. */
function fold(text: string): string {
	return text
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
}

/**
 * Ocorrências literais do termo (sem acento e sem caixa), com contexto em volta e a seção
 * em que caem. Termo com menos de 2 caracteres não busca: casaria o documento inteiro.
 */
export function searchDocument(doc: DocumentSource, term: string): { total: number; hits: Array<{ section: string | null; excerpt: string }> } {
	const needle = fold(term.trim())
	if (needle.length < 2) return { total: 0, hits: [] }

	// O fold por caractere mantém o índice alinhado com o original, então o trecho sai do
	// texto de verdade, com acento — não da forma normalizada.
	const chars = [...doc.text]
	const folded = chars.map((char) => fold(char) || char)
	const haystack = folded.join("")
	const offsets: number[] = []
	let position = 0
	for (const piece of folded) {
		offsets.push(position)
		position += piece.length
	}
	const toCharIndex = (foldedIndex: number) => {
		let lo = 0
		let hi = offsets.length - 1
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1
			if (offsets[mid] <= foldedIndex) lo = mid
			else hi = mid - 1
		}
		return lo
	}

	const hits: Array<{ section: string | null; excerpt: string }> = []
	let total = 0
	let from = 0
	for (;;) {
		const found = haystack.indexOf(needle, from)
		if (found < 0) break
		total += 1
		from = found + needle.length
		if (hits.length >= MAX_SEARCH_HITS) continue

		const start = toCharIndex(found)
		const half = Math.floor(SEARCH_CONTEXT_CHARS / 2)
		const excerptStart = Math.max(0, start - half)
		const excerpt = chars.slice(excerptStart, Math.min(chars.length, start + half)).join("")
		hits.push({
			section: sectionAt(doc.nodes, chars.slice(0, start).join("")),
			excerpt: `${excerptStart > 0 ? "…" : ""}${excerpt.replace(/\s+/g, " ").trim()}…`,
		})
	}

	return { total, hits }
}

/**
 * Seção em que a ocorrência cai. O texto do documento é a concatenação de títulos e corpos
 * na ordem dos nós, então basta achar o último título que aparece ANTES da posição.
 */
function sectionAt(nodes: readonly SectionNode[], prefix: string): string | null {
	let best: { path: string; at: number } | null = null
	let cursor = 0
	for (const node of nodes) {
		const at = prefix.indexOf(node.title, cursor)
		if (at < 0) continue
		best = { path: node.path, at }
		cursor = at + node.title.length
	}
	return best?.path ?? null
}
