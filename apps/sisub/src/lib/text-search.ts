/**
 * Utilitários de busca textual com sensibilidade opcional a maiúsculas e acentos.
 *
 * Usado pela busca das listas (insumos, preparações) e pelos diálogos de
 * localizar e substituir. Default em todos os usos: insensível a maiúsculas
 * E a acentos (busca mais permissiva).
 */

export interface SearchSensitivity {
	/** `true` = diferencia maiúsculas/minúsculas. Default de uso: `false`. */
	caseSensitive: boolean
	/** `true` = diferencia acentos/diacríticos. Default de uso: `false`. */
	accentSensitive: boolean
}

/** Remove acentos/diacríticos (NFD + descarta as marcas combinantes). */
export function stripAccents(value: string): string {
	return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/** Normaliza um texto para comparação `includes` conforme a sensibilidade escolhida. */
export function normalizeForSearch(value: string, { caseSensitive, accentSensitive }: SearchSensitivity): string {
	let out = value
	if (!accentSensitive) out = stripAccents(out)
	if (!caseSensitive) out = out.toLowerCase()
	return out
}

/** Grupos de variantes por letra-base (minúsculas). Cobre o português + latim comum. */
const ACCENT_GROUPS: Record<string, string> = {
	a: "aàáâãäå",
	c: "cç",
	e: "eèéêë",
	i: "iìíîï",
	n: "nñ",
	o: "oòóôõö",
	u: "uùúûü",
	y: "yýÿ",
}

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g

function escapeRegex(value: string): string {
	return value.replace(REGEX_SPECIAL, "\\$&")
}

/** Constrói a classe de caractere accent-insensitive para um único caractere. */
function accentInsensitiveChar(char: string, caseSensitive: boolean): string {
	const base = stripAccents(char).toLowerCase()
	const group = ACCENT_GROUPS[base]
	if (!group) return escapeRegex(char)

	if (!caseSensitive) {
		// Flag `i` cobre o casamento de caso; incluir ambos garante variantes acentuadas maiúsculas.
		return `[${group}${group.toUpperCase()}]`
	}
	// Sensível a maiúsculas: manter apenas as variantes do mesmo caso do caractere digitado.
	const isUpper = char === char.toUpperCase() && char !== char.toLowerCase()
	return `[${isUpper ? group.toUpperCase() : group}]`
}

/**
 * Constrói uma `RegExp` global para busca literal (não-regex) de `find`,
 * com sensibilidade opcional a maiúsculas/acentos e opção de palavra inteira.
 *
 * Accent-insensitive: cada letra-base é expandida para uma classe com suas
 * variantes acentuadas — o regex roda sobre o texto original, preservando as
 * posições corretas para `String.prototype.replace`.
 *
 * @returns `null` quando `find` é vazio ou o padrão resultante é inválido.
 */
export function buildSearchRegex(find: string, { caseSensitive, accentSensitive }: SearchSensitivity, wholeWord = false): RegExp | null {
	if (!find) return null
	const body = accentSensitive
		? escapeRegex(find)
		: Array.from(find)
				.map((char) => accentInsensitiveChar(char, caseSensitive))
				.join("")
	const pattern = wholeWord ? `\\b${body}\\b` : body
	try {
		return new RegExp(pattern, caseSensitive ? "g" : "gi")
	} catch {
		return null
	}
}
