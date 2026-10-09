/**
 * Lixeira aberta ou fechada, por catálogo global (semanal, evento, apoio).
 *
 * Começa fechada: o catálogo é o que se usa no dia a dia, e a lista de removidos o empurrava para
 * baixo. Pelo mesmo motivo de `catalog-open-folders`, o aberto vive em memória enquanto a aba
 * estiver aberta: no estado do componente, fechava de novo a cada ida ao editor e volta.
 */

type Listener = () => void

const openCatalogs = new Set<string>()
const listeners = new Set<Listener>()

export function subscribeTrashOpen(listener: Listener): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export function isTrashOpen(catalog: string): boolean {
	return openCatalogs.has(catalog)
}

/** Valor do servidor (SSR): fechada. */
export function isTrashOpenOnServer(): boolean {
	return false
}

/** Abre ou fecha. Também abre depois de remover: o diálogo promete o item na lixeira. */
export function setTrashOpen(catalog: string, open: boolean) {
	if (openCatalogs.has(catalog) === open) return
	if (open) openCatalogs.add(catalog)
	else openCatalogs.delete(catalog)
	for (const listener of listeners) listener()
}
