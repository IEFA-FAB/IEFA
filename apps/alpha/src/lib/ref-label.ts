/**
 * Forma canônica de rótulo de dispositivo e identidade de norma.
 *
 * Fica separado de `resolve-legal-ref.ts` porque é lógica pura — o resolvedor
 * fala com o banco, isto aqui só normaliza texto, e é o que os testes cobrem.
 */

import { stripDiacritics } from "./text.ts"

/** Forma comparável do rótulo: sem acento, sem aspas, espaços colapsados. */
export function canonicalRefLabel(label: string): string {
	return stripDiacritics(label)
		.toLowerCase()
		.replace(/["'\u201c\u201d]/g, "")
		.replace(/\s+/g, " ")
		.replace(/\s*,\s*/g, ", ")
		.trim()
}

/**
 * Número e ano de uma norma canônica.
 *
 * Casar a string inteira não funciona: a referência é "Lei nº 14.133/2021" e o
 * título ingerido é "Lei nº 14.133, de 1º de abril de 2021". Número e ano são
 * o que os dois formatos têm em comum.
 */
export function parseNormaIdentity(norma: string): { numero: string; ano: string } | null {
	const match = /(\d{1,3}(?:\.\d{3})*)\s*[/,]?.*?(\d{4})/.exec(norma)
	if (!match) return null
	return { numero: match[1], ano: match[2] }
}
