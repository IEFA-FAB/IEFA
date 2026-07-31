/**
 * Adapter da fonte `agu-modelos-14133`.
 *
 * Mapeia o `.docx` da AGU para os três artefatos que a verificação de
 * conformidade consome:
 *
 * - **árvore de seções** — os modelos codificam o nível em estilos de parágrafo
 *   próprios (`Nivel01`, `Nvel02`, `Nivel3`, `Nvel4-R`), com sufixo `-Opcional`
 *   para o que é facultativo. Daí sai `structure_node.is_required`.
 * - **notas explicativas** — comentários do Word ancorados no parágrafo. São a
 *   própria AGU declarando qual dispositivo fundamenta cada seção; viram semente
 *   de `checklist_rule` (sempre em `draft`).
 * - **placeholders** — tokens entre colchetes (`[INSERIR OBJETO]`), insumo do
 *   MontaDoc na Fase 2.
 */

import { extractLegalRefs } from "../../lib/legal-ref.ts"
import { cleanText, normalizeTitle, stripDiacritics } from "../../lib/text.ts"
import { type DocxDocument, parseDocx } from "../docx.ts"
import type { ExplanatoryNoteDraft, NormativeSourceAdapter, PlaceholderDraft, SourceItem, StructuredDoc, StructureNodeDraft } from "../types.ts"
import { discoverAguModels, EXCLUDED_CATEGORIES, UNVERSIONED_LABEL } from "./discover.ts"

/**
 * `Nivel01`, `Nvel02`, `Nvel2-Opcional`, `Nivel3`, `Nvel4-R`, `Nvel1-SemNumeracao`.
 * O Word grava o ID do estilo sem acento, então "Nível" aparece ora como
 * `Nivel`, ora como `Nvel` — os dois convivem no mesmo arquivo.
 */
const LEVEL_STYLE = /^ni?vel\s*0?(\d)/

/** Tokens de preenchimento: `[INSERIR OBJETO]`, `[...]`, `[indicar o prazo]`. */
const PLACEHOLDER_TOKEN = /\[[^[\]]{1,120}\]/g

/** Comentários com esse prefixo são nota explicativa; os demais são orientação de uso do modelo. */
const NOTE_PREFIX = /nota\s+explicativa/i

interface StyleInfo {
	level: number
	isOptional: boolean
}

/**
 * Interpreta o nome do estilo de parágrafo.
 *
 * A AGU alterna grafias para o mesmo conceito (`Nivel01`, `Nvel02`,
 * `Nivel2-Opcional`, `Nvel2-Opcional`), então a comparação é feita sobre o nome
 * sem acento e em minúsculas.
 */
export function parseStyle(style: string | null): StyleInfo | null {
	if (!style) return null

	const normalized = stripDiacritics(style).toLowerCase()
	const match = LEVEL_STYLE.exec(normalized)
	if (!match) return null

	return { level: Number(match[1]), isOptional: normalized.includes("opcional") }
}

function extractPlaceholders(text: string): PlaceholderDraft[] {
	const tokens = text.match(PLACEHOLDER_TOKEN) ?? []
	const unique = new Set(tokens.map((token) => cleanText(token)))
	return [...unique].map((token) => ({ token }))
}

function noteFromComment(content: string): ExplanatoryNoteDraft | null {
	const text = cleanText(content)
	if (!text) return null
	return { content: text, cited_refs: extractLegalRefs(text) }
}

/** Caminho ltree a partir da pilha de contadores por nível: [1,3,2] → `1.3.2`. */
function pathFromCounters(counters: number[]): string {
	return counters.join(".")
}

/**
 * Percorre os parágrafos em ordem de documento montando a árvore.
 *
 * Parágrafo sem estilo de nível (cabeçalho do documento, célula de tabela) é
 * anexado ao corpo do último nó aberto — nunca abre nó nem aborta o parse.
 */
export function buildNodes(docx: DocxDocument): StructureNodeDraft[] {
	const nodes: StructureNodeDraft[] = []
	const counters: number[] = []
	let ordinal = 0

	const attachToCurrent = (text: string, commentIds: string[]) => {
		const current = nodes.at(-1)
		if (!current) return

		if (text) {
			current.body = current.body ? `${current.body}\n${text}` : text
			current.placeholders.push(...extractPlaceholders(text))
		}
		for (const id of commentIds) {
			const comment = docx.comments.get(id)
			if (!comment || !NOTE_PREFIX.test(comment.text)) continue
			const note = noteFromComment(comment.text)
			if (note) current.notes.push(note)
		}
	}

	for (const paragraph of docx.paragraphs) {
		const info = parseStyle(paragraph.style)

		if (!info) {
			attachToCurrent(paragraph.text, paragraph.commentIds)
			continue
		}

		// Parágrafo de nível sem texto não abre seção — só ruído de formatação.
		if (!paragraph.text) continue

		counters.length = Math.min(counters.length, info.level)
		while (counters.length < info.level) counters.push(0)
		counters[info.level - 1] += 1

		const node: StructureNodeDraft = {
			path: pathFromCounters(counters),
			ordinal: ordinal++,
			level: info.level,
			title: paragraph.text,
			title_norm: normalizeTitle(paragraph.text),
			is_required: !info.isOptional,
			body: "",
			notes: [],
			placeholders: extractPlaceholders(paragraph.text),
		}
		nodes.push(node)

		for (const id of paragraph.commentIds) {
			const comment = docx.comments.get(id)
			if (!comment || !NOTE_PREFIX.test(comment.text)) continue
			const note = noteFromComment(comment.text)
			if (note) node.notes.push(note)
		}
	}

	// Placeholders repetidos dentro do mesmo nó não agregam informação.
	for (const node of nodes) {
		const unique = new Map(node.placeholders.map((placeholder) => [placeholder.token, placeholder]))
		node.placeholders = [...unique.values()]
	}

	return nodes
}

async function sha256(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer)
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function createAguAdapter(baseUrl: string): NormativeSourceAdapter {
	return {
		id: "agu-modelos-14133",

		async discover() {
			const report = await discoverAguModels(baseUrl)
			if (report.supersededByNewer.length > 0) {
				console.info(`[agu] ${report.supersededByNewer.length} versão(ões) antiga(s) ignorada(s) por existir versão mais nova na mesma página`)
			}
			if (report.excluded.length > 0) {
				console.info(`[agu] ${report.excluded.length} arquivo(s) ignorado(s) por estarem em categoria excluída (${[...EXCLUDED_CATEGORIES].join(", ")})`)
			}
			return report.items
		},

		async fetch(item: SourceItem) {
			const response = await fetch(item.fetch_url, { headers: { "User-Agent": "iefa-alpha/1.0 (+https://portal.iefa.com.br)" } })
			if (!response.ok) throw new Error(`GET ${item.fetch_url} → ${response.status}`)
			return new Uint8Array(await response.arrayBuffer())
		},

		async parse(raw: Uint8Array, item: SourceItem): Promise<StructuredDoc> {
			const docx = parseDocx(raw)
			const nodes = buildNodes(docx)

			if (nodes.length === 0) {
				throw new Error(`AGU: nenhuma seção reconhecida em ${item.fetch_url} — estilos do modelo podem ter mudado`)
			}

			const contentHash = await sha256(raw)

			return {
				document_type: "MODELO_AGU",
				title: item.title,
				// Modelo cujo nome não traz mês/ano só pode ser versionado pelo
				// conteúdo — é o que distingue uma republicação de uma reingestão.
				version_label: item.version_label === UNVERSIONED_LABEL ? contentHash.slice(0, 12) : item.version_label,
				effective_from: item.effective_from,
				content_hash: contentHash,
				nodes,
			}
		},
	}
}
