/**
 * `.docx` mínimo a partir dos blocos de uma peça (`formBlocks`): título, seções e parágrafos.
 *
 * Existe para a peça gerada da demanda entrar na ACI pelo MESMO caminho de um documento
 * enviado (bucket, extração, verificação), sem formato novo no Storage nem no leitor. Por isso
 * o que importa aqui é o que `parseDocx` lê: `w:p` com `w:pStyle` `HeadingN` para os títulos
 * e o texto em `w:t`.
 *
 * Tabela sai linha a linha, "Coluna: valor; …", e não como `w:tbl`: o leitor lê cada célula
 * como parágrafo solto, e célula curta em caixa alta ("UN", "CATMAT") viraria título de seção
 * na estrutura que a ACI compara com o modelo da AGU.
 */

import type { DocBlock } from "@iefa/alpha-client/demand"
import { strToU8, zipSync } from "fflate"

/** Controles C0 fora de tab, LF e CR: o XML 1.0 não os aceita nem escapados. */
function isXmlChar(char: string): boolean {
	const code = char.charCodeAt(0)
	return code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d
}

function escapeXml(value: string): string {
	return [...value].filter(isXmlChar).join("").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function paragraph(text: string, style?: string): string {
	const properties = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""
	return `<w:p>${properties}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

function blockXml(block: DocBlock): string {
	switch (block.type) {
		case "heading":
			return paragraph(block.text, `Heading${block.level}`)
		case "paragraph":
			return paragraph(block.text)
		case "table":
			return block.rows
				.map((row) =>
					paragraph(
						row
							.map((cell, index) => (cell.trim() ? `${block.columns[index] ?? ""}: ${cell.trim()}` : null))
							.filter((cell): cell is string => cell !== null)
							.join("; ")
					)
				)
				.join("")
	}
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`

function headingStyle(level: number, size: number): string {
	return `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${level - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${headingStyle(1, 28)}${headingStyle(2, 24)}${headingStyle(3, 22)}</w:styles>`

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

export function buildDocx(blocks: readonly DocBlock[]): Uint8Array {
	const body = blocks.map(blockXml).join("")
	const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1134" w:bottom="1134" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`

	return zipSync({
		"[Content_Types].xml": strToU8(CONTENT_TYPES),
		"_rels/.rels": strToU8(ROOT_RELS),
		"word/document.xml": strToU8(document),
		"word/_rels/document.xml.rels": strToU8(DOCUMENT_RELS),
		"word/styles.xml": strToU8(STYLES),
	})
}
