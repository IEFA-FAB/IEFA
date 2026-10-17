/**
 * Leitura dos arquivos de planilha enviados às ferramentas do sucont, compartilhada pelo
 * cruzamento, pela compatibilidade, pelo saldo alongado e pelo DGC.
 */
import * as XLSX from "xlsx"

const UTF8_STRICT = new TextDecoder("utf-8", { fatal: true })
const UTF8_LOOSE = new TextDecoder("utf-8")
const WINDOWS_1252 = new TextDecoder("windows-1252")

/**
 * Decodifica bytes de planilha texto (CSV). UTF-8 estrito primeiro; qualquer byte
 * inválido significa export do Tesouro Gerencial ou CSV salvo pelo Excel, que são
 * windows-1252. Sem isto o SheetJS lia o UTF-8 sem BOM como Latin-1, "Conta Contábil"
 * virava "Conta ContÃ¡bil" e a coluna não era achada.
 */
export function decodeSpreadsheet(bytes: ArrayBuffer | Uint8Array): string {
	const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
	// BOM UTF-8: decisão já tomada pelo arquivo.
	if (view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) return UTF8_LOOSE.decode(view).replace(/^﻿/, "")
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
 * Workbook do arquivo enviado, binário ou texto.
 *
 * Texto (CSV) é decodificado por `decodeSpreadsheet` e lido com `raw: true`: sem ele, o
 * SheetJS adivinha número no CSV em inglês e "1.234,56" vira 1,23456. A célula chega como
 * texto digitado, na convenção brasileira de `parseBrazilianAmount`.
 */
export function readWorkbook(data: ArrayBuffer | Uint8Array): XLSX.WorkBook {
	const view = data instanceof Uint8Array ? data : new Uint8Array(data)
	if (isBinarySpreadsheet(view)) return XLSX.read(view, { type: "array" })
	return XLSX.read(decodeSpreadsheet(view), { type: "string", raw: true })
}
