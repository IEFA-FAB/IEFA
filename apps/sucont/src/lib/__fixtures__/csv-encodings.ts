/**
 * Os três jeitos em que um CSV chega ao sucont: UTF-8 sem BOM (editor de texto, export de
 * sistema), UTF-8 com BOM ("CSV UTF-8" do Excel) e windows-1252 ("CSV" do Excel em pt-BR,
 * export do Tesouro Gerencial).
 */

/** windows-1252 para texto no intervalo Latin-1 (acentos do português): um byte por caractere. */
function encodeWindows1252(text: string): Uint8Array {
	return Uint8Array.from(text, (char) => {
		const code = char.charCodeAt(0)
		if (code > 0xff) throw new Error(`fora do Latin-1: ${char}`)
		return code
	})
}

export const CSV_ENCODINGS: Array<[label: string, encode: (text: string) => Uint8Array]> = [
	["UTF-8 sem BOM", (text) => new TextEncoder().encode(text)],
	["UTF-8 com BOM", (text) => new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)])],
	["windows-1252", encodeWindows1252],
]
