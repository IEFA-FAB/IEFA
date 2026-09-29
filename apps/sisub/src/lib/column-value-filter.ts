/**
 * Filtro de coluna por lista de valores: `undefined` = todos marcados (sem filtro), array =
 * só os valores marcados.
 *
 * Marca ou desmarca os valores `listed` e preserva o resto. Com a busca do popover, `listed`
 * são os valores que ela mostra; sem busca, são todos. `all` é o universo da coluna antes dos
 * filtros (não os valores facetados, que os filtros das outras colunas já recortaram). Voltar
 * a ter todo o universo marcado devolve `undefined`, para a coluna deixar de estar filtrada;
 * valor marcado que saiu do universo não conta para isso.
 */
export function setListedValues(
	current: readonly string[] | undefined,
	all: readonly string[],
	listed: readonly string[],
	checked: boolean
): string[] | undefined {
	const base = current ?? all
	const listedSet = new Set(listed)
	const next = checked ? [...new Set([...base, ...listed])] : base.filter((value) => !listedSet.has(value))
	const nextSet = new Set(next)
	return all.every((value) => nextSet.has(value)) ? undefined : next
}
