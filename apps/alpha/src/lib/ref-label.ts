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
 * Espécie normativa, na ordem em que precisa ser testada.
 *
 * "Lei Complementar" vem antes de "Lei" porque o prefixo de uma é prefixo da
 * outra, e "Decreto-Lei" antes de "Decreto" pelo mesmo motivo.
 */
const ESPECIES: ReadonlyArray<readonly [RegExp, string]> = [
	[/^lei complementar\b/, "lei-complementar"],
	[/^decreto[- ]lei\b/, "decreto-lei"],
	[/^lei\b/, "lei"],
	[/^decreto\b/, "decreto"],
	[/^(?:in|instrucao normativa)\b/, "in"],
	[/^(?:mp|medida provisoria)\b/, "medida-provisoria"],
	[/^portaria\b/, "portaria"],
	[/^(?:cf|constituicao)\b/, "constituicao"],
]

/** Espécie normativa canônica, ou a primeira palavra quando não reconhecida. */
function especieOf(canonical: string): string {
	for (const [pattern, kind] of ESPECIES) if (pattern.test(canonical)) return kind
	return canonical.split(/[\s,]/)[0] || "desconhecida"
}

/**
 * Espécie, número e ano de uma norma canônica.
 *
 * Casar a string inteira não funciona: a referência é "Lei nº 14.133/2021" e o
 * título ingerido é "Lei nº 14.133, de 1º de abril de 2021". Espécie, número e
 * ano são o que os dois formatos têm em comum.
 *
 * A espécie faz parte da identidade: sem ela, "Decreto nº 14.133/2021" — que
 * não existe — casaria com a Lei 14.133 e o guard de citação aprovaria uma
 * referência inexistente, que é exatamente o que o guard existe para barrar.
 */
export function parseNormaIdentity(norma: string): { kind: string; numero: string; ano: string } | null {
	const match = /(\d{1,3}(?:\.\d{3})*)\s*[/,]?.*?(\d{4})/.exec(norma)
	if (!match) return null

	return { kind: especieOf(canonicalRefLabel(norma)), numero: match[1], ano: match[2] }
}
