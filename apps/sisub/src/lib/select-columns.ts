/**
 * @module select-columns
 * Uma lista de colunas serve às duas pontas: gera a string do `select` e o tipo da linha
 * (`Pick<TableRow<...>, (typeof COLUMNS)[number]>`). Com a string escrita à mão e o tipo tirado
 * da linha inteira, coluna nova na tabela alargava o tipo sem entrar no `select`, e a tela lia
 * `undefined` sem o compilador avisar.
 */

/** A string que `columns.join(", ")` produz, como literal: o cliente tipado infere a linha dela. */
export type JoinColumns<T extends readonly string[]> = T extends readonly [infer Head extends string]
	? Head
	: T extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
		? `${Head}, ${JoinColumns<Tail>}`
		: string

/** String do `select` a partir da lista `as const` de colunas, sem perder o tipo literal. */
export function selectColumns<const T extends readonly string[]>(columns: T): JoinColumns<T> {
	return columns.join(", ") as JoinColumns<T>
}
