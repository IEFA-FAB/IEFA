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

/** Chave do item na lista. Sem chave (linha ainda sem insumo escolhido) conta como item novo do usuário. */
type KeyOf<Row> = (row: Row) => string | null | undefined

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

function rebaseList(opened: unknown[], edited: unknown[], head: unknown[], rawKeyOf: KeyOf<unknown>) {
	// Chave de cada linha, por lista. O mesmo insumo pode entrar duas vezes na ficha (pré-preparo
	// e preparo): a 2ª ocorrência vira `chave#2`, na ordem da lista. Linha sem chave (insumo ainda
	// não escolhido) ganha uma só dela: duas linhas em branco não podem virar a mesma.
	let blankCount = 0
	const keysOf = (list: unknown[]): string[] => {
		const seen = new Map<string, number>()
		return list.map((row) => {
			const raw = rawKeyOf(row)
			if (raw == null || raw === "") return `sem-chave-${blankCount++}`
			const occurrence = (seen.get(raw) ?? 0) + 1
			seen.set(raw, occurrence)
			return occurrence === 1 ? raw : `${raw}#${occurrence}`
		})
	}
	const openedKeys = keysOf(opened)
	const editedKeys = keysOf(edited)
	const headKeyList = keysOf(head)
	const openedByKey = new Map(opened.map((row, index) => [openedKeys[index] as string, row]))
	const editedByKey = new Map(edited.map((row, index) => [editedKeys[index] as string, row]))
	const headKeys = new Set(headKeyList)
	const overlapping: string[] = []
	let changed = false

	// Itens da vigente, com o que o usuário tirou ou alterou aplicado por cima.
	const merged = new Map<string, unknown>()
	head.forEach((row, index) => {
		const key = headKeyList[index] as string
		const before = openedByKey.get(key)
		const mine = editedByKey.get(key)
		if (mine === undefined) {
			if (before === undefined) {
				merged.set(key, row) // incluído pela outra pessoa
				return
			}
			// O usuário tirou o item.
			changed = true
			if (!isDraftValueEqual(row, before)) overlapping.push(key)
			return
		}
		const userChanged = before === undefined || !isDraftValueEqual(mine, before)
		if (!userChanged || isDraftValueEqual(mine, row)) {
			merged.set(key, row)
			return
		}
		// O usuário alterou (ou incluiu) o item: vale o dele. Se a outra pessoa também mexeu
		// nele — ou incluiu o mesmo item com outro valor —, fica sinalizado.
		changed = true
		if (before === undefined || !isDraftValueEqual(row, before)) overlapping.push(key)
		merged.set(key, mine)
	})

	// Itens do usuário que a vigente não tem: os que ele incluiu, e os que ele alterou e a outra
	// pessoa tirou (voltam, sinalizados). Entram logo depois do item que os precede na lista
	// dele — promover um substituto troca o insumo da linha, e ele tem de ficar na mesma posição.
	const order = headKeyList.filter((key) => merged.has(key))
	edited.forEach((row, index) => {
		const key = editedKeys[index] as string
		if (headKeys.has(key)) return
		const before = openedByKey.get(key)
		if (before !== undefined && isDraftValueEqual(row, before)) return // a outra pessoa tirou; ele não mexeu
		changed = true
		if (before !== undefined) overlapping.push(key)
		merged.set(key, row)
		let anchor = -1
		for (let i = index - 1; i >= 0; i--) {
			const previous = order.indexOf(editedKeys[i] as string)
			if (previous !== -1) {
				anchor = previous
				break
			}
		}
		order.splice(anchor + 1, 0, key)
	})

	// Reordenação: se o usuário mudou a ordem relativa dos itens que já existiam, vale a ordem
	// dele; o que só a vigente tem vai para o fim.
	const commonInOpened = openedKeys.filter((key) => editedByKey.has(key))
	const commonInEdited = editedKeys.filter((key) => openedByKey.has(key))
	const reordered = commonInOpened.some((key, index) => key !== commonInEdited[index])
	let finalOrder = order
	if (reordered) {
		changed = true
		// A outra pessoa também reordenou: vale a ordem do usuário, e isso fica sinalizado.
		const openedOrder = openedKeys.filter((key) => headKeys.has(key))
		const headOrder = headKeyList.filter((key) => openedByKey.has(key))
		if (openedOrder.some((key, index) => key !== headOrder[index])) overlapping.push("ordem")
		const fromEdited = editedKeys.filter((key) => merged.has(key))
		finalOrder = [...fromEdited, ...order.filter((key) => !editedByKey.has(key))]
	}

	return { rows: finalOrder.map((key) => merged.get(key)), changed, overlapping }
}
