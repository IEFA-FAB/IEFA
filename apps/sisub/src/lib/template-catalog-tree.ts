/**
 * Árvore do catálogo global de eventos e cardápios de apoio: pastas da SDAB (dois níveis) e os
 * modelos dentro delas → lista plana de linhas para a tela. Pura, para ter teste (mesmo motivo de
 * `lib/recipe-tree`).
 *
 * A ordem das pastas é a gravada (`sort_order`), não a alfabética: Café da Manhã, Brunch, Almoço,
 * Coquetel, Jantar. Modelos dentro da pasta vão por nome. Modelo sem pasta, ou com pasta que não
 * veio na lista (removida), cai em "Sem pasta", no fim — nunca some.
 */

/** Nó sintético dos modelos sem pasta. Não existe no banco. */
export const UNFILED_CATALOG_FOLDER_ID = "__sem-pasta__"
export const UNFILED_CATALOG_FOLDER_LABEL = "Sem pasta"

export interface CatalogFolder {
	id: string
	parent_id: string | null
	name: string
	description: string | null
	sort_order: number
}

export interface CatalogTemplate {
	id: string
	name: string | null
	folder_id: string | null
}

export type CatalogTreeRow<T extends CatalogTemplate> =
	| {
			type: "folder"
			id: string
			folder: CatalogFolder | null
			label: string
			level: 0 | 1
			/** "Padrão B › Coquetel" */
			path: string
			hasChildren: boolean
			isExpanded: boolean
			/** Modelos nesta pasta e nas subpastas dela. */
			templateCount: number
			isUnfiled: boolean
			isFirst: boolean
			isLast: boolean
	  }
	| { type: "template"; id: string; template: T; level: 1 | 2; path: string | null }

function byOrder(a: CatalogFolder, b: CatalogFolder): number {
	return a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR")
}

function byName(a: CatalogTemplate, b: CatalogTemplate): number {
	return (a.name ?? "").localeCompare(b.name ?? "", "pt-BR")
}

/** Caminho legível de uma pasta ("Padrão B › Coquetel"); `null` sem pasta ou pasta desconhecida. */
export function catalogFolderPath(folders: readonly CatalogFolder[] | null | undefined, folderId: string | null | undefined): string | null {
	if (!folderId || !folders) return null
	const byId = new Map(folders.map((f) => [f.id, f]))
	const folder = byId.get(folderId)
	if (!folder) return null
	const parent = folder.parent_id ? byId.get(folder.parent_id) : undefined
	return parent ? `${parent.name} › ${folder.name}` : folder.name
}

/**
 * Monta as linhas visíveis. `expanded` = ids abertos; `null` = tudo aberto (só para listar destinos,
 * como em `catalogFolderOptions` — a árvore da tela abre fechada, ver `catalog-open-folders`).
 * Subpasta de pai que não veio na lista sobe para a raiz.
 */
export function buildCatalogTree<T extends CatalogTemplate>(input: {
	folders: readonly CatalogFolder[] | null | undefined
	templates: readonly T[]
	expanded: ReadonlySet<string> | null
}): CatalogTreeRow<T>[] {
	const folders = input.folders ?? []
	const folderIds = new Set(folders.map((f) => f.id))
	const isOpen = (id: string) => input.expanded == null || input.expanded.has(id)

	const roots = folders.filter((f) => f.parent_id == null || !folderIds.has(f.parent_id)).toSorted(byOrder)
	const childrenOf = (id: string) => folders.filter((f) => f.parent_id === id && f.id !== id).toSorted(byOrder)
	const templatesIn = (id: string) => input.templates.filter((t) => t.folder_id === id).toSorted(byName)
	const unfiled = input.templates.filter((t) => t.folder_id == null || !folderIds.has(t.folder_id)).toSorted(byName)

	const rows: CatalogTreeRow<T>[] = []
	roots.forEach((root, rootIndex) => {
		const children = childrenOf(root.id)
		const own = templatesIn(root.id)
		const count = own.length + children.reduce((sum, c) => sum + templatesIn(c.id).length, 0)
		const rootOpen = isOpen(root.id)
		rows.push({
			type: "folder",
			id: root.id,
			folder: root,
			label: root.name,
			level: 0,
			path: root.name,
			hasChildren: children.length > 0 || own.length > 0,
			isExpanded: rootOpen,
			templateCount: count,
			isUnfiled: false,
			isFirst: rootIndex === 0,
			isLast: rootIndex === roots.length - 1,
		})
		if (!rootOpen) return
		children.forEach((child, childIndex) => {
			const inside = templatesIn(child.id)
			const path = `${root.name} › ${child.name}`
			const childOpen = isOpen(child.id)
			rows.push({
				type: "folder",
				id: child.id,
				folder: child,
				label: child.name,
				level: 1,
				path,
				hasChildren: inside.length > 0,
				isExpanded: childOpen,
				templateCount: inside.length,
				isUnfiled: false,
				isFirst: childIndex === 0,
				isLast: childIndex === children.length - 1,
			})
			if (childOpen) for (const t of inside) rows.push({ type: "template", id: t.id, template: t, level: 2, path })
		})
		for (const t of own) rows.push({ type: "template", id: t.id, template: t, level: 1, path: root.name })
	})

	if (unfiled.length > 0) {
		const open = isOpen(UNFILED_CATALOG_FOLDER_ID)
		rows.push({
			type: "folder",
			id: UNFILED_CATALOG_FOLDER_ID,
			folder: null,
			label: UNFILED_CATALOG_FOLDER_LABEL,
			level: 0,
			path: UNFILED_CATALOG_FOLDER_LABEL,
			hasChildren: true,
			isExpanded: open,
			templateCount: unfiled.length,
			isUnfiled: true,
			isFirst: false,
			isLast: false,
		})
		if (open) for (const t of unfiled) rows.push({ type: "template", id: t.id, template: t, level: 1, path: null })
	}
	return rows
}

/** Opções de destino de "Mover para…": toda pasta, com o caminho, na ordem da árvore. */
export function catalogFolderOptions(folders: readonly CatalogFolder[] | null | undefined): { value: string; label: string }[] {
	const rows = buildCatalogTree({ folders, templates: [], expanded: null })
	return rows.flatMap((row) => (row.type === "folder" && !row.isUnfiled ? [{ value: row.id, label: row.path }] : []))
}
