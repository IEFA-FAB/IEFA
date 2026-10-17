/**
 * Os jeitos em que um CSV chega ao sucont: UTF-8 sem BOM (editor de texto, export de
 * sistema), UTF-8 com BOM ("CSV UTF-8" do Excel), windows-1252 ("CSV" do Excel em pt-BR,
 * export do Tesouro Gerencial) e UTF-16 com BOM ("Texto Unicode" do Excel).
 */

/** windows-1252 para texto no intervalo Latin-1 (acentos do português): um byte por caractere. */
export function encodeWindows1252(text: string): Uint8Array {
	return Uint8Array.from(text, (char) => {
		const code = char.charCodeAt(0)
		if (code > 0xff) throw new Error(`fora do Latin-1: ${char}`)
		return code
	})
}

/** UTF-16 com BOM, na ordem de bytes pedida (o "Texto Unicode" do Excel é LE). */
function encodeUtf16(text: string, littleEndian: boolean): Uint8Array {
	const bytes = new Uint8Array(2 + text.length * 2)
	const view = new DataView(bytes.buffer)
	view.setUint16(0, 0xfeff, littleEndian)
	for (let i = 0; i < text.length; i++) view.setUint16(2 + i * 2, text.charCodeAt(i), littleEndian)
	return bytes
}

export const CSV_ENCODINGS: Array<[label: string, encode: (text: string) => Uint8Array]> = [
	["UTF-8 sem BOM", (text) => new TextEncoder().encode(text)],
	["UTF-8 com BOM", (text) => new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)])],
	["windows-1252", encodeWindows1252],
	["UTF-16 LE com BOM", (text) => encodeUtf16(text, true)],
	["UTF-16 BE com BOM", (text) => encodeUtf16(text, false)],
]
