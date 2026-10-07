/**
 * Pastas abertas da árvore do catálogo de eventos e de apoios, por tipo de catálogo.
 *
 * A árvore abre com tudo fechado (pedido da SDAB). Guardar o aberto só no estado do componente
 * fechava tudo de novo a cada ida ao editor e volta; aqui ele vive em memória enquanto a aba
 * estiver aberta — sem armazenamento local, que exigiria entrada nova na Política de Cookies.
 */

type Listener = () => void

const EMPTY: ReadonlySet<string> = new Set()
const openByCatalog = new Map<string, ReadonlySet<string>>()
const listeners = new Set<Listener>()

function publish(catalog: string, next: ReadonlySet<string>) {
	openByCatalog.set(catalog, next)
	for (const listener of listeners) listener()
}

export function subscribeOpenFolders(listener: Listener): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export function getOpenFolders(catalog: string): ReadonlySet<string> {
	return openByCatalog.get(catalog) ?? EMPTY
}

/** Valor do servidor (SSR): tudo fechado. */
export function getServerOpenFolders(): ReadonlySet<string> {
	return EMPTY
}

export function toggleOpenFolder(catalog: string, folderId: string) {
	const next = new Set(getOpenFolders(catalog))
	if (next.has(folderId)) next.delete(folderId)
	else next.add(folderId)
	publish(catalog, next)
}

/**
 * Abre as pastas indicadas — onde algo acabou de entrar (subpasta nova, modelo movido, modelo novo
 * na pasta). Sem isso, o que entrou numa pasta fechada some da tela e parece que a ação falhou.
 */
export function revealOpenFolders(catalog: string, folderIds: readonly (string | null | undefined)[]) {
	const ids = folderIds.filter((id): id is string => id != null)
	const current = getOpenFolders(catalog)
	if (ids.every((id) => current.has(id))) return
	publish(catalog, new Set([...current, ...ids]))
}
