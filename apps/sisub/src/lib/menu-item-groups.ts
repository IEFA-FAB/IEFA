import { FALLBACK_MENU_GROUPS } from "@iefa/sisub-domain/schemas"

/**
 * Grupos de uma refeição.
 *
 * Eram cinco, fixos, iguais para café, almoço, jantar e ceia — e foi assim que
 * os pães do café foram parar em "acompanhamento" e os salgados da ceia em
 * "prato principal". Hoje cada refeição aponta para um CONJUNTO
 * (`kitchen.menu_group_set`) e as funções daqui recebem a lista de grupos DAQUELA
 * refeição; a ordem do array é a ordem de leitura no cardápio.
 *
 * Quem não tem o conjunto em mãos (impressão de dado antigo, visão do comensal)
 * cai em {@link DEFAULT_MENU_GROUPS} — o conjunto padrão, que é o do almoço.
 */
export type MenuGroup = { key: string; label: string }

/** Chave do grupo gravada em `item_group`. Vale dentro do conjunto da refeição. */
export type MenuItemGroup = string

/** Conjunto padrão (`principal`), espelho do seed — usado quando não há conjunto resolvido. */
export const DEFAULT_MENU_GROUPS: readonly MenuGroup[] = FALLBACK_MENU_GROUPS

/** Chave sintética para itens SEM grupo — renderizados depois de todos os grupos. */
export const UNGROUPED_KEY = "__ungrouped__"
export const UNGROUPED_LABEL = "Sem grupo"

export function isMenuItemGroup(value: string | null | undefined, groups: readonly MenuGroup[] = DEFAULT_MENU_GROUPS): value is MenuItemGroup {
	return value != null && groups.some((g) => g.key === value)
}

/** Índice de ordenação do grupo dentro do conjunto (fora dele, e sem grupo, vão para o fim). */
export function menuItemGroupOrder(group: string | null | undefined, groups: readonly MenuGroup[] = DEFAULT_MENU_GROUPS): number {
	const idx = group == null ? -1 : groups.findIndex((g) => g.key === group)
	return idx === -1 ? groups.length : idx
}

/**
 * Rótulo de uma chave de grupo. Chave fora do conjunto devolve a própria chave
 * legível — é preferível ler "proteina" a ler "Sem grupo" num item que TEM grupo,
 * só não o deste conjunto.
 */
export function menuItemGroupLabel(group: string | null | undefined, groups: readonly MenuGroup[] = DEFAULT_MENU_GROUPS): string {
	if (group == null) return UNGROUPED_LABEL
	const found = groups.find((g) => g.key === group)
	if (found) return found.label
	const words = group.replace(/_/g, " ")
	return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Agrupa itens (que carreguem item_group + sort_order) na ordem de leitura do
 * conjunto e, dentro de cada grupo, por sort_order.
 *
 * Chave que o conjunto não conhece ganha coluna PRÓPRIA, no fim, com o rótulo
 * derivado da chave — é o item que ficou para trás quando o conjunto da refeição
 * mudou. Jogá-lo em "Sem grupo" diria que ninguém o classificou, quando alguém
 * classificou e o conjunto é que mudou debaixo dele. Item sem grupo nenhum vai
 * por último, em UNGROUPED_KEY.
 */
export function groupMenuItems<T extends { item_group?: string | null; sort_order?: number | null }>(
	items: T[],
	groups: readonly MenuGroup[] = DEFAULT_MENU_GROUPS
): { key: string; label: string; items: T[] }[] {
	const buckets = new Map<string, T[]>()
	for (const item of items) {
		const key = item.item_group ?? UNGROUPED_KEY
		const bucket = buckets.get(key) ?? []
		bucket.push(item)
		buckets.set(key, bucket)
	}
	const sortItems = (a: T, b: T) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
	const out: { key: string; label: string; items: T[] }[] = []
	for (const group of groups) {
		const bucket = buckets.get(group.key)
		if (bucket?.length) out.push({ key: group.key, label: group.label, items: [...bucket].sort(sortItems) })
	}
	for (const [key, bucket] of buckets) {
		if (key === UNGROUPED_KEY || isMenuItemGroup(key, groups)) continue
		out.push({ key, label: menuItemGroupLabel(key, groups), items: [...bucket].sort(sortItems) })
	}
	const ungrouped = buckets.get(UNGROUPED_KEY)
	if (ungrouped?.length) out.push({ key: UNGROUPED_KEY, label: UNGROUPED_LABEL, items: [...ungrouped].sort(sortItems) })
	return out
}

/** Chave técnica derivada do rótulo — é ela que fica gravada em `item_group`. */
export function menuGroupKeyFromLabel(label: string): string {
	const base = label
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
	// O banco exige começar por letra e ter ao menos 2 caracteres.
	const safe = /^[a-z]/.test(base) ? base : `g_${base}`
	return safe.length >= 2 ? safe.slice(0, 40) : `${safe}_1`
}
