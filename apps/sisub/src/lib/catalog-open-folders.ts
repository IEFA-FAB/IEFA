/**
 * Pastas abertas da árvore do catálogo de eventos e de apoios, por tipo de catálogo.
 *
 * As pastas da SDAB abrem fechadas (pedido da SDAB); "Sem pasta" não é pasta dela — é o resto, no
 * fim — e abre aberto: sem isso, um catálogo ainda sem pastas (ou cujas pastas não carregaram)
 * pareceria vazio. Guardar o aberto só no estado do componente
 * fechava tudo de novo a cada ida ao editor e volta; aqui ele vive em memória enquanto a aba
 * estiver aberta — sem armazenamento local, que exigiria entrada nova na Política de Cookies.
 */

import { UNFILED_CATALOG_FOLDER_ID } from "@/lib/template-catalog-tree"

type Listener = () => void

/** Aberto antes de o usuário mexer. Referência estável: é o snapshot do `useSyncExternalStore`. */
const INITIAL: ReadonlySet<string> = new Set([UNFILED_CATALOG_FOLDER_ID])
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
	return openByCatalog.get(catalog) ?? INITIAL
}

/** Valor do servidor (SSR): o inicial. */
export function getServerOpenFolders(): ReadonlySet<string> {
	return INITIAL
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
