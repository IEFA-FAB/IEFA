/**
 * Leitor de `.docx` (OOXML) sob medida para os modelos da AGU.
 *
 * Por que não `mammoth`: os modelos codificam a hierarquia em **estilos de
 * parágrafo próprios** (`Nivel01`, `Nvel02`, `Nvel2-Opcional`, `Nvel1-SemNumeracao`)
 * e as notas explicativas em **comentários do Word** (`word/comments.xml`,
 * ancorados por `w:commentRangeStart`). Converter para HTML antes de estruturar
 * joga fora exatamente esses dois sinais — que são o motivo de ler o `.docx`.
 *
 * O scanner é deliberadamente mínimo: `w:p` não aninha em OOXML, então varrer os
 * parágrafos em ordem de documento com expressão regular é previsível. Tudo que
 * ele produz é validado contra os modelos reais em `__fixtures__/`.
 */

import { unzipSync } from "fflate"
import { cleanText } from "../lib/text.ts"

export interface DocxParagraph {
	/** Nome do estilo declarado em `w:pStyle` (ex.: `Nvel2-Opcional`). */
	style: string | null
	text: string
	/** IDs dos comentários que começam neste parágrafo. */
	commentIds: string[]
}

export interface DocxComment {
	id: string
	author: string | null
	text: string
}

export interface DocxDocument {
	paragraphs: DocxParagraph[]
	comments: Map<string, DocxComment>
}

const PARAGRAPH = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:p(?:\s[^>]*)?\/>/g
const PARAGRAPH_STYLE = /<w:pStyle\s+w:val="([^"]+)"/
const TEXT_RUN = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
const TAB_OR_BREAK = /<w:(?:tab|br)\b[^>]*\/?>/g
const COMMENT_RANGE_START = /<w:commentRangeStart\s+w:id="([^"]+)"/g
const COMMENT = /<w:comment\s[^>]*>[\s\S]*?<\/w:comment>/g
const COMMENT_ID = /w:id="([^"]+)"/
const COMMENT_AUTHOR = /w:author="([^"]*)"/

const XML_ENTITIES: Record<string, string> = {
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&apos;": "'",
}

function decodeXml(value: string): string {
	return value
		.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity] ?? entity)
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
}

function collectText(paragraphXml: string): string {
	const withSeparators = paragraphXml.replace(TAB_OR_BREAK, " ")
	const parts: string[] = []
	TEXT_RUN.lastIndex = 0
	let match = TEXT_RUN.exec(withSeparators)
	while (match) {
		parts.push(decodeXml(match[1]))
		match = TEXT_RUN.exec(withSeparators)
	}
	return cleanText(parts.join(""))
}

function collectCommentIds(paragraphXml: string): string[] {
	const ids: string[] = []
	COMMENT_RANGE_START.lastIndex = 0
	let match = COMMENT_RANGE_START.exec(paragraphXml)
	while (match) {
		ids.push(match[1])
		match = COMMENT_RANGE_START.exec(paragraphXml)
	}
	return ids
}

function parseComments(xml: string | undefined): Map<string, DocxComment> {
	const comments = new Map<string, DocxComment>()
	if (!xml) return comments

	COMMENT.lastIndex = 0
	let match = COMMENT.exec(xml)
	while (match) {
		const block = match[0]
		const id = COMMENT_ID.exec(block)?.[1]
		if (id) {
			comments.set(id, {
				id,
				author: COMMENT_AUTHOR.exec(block)?.[1] ?? null,
				text: collectText(block),
			})
		}
		match = COMMENT.exec(xml)
	}
	return comments
}

export function parseDocx(bytes: Uint8Array): DocxDocument {
	const entries = unzipSync(bytes, { filter: (file) => file.name === "word/document.xml" || file.name === "word/comments.xml" })

	const documentXml = entries["word/document.xml"]
	if (!documentXml) throw new Error("docx inválido: word/document.xml ausente")

	const decoder = new TextDecoder()
	const body = decoder.decode(documentXml)
	const comments = parseComments(entries["word/comments.xml"] ? decoder.decode(entries["word/comments.xml"]) : undefined)

	const paragraphs: DocxParagraph[] = []
	PARAGRAPH.lastIndex = 0
	let match = PARAGRAPH.exec(body)
	while (match) {
		const xml = match[0]
		paragraphs.push({
			style: PARAGRAPH_STYLE.exec(xml)?.[1] ?? null,
			text: collectText(xml),
			commentIds: collectCommentIds(xml),
		})
		match = PARAGRAPH.exec(body)
	}

	return { paragraphs, comments }
}
