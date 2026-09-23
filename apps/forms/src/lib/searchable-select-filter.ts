export interface SearchableSelectOption {
	value: string
	label: string
	/** Segunda linha do item: o contexto que desempata homônimos. */
	hint?: string
	/** Entra na busca sem aparecer no item — código, sinônimo, caminho da pasta. */
	keywords?: string
}

/** Sentinela da opção "nenhuma": string vazia nunca colide com um id real. */
export const NONE_VALUE = ""

function normalize(value: string) {
	return value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
}

/** Quebra a consulta nos termos que o filtro exige, já sem acento nem caixa. */
export function toSearchTerms(query: string): string[] {
	return normalize(query).split(/\s+/).filter(Boolean)
}

/**
 * Cada palavra da busca tem de aparecer em algum lugar do item, em qualquer
 * ordem — mesma regra do `FolderCombobox`, pelo mesmo motivo: casar a consulta
 * inteira como substring responderia "nenhum resultado" para o item que o
 * usuário está olhando sempre que ele pula um nível do nome.
 */
export function matches(haystack: string, terms: readonly string[]): boolean {
	if (terms.length === 0) return true
	const target = normalize(haystack)
	return terms.every((term) => target.includes(term))
}

/**
 * A lista que o combobox recebe: filtrada pela busca e, com a busca vazia, com
 * o item escolhido à frente.
 *
 * O item escolhido à frente não é enfeite. Quem corta a lista renderizada é o
 * `limit` do primitivo, que pega os N PRIMEIROS de `items` — sem isto, uma
 * seleção além do corte simplesmente não está na janela, e reabrir uma lista de
 * milhares mostrava o começo do catálogo sem check em lugar nenhum, como se
 * nada estivesse escolhido.
 *
 * Só com a busca vazia: enquanto se digita, a ordem é do que foi digitado.
 */
export function buildHits({
	options,
	query,
	clearOption,
	selected,
}: {
	options: readonly SearchableSelectOption[]
	query: string
	clearOption: SearchableSelectOption | null
	selected: SearchableSelectOption | null
}): SearchableSelectOption[] {
	const terms = toSearchTerms(query)
	const pool = clearOption ? [clearOption, ...options] : options
	const found = pool.filter((option) => matches(`${option.label} ${option.hint ?? ""} ${option.keywords ?? ""}`, terms))
	if (terms.length > 0 || selected == null) return found
	return [selected, ...found.filter((option) => option.value !== selected.value)]
}
