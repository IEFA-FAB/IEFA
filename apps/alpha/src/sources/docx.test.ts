import { describe, expect, test } from "bun:test"
import { strToU8, zipSync } from "fflate"
import { MAX_DOCX_XML_BYTES, parseDocx } from "./docx.ts"

function docx(documentXml: string, commentsXml?: string): Uint8Array {
	return zipSync({
		"word/document.xml": strToU8(documentXml),
		...(commentsXml ? { "word/comments.xml": strToU8(commentsXml) } : {}),
	})
}

/** Reescreve o tamanho descompactado DECLARADO no diretório central — o campo que o fflate usa para alocar. */
function declareUncompressedSize(zip: Uint8Array, size: number): Uint8Array {
	const patched = zip.slice()
	const view = new DataView(patched.buffer)
	for (let offset = 0; offset + 4 <= patched.length; offset++) {
		if (view.getUint32(offset, true) === 0x02014b50) view.setUint32(offset + 24, size, true)
	}
	return patched
}

describe("parseDocx — leitura", () => {
	test("estilo, texto, comentários ancorados e parágrafo vazio", () => {
		const document = [
			"<w:document><w:body>",
			'<w:p w:rsidR="1"><w:pPr><w:pStyle w:val="Nivel01"/></w:pPr><w:commentRangeStart w:id="7"/>',
			'<w:r><w:t>Objeto &amp; </w:t></w:r><w:r><w:tab/><w:t xml:space="preserve">escopo</w:t></w:r></w:p>',
			"<w:p/>",
			"<w:p><w:r><w:t>&#65;&#99999999;</w:t></w:r></w:p>",
			"</w:body></w:document>",
		].join("")
		const comments = '<w:comments><w:comment w:id="7" w:author="AGU"><w:p><w:r><w:t>Nota explicativa</w:t></w:r></w:p></w:comment></w:comments>'

		const parsed = parseDocx(docx(document, comments))

		expect(parsed.paragraphs).toEqual([
			{ style: "Nivel01", text: "Objeto & escopo", commentIds: ["7"] },
			{ style: null, text: "", commentIds: [] },
			// Referência numérica fora do Unicode fica literal — antes derrubava a leitura com RangeError.
			{ style: null, text: "A&#99999999;", commentIds: [] },
		])
		expect(parsed.comments.get("7")).toEqual({ id: "7", author: "AGU", text: "Nota explicativa" })
	})
})

describe("parseDocx — entrada hostil", () => {
	test("recusa zip que declara conteúdo descompactado acima do teto, antes de alocar", () => {
		const bomb = declareUncompressedSize(docx("<w:document><w:body><w:p><w:r><w:t>x</w:t></w:r></w:p></w:body></w:document>"), MAX_DOCX_XML_BYTES + 1)
		expect(() => parseDocx(bomb)).toThrow(/limite/)
	})

	test("parágrafos sem fechamento não custam tempo quadrático", () => {
		// Com `<w:p>[\s\S]*?</w:p>`, cada abertura sem fechamento varria o resto do arquivo:
		// 200 mil aberturas num XML de ~1 MB eram ~10¹¹ passos.
		const xml = `<w:document><w:body>${"<w:p><w:t>x".repeat(200_000)}</w:body></w:document>`
		const startedAt = performance.now()
		const parsed = parseDocx(docx(xml))
		expect(performance.now() - startedAt).toBeLessThan(5_000)
		expect(parsed.paragraphs).toEqual([])
	})
})
