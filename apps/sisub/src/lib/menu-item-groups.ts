/**
 * Grupos canônicos de uma preparação dentro de uma refeição. A ordem do array É a
 * ordem de leitura no cardápio (prato principal → … → sobremesa) — usada por editor,
 * impressão e visão do comensal. Espelha o CHECK da migration e o MenuItemGroupSchema
 * do domain (@iefa/sisub-domain). Mantenha os três em sincronia.
 */
export const MENU_ITEM_GROUPS = ["prato_principal", "acompanhamento", "guarnicao", "bebida", "sobremesa"] as const

export type MenuItemGroup = (typeof MENU_ITEM_GROUPS)[number]

export const MENU_ITEM_GROUP_LABELS: Record<MenuItemGroup, string> = {
	prato_principal: "Prato principal",
	acompanhamento: "Acompanhamento",
	guarnicao: "Guarnição",
	bebida: "Bebida",
	sobremesa: "Sobremesa",
}

/** Chave sintética para itens sem grupo atribuído (legado) — renderizados após os grupos. */
export const UNGROUPED_KEY = "__ungrouped__"
export const UNGROUPED_LABEL = "Sem grupo"

export function isMenuItemGroup(value: string | null | undefined): value is MenuItemGroup {
	return value != null && (MENU_ITEM_GROUPS as readonly string[]).includes(value)
}

/** Índice de ordenação do grupo (itens sem grupo vão para o fim). */
export function menuItemGroupOrder(group: string | null | undefined): number {
	const idx = isMenuItemGroup(group) ? MENU_ITEM_GROUPS.indexOf(group) : -1
	return idx === -1 ? MENU_ITEM_GROUPS.length : idx
}

/**
 * Agrupa itens (que carreguem item_group + sort_order) na ordem canônica de grupos e,
 * dentro de cada grupo, por sort_order. Itens sem grupo caem em UNGROUPED_KEY no fim.
 */
export function groupMenuItems<T extends { item_group?: string | null; sort_order?: number | null }>(
	items: T[]
): { key: MenuItemGroup | typeof UNGROUPED_KEY; label: string; items: T[] }[] {
	const buckets = new Map<string, T[]>()
	for (const item of items) {
		const key = isMenuItemGroup(item.item_group) ? item.item_group : UNGROUPED_KEY
		const bucket = buckets.get(key) ?? []
		bucket.push(item)
		buckets.set(key, bucket)
	}
	const sortItems = (a: T, b: T) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
	const groups: { key: MenuItemGroup | typeof UNGROUPED_KEY; label: string; items: T[] }[] = []
	for (const key of MENU_ITEM_GROUPS) {
		const bucket = buckets.get(key)
		if (bucket?.length) groups.push({ key, label: MENU_ITEM_GROUP_LABELS[key], items: [...bucket].sort(sortItems) })
	}
	const ungrouped = buckets.get(UNGROUPED_KEY)
	if (ungrouped?.length) groups.push({ key: UNGROUPED_KEY, label: UNGROUPED_LABEL, items: [...ungrouped].sort(sortItems) })
	return groups
}
