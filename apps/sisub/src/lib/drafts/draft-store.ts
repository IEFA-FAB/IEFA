/**
 * Rascunhos de edição em MEMÓRIA do módulo: sobrevivem à navegação dentro do SPA (sair
 * da tela, trocar de aba, fechar o card) e morrem no F5 ou ao fechar a aba.
 *
 * Por que não `sessionStorage`/`localStorage`: chave de armazenamento nova exige linha no
 * inventário da Política de Cookies, e versão nova da política pede ciência de novo a
 * todo usuário de todo app (`packages/legal-kit/src/cookie-inventory.test.ts`; foi o
 * caso do #425). A perda no F5 é coberta pelo aviso de `beforeunload` de `useDraft`.
 * Trocar o backend é mudar só este arquivo — e declarar a família `sisub:draft:*` na
 * política ANTES.
 */

export interface DraftEntry<T = unknown> {
	key: string
	values: T
	/** Carimbo do registro quando o rascunho começou (ex.: `updated_at`); detecta edição concorrente. */
	baseStamp: string | null
	/** Rótulo e endereço da tela, para o indicador global de rascunhos. */
	title: string
	href: string | null
	changeCount: number
	savedAt: number
}

const entries = new Map<string, DraftEntry>()
const listeners = new Set<() => void>()
let snapshot: DraftEntry[] = []

function emit() {
	snapshot = [...entries.values()].sort((a, b) => b.savedAt - a.savedAt)
	for (const listener of listeners) listener()
}

export const draftStore = {
	get<T>(key: string): DraftEntry<T> | undefined {
		return entries.get(key) as DraftEntry<T> | undefined
	},
	set<T>(entry: DraftEntry<T>) {
		entries.set(entry.key, entry)
		emit()
	},
	delete(key: string) {
		if (entries.delete(key)) emit()
	},
	/** Snapshot estável para `useSyncExternalStore` (mesma referência até a próxima mudança). */
	list(): DraftEntry[] {
		return snapshot
	},
	subscribe(listener: () => void) {
		listeners.add(listener)
		return () => {
			listeners.delete(listener)
		}
	},
	/** Só para testes. */
	clear() {
		entries.clear()
		emit()
	},
}
