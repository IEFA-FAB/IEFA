import { describe, expect, test } from "bun:test"
import { strToU8, zipSync } from "fflate"
import { MAX_DOCX_COMMENTS_XML_BYTES, MAX_DOCX_DOCUMENT_XML_BYTES, MAX_DOCX_PARAGRAPHS, MAX_DOCX_XML_BYTES, parseDocx } from "./docx.ts"

function docx(documentXml: string, commentsXml?: string): Uint8Array {
	return zipSync({
		"word/document.xml": strToU8(documentXml),
		...(commentsXml ? { "word/comments.xml": strToU8(commentsXml) } : {}),
	})
}

/**
 * Reescreve o tamanho descompactado DECLARADO no diretório central — o campo que o fflate
 * usa para alocar. Sem `entry`, reescreve todas as entradas.
 */
function declareUncompressedSize(zip: Uint8Array, size: number, entry?: string): Uint8Array {
	const patched = zip.slice()
	const view = new DataView(patched.buffer)
	for (let offset = 0; offset + 46 <= patched.length; offset++) {
		if (view.getUint32(offset, true) !== 0x02014b50) continue
		const nameLength = view.getUint16(offset + 28, true)
		const name = new TextDecoder().decode(patched.subarray(offset + 46, offset + 46 + nameLength))
		if (entry === undefined || name === entry) view.setUint32(offset + 24, size, true)
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

	test("o teto é por entrada: comments.xml não herda a folga do document.xml", () => {
		const zip = docx("<w:document><w:body><w:p/></w:body></w:document>", "<w:comments/>")
		expect(() => parseDocx(declareUncompressedSize(zip, MAX_DOCX_COMMENTS_XML_BYTES + 1, "word/comments.xml"))).toThrow(/limite/)
		expect(() => parseDocx(declareUncompressedSize(zip, MAX_DOCX_DOCUMENT_XML_BYTES + 1, "word/document.xml"))).toThrow(/limite/)
		// Entrada que não é lida não é descompactada — o tamanho declarado dela não importa.
		const withImage = zipSync({ "word/document.xml": strToU8("<w:document><w:body><w:p/></w:body></w:document>"), "word/media/image1.png": new Uint8Array(16) })
		expect(parseDocx(declareUncompressedSize(withImage, 0xffffffff, "word/media/image1.png")).paragraphs).toHaveLength(1)
	})

	test("XML de parágrafos minúsculos dentro do teto para no limite de parágrafos, sem varrer tudo", () => {
		// ~8 MiB de parágrafos de uma letra: comprime a poucos KB e antes prendia o event
		// loop por segundos entre leitura e montagem das seções.
		const paragraph = "<w:p><w:r><w:t>a</w:t></w:r></w:p>"
		const xml = `<w:document><w:body>${paragraph.repeat(Math.floor((MAX_DOCX_DOCUMENT_XML_BYTES - 64) / paragraph.length))}</w:body></w:document>`
		const zip = zipSync({ "word/document.xml": strToU8(xml) }, { level: 9 })
		expect(zip.length).toBeLessThan(64 * 1024)
		const startedAt = performance.now()
		expect(() => parseDocx(zip)).toThrow(/parágrafos acima do limite/)
		expect(performance.now() - startedAt).toBeLessThan(2_000)
	})

	test("documento no limite de parágrafos ainda é lido", () => {
		const xml = `<w:document><w:body>${"<w:p><w:r><w:t>a</w:t></w:r></w:p>".repeat(MAX_DOCX_PARAGRAPHS)}</w:body></w:document>`
		expect(parseDocx(docx(xml)).paragraphs).toHaveLength(MAX_DOCX_PARAGRAPHS)
		expect(() => parseDocx(docx(xml.replace("</w:body>", "<w:p/></w:body>")))).toThrow(/parágrafos acima do limite/)
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
