export interface SearchableSelectOption {
	value: string
	label: string
	/** Segunda linha do item: o contexto que desempata homônimos. */
	hint?: string
	/** Entra na busca sem aparecer no item — sigla, código, sinônimo. */
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
 * ordem. Casar a consulta inteira como substring responderia "nenhum resultado"
 * para o item que o usuário está olhando sempre que ele pula uma palavra do
 * meio do rótulo.
 */
export function matches(haystack: string, terms: readonly string[]): boolean {
	if (terms.length === 0) return true
	const target = normalize(haystack)
	return terms.every((term) => target.includes(term))
}

/**
 * Teto de itens renderizados por vez, aplicado pelo `limit` do primitivo.
 *
 * O ganho do combobox é a busca, não a rolagem: sem o corte, uma lista de 4.557
 * insumos montaria 4.557 nós no popup e travaria a abertura do mesmo jeito que o
 * `Select` que este componente substitui.
 */
export const MAX_VISIBLE = 50

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
	// Só fixa o que a lista realmente contém. Fixar um `selected` solto criaria
	// uma linha fantasma e somaria 1 ao total que o rodapé "Mostrando N de M"
	// imprime — o componente hoje deriva `selected` de `options.find(...)`, mas
	// a função não pode depender disso para não mentir.
	const pinned = found.find((option) => option.value === selected.value)
	if (pinned == null) return found
	return [pinned, ...found.filter((option) => option.value !== selected.value)]
}
