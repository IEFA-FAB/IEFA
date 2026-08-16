/**
 * Documento submetido → texto e árvore de seções.
 *
 * Serve tanto à extração (Etapa 1.4), que precisa do texto corrido para
 * localizar spans, quanto à comparação estrutural (Etapa 1.5), que precisa da
 * hierarquia de seções do documento do usuário para confrontar com o modelo AGU.
 *
 * Diferente do modelo da AGU, um ETP/TR real não usa os estilos de parágrafo da
 * AGU: a hierarquia vem do estilo de heading do Word quando existe, e de
 * heurística de numeração quando não existe.
 */

import { extractText, getDocumentProxy } from "unpdf"
import { cleanText, normalizeTitle } from "../lib/text.ts"
import { type DocxParagraph, parseDocx } from "../sources/docx.ts"
import type { StructureNodeDraft } from "../sources/types.ts"

export interface SubmissionText {
	text: string
	nodes: StructureNodeDraft[]
}

/** `Heading1`, `Ttulo1`, `Heading 2`. */
const HEADING_STYLE = /^(?:heading|titulo|ttulo|t[íi]tulo)\s*(\d)/i

/** "1.", "1.1", "1.2.3 " no início do parágrafo. */
const NUMBERED_HEADING = /^(\d+(?:\.\d+)*)[.)]?\s+\S/

/** Título curto e em caixa alta costuma ser cabeçalho de seção em ETP/TR. */
function looksLikeHeading(text: string): boolean {
	if (text.length > 120) return false
	const letters = text.replace(/[^\p{L}]/gu, "")
	if (letters.length < 3) return false
	return letters === letters.toUpperCase()
}

function levelOf(paragraph: DocxParagraph): number | null {
	const style = paragraph.style ?? ""
	const heading = HEADING_STYLE.exec(style)
	if (heading) return Number(heading[1])

	const numbered = NUMBERED_HEADING.exec(paragraph.text)
	if (numbered) return Math.min(numbered[1].split(".").length, 5)

	if (looksLikeHeading(paragraph.text)) return 1

	return null
}

function buildNodes(paragraphs: Array<{ level: number | null; text: string }>): StructureNodeDraft[] {
	const nodes: StructureNodeDraft[] = []
	const counters: number[] = []

	for (const paragraph of paragraphs) {
		if (!paragraph.text) continue

		if (paragraph.level === null) {
			const current = nodes.at(-1)
			if (current) current.body = current.body ? `${current.body}\n${paragraph.text}` : paragraph.text
			continue
		}

		counters.length = Math.min(counters.length, paragraph.level)
		while (counters.length < paragraph.level) counters.push(0)
		counters[paragraph.level - 1] += 1

		nodes.push({
			path: counters.join("."),
			ordinal: nodes.length,
			level: paragraph.level,
			title: paragraph.text,
			title_norm: normalizeTitle(paragraph.text),
			is_required: true,
			body: "",
			notes: [],
			placeholders: [],
		})
	}

	return nodes
}

export function docxToSubmissionText(bytes: Uint8Array): SubmissionText {
	const docx = parseDocx(bytes)
	const paragraphs = docx.paragraphs.map((paragraph) => ({ level: levelOf(paragraph), text: paragraph.text }))

	return {
		text: paragraphs
			.map((paragraph) => paragraph.text)
			.filter(Boolean)
			.join("\n"),
		nodes: buildNodes(paragraphs),
	}
}

export async function pdfToSubmissionText(bytes: Uint8Array): Promise<SubmissionText> {
	const pdf = await getDocumentProxy(bytes)
	const { text } = await extractText(pdf, { mergePages: true })
	const lines = (Array.isArray(text) ? text.join("\n") : text).split(/\r?\n/).map((line) => cleanText(line))

	const paragraphs = lines.map((line) => {
		// A numeração inteira define o nível ("2.1.3" → 3). Contar pontos no
		// primeiro segmento devolvia 1 sempre, achatando a árvore do PDF.
		const numbered = NUMBERED_HEADING.exec(line)
		const level = numbered ? Math.min(numbered[1].split(".").length, 5) : looksLikeHeading(line) ? 1 : null

		return { level, text: line }
	})

	return { text: lines.filter(Boolean).join("\n"), nodes: buildNodes(paragraphs) }
}

export async function toSubmissionText(bytes: Uint8Array, mimeType: string): Promise<SubmissionText> {
	if (mimeType.includes("wordprocessingml") || mimeType.endsWith("docx")) return docxToSubmissionText(bytes)
	if (mimeType.includes("pdf")) return pdfToSubmissionText(bytes)
	throw new Error(`formato não suportado: ${mimeType}`)
}
