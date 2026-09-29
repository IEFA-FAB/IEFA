/**
 * Filtro de coluna por lista de valores: `undefined` = todos marcados (sem filtro), array =
 * só os valores marcados.
 *
 * Marca ou desmarca os valores `listed` e preserva o resto. Com a busca do popover, `listed`
 * são os valores que ela mostra; sem busca, são todos. Voltar a ter tudo marcado devolve
 * `undefined`, para a coluna deixar de aparecer como filtrada.
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
	return next.length >= all.length ? undefined : next
}
