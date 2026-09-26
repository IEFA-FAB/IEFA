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
 *
 * Os rascunhos pertencem a um usuário: `bindOwner` descarta tudo quando a sessão troca de
 * dono (o logout não recarrega a página, e o próximo a entrar num terminal compartilhado
 * veria — e poderia salvar em nome próprio — o rascunho de quem saiu).
 */

export interface DraftEntry<T = unknown> {
	key: string
	values: T
	/** Assinatura do registro salvo quando o rascunho começou; muda se ele for alterado por baixo. */
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
let keySnapshot = ""
let owner: string | null | undefined

/** O que os inscritos exibem: chave, título, endereço e contagem. Os valores não entram. */
function summaryOf(entry: DraftEntry | undefined): string {
	return entry ? `${entry.key}|${entry.title}|${entry.href}|${entry.changeCount}` : ""
}

function emit() {
	snapshot = [...entries.values()].sort((a, b) => b.savedAt - a.savedAt)
	keySnapshot = [...entries.keys()].sort().join("\n")
	for (const listener of listeners) listener()
}

export const draftStore = {
	get<T>(key: string): DraftEntry<T> | undefined {
		return entries.get(key) as DraftEntry<T> | undefined
	},
	/**
	 * Grava o rascunho. Só notifica quando o resumo muda: gravar a cada tecla notificando
	 * re-renderizava o indicador global e as listas inteiras (com o editor aberto dentro).
	 */
	set<T>(entry: DraftEntry<T>) {
		const changed = summaryOf(entries.get(entry.key)) !== summaryOf(entry as DraftEntry)
		entries.set(entry.key, entry)
		if (changed) emit()
	},
	delete(key: string) {
		if (entries.delete(key)) emit()
	},
	/** Descarta os rascunhos quando o usuário da sessão muda (logout, troca de conta). */
	bindOwner(userId: string | null) {
		if (owner !== undefined && owner !== userId && entries.size > 0) {
			entries.clear()
			emit()
		}
		owner = userId
	},
	/** Snapshot estável para `useSyncExternalStore` (mesma referência até a próxima mudança). */
	list(): DraftEntry[] {
		return snapshot
	},
	/** Chaves abertas, uma por linha — string estável enquanto o conjunto não muda. */
	keys(): string {
		return keySnapshot
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
		owner = undefined
		emit()
	},
}
