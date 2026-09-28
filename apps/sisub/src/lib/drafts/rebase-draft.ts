import { isDraftValueEqual } from "./draft-diff"

/**
 * Leva um rascunho aberto sobre uma versão que outra pessoa já superou para a versão
 * vigente, sem gravar por cima do que ela mudou.
 *
 * Merge de três vias por campo: `opened` é a versão que o usuário abriu, `edited` o rascunho
 * dele, `head` a versão vigente. Só o que o USUÁRIO mudou (edited ≠ opened) sai do rascunho;
 * o resto vem da vigente. Assim a alteração de quem gravou no meio-tempo continua lá, e a
 * lista de pendências da tela mostra exatamente o que o Salvar ainda vai mudar.
 *
 * Campo de lista com chave (`lists`) é mesclado por item: o que o usuário incluiu entra no
 * fim, o que ele tirou sai, o que ele alterou substitui o item da vigente. Sem isso, mexer em
 * um insumo levaria a lista inteira do rascunho e desfaria o insumo que a outra pessoa trocou.
 *
 * `overlapping` lista os campos (e itens, como `campo:chave`) que os dois lados mudaram para
 * valores diferentes: vale o do usuário, e a tela avisa para ele conferir.
 */
export interface RebaseResult<T> {
	values: T
	carried: string[]
	overlapping: string[]
}

type KeyOf<Row> = (row: Row) => string

export function rebaseDraftValues<T extends Record<string, unknown>>(
	opened: T,
	edited: T,
	head: T,
	lists: Partial<Record<keyof T & string, KeyOf<never>>> = {}
): RebaseResult<T> {
	const values: Record<string, unknown> = { ...head }
	const carried: string[] = []
	const overlapping: string[] = []

	for (const field of Object.keys(head) as (keyof T & string)[]) {
		const keyOf = lists[field] as KeyOf<unknown> | undefined
		if (keyOf && Array.isArray(opened[field]) && Array.isArray(edited[field]) && Array.isArray(head[field])) {
			const merged = rebaseList(opened[field] as unknown[], edited[field] as unknown[], head[field] as unknown[], keyOf)
			if (merged.changed) {
				values[field] = merged.rows
				carried.push(field)
				overlapping.push(...merged.overlapping.map((key) => `${field}:${key}`))
			}
			continue
		}
		if (isDraftValueEqual(edited[field], opened[field])) continue
		values[field] = edited[field]
		carried.push(field)
		if (!isDraftValueEqual(head[field], opened[field]) && !isDraftValueEqual(head[field], edited[field])) overlapping.push(field)
	}

	return { values: values as T, carried, overlapping }
}

function rebaseList(opened: unknown[], edited: unknown[], head: unknown[], keyOf: KeyOf<unknown>) {
	const openedByKey = new Map(opened.map((row) => [keyOf(row), row]))
	const editedByKey = new Map(edited.map((row) => [keyOf(row), row]))
	const headKeys = new Set(head.map(keyOf))
	const overlapping: string[] = []
	let changed = false

	const rows: unknown[] = []
	for (const row of head) {
		const key = keyOf(row)
		const before = openedByKey.get(key)
		const mine = editedByKey.get(key)
		if (before !== undefined && mine === undefined) {
			// O usuário tirou o item.
			changed = true
			if (!isDraftValueEqual(row, before)) overlapping.push(key)
			continue
		}
		if (before !== undefined && mine !== undefined && !isDraftValueEqual(mine, before)) {
			// O usuário alterou o item: vale o dele.
			changed = true
			if (!isDraftValueEqual(row, before) && !isDraftValueEqual(row, mine)) overlapping.push(key)
			rows.push(mine)
			continue
		}
		rows.push(row)
	}
	for (const row of edited) {
		const key = keyOf(row)
		if (headKeys.has(key)) continue
		const before = openedByKey.get(key)
		if (before === undefined) {
			// O usuário incluiu o item.
			changed = true
			rows.push(row)
		} else if (!isDraftValueEqual(row, before)) {
			// O usuário alterou um item que a vigente tirou: volta, e a tela avisa.
			changed = true
			overlapping.push(key)
			rows.push(row)
		}
	}
	return { rows, changed, overlapping }
}
