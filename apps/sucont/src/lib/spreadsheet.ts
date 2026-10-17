/**
 * Leitura dos arquivos de planilha enviados às ferramentas do sucont. Todas leem por aqui:
 * o formato é decidido pelos bytes, não pela extensão, e o CSV (ou o texto renomeado para
 * .xls) chega com a célula como texto digitado.
 */
import * as XLSX from "xlsx"

const UTF8_STRICT = new TextDecoder("utf-8", { fatal: true })
const UTF8_LOOSE = new TextDecoder("utf-8")
const UTF16_LE = new TextDecoder("utf-16le")
const UTF16_BE = new TextDecoder("utf-16be")
const WINDOWS_1252 = new TextDecoder("windows-1252")

/**
 * Decodifica bytes de planilha texto (CSV, TSV).
 *
 * - BOM decide: UTF-8 (EF BB BF), UTF-16 LE (FF FE, o "Texto Unicode" do Excel) e
 *   UTF-16 BE (FE FF). O `TextDecoder` já tira o BOM do texto.
 * - Sem BOM, UTF-8 estrito; qualquer byte inválido significa export do Tesouro Gerencial
 *   ou CSV salvo pelo Excel, que são windows-1252. Lido sempre como Latin-1, o UTF-8 sem
 *   BOM trocava "Conta Contábil" por "Conta ContÃ¡bil" e a coluna não era achada.
 */
export function decodeSpreadsheet(bytes: ArrayBuffer | Uint8Array): string {
	const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
	if (view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) return UTF8_LOOSE.decode(view)
	if (view[0] === 0xff && view[1] === 0xfe) return UTF16_LE.decode(view)
	if (view[0] === 0xfe && view[1] === 0xff) return UTF16_BE.decode(view)
	try {
		return UTF8_STRICT.decode(view)
	} catch {
		return WINDOWS_1252.decode(view)
	}
}

/** Assinaturas dos formatos binários: zip (xlsx, xlsm, xlsb, ods) e CFB (xls). */
function isBinarySpreadsheet(view: Uint8Array): boolean {
	const isZip = view[0] === 0x50 && view[1] === 0x4b && view[2] === 0x03 && view[3] === 0x04
	const isCfb = view[0] === 0xd0 && view[1] === 0xcf && view[2] === 0x11 && view[3] === 0xe0
	return isZip || isCfb
}

/**
 * Workbook do arquivo enviado (o `ArrayBuffer` do `FileReader`), binário ou texto.
 *
 * Texto é decodificado por `decodeSpreadsheet` e lido com `raw: true`: sem ele, o SheetJS
 * adivinha número no CSV em inglês e "1.234,56" vira 1,23456. A célula chega como texto
 * digitado, na convenção brasileira de `parseBrazilianAmount`. Lança sem conteúdo.
 */
export function readWorkbook(data: unknown, options: XLSX.ParsingOptions = {}): XLSX.WorkBook {
	if (!(data instanceof ArrayBuffer || data instanceof Uint8Array)) throw new Error("Não foi possível ler o arquivo.")
	const view = data instanceof Uint8Array ? data : new Uint8Array(data)
	if (view.length === 0) throw new Error("O arquivo está vazio.")
	if (isBinarySpreadsheet(view)) return XLSX.read(view, { ...options, type: "array" })
	return XLSX.read(decodeSpreadsheet(view), { ...options, type: "string", raw: true })
}
