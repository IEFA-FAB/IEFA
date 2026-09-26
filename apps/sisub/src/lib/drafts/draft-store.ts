/**
 * Rascunhos de edição, guardados no armazenamento LOCAL do navegador (família
 * `sisub:draft:*`, declarada na Política de Cookies 1.5.0). Sobrevivem à navegação, ao F5,
 * à recarga automática depois de uma publicação e a fechar o navegador.
 *
 * O que o rascunho guarda é dado de catálogo que o usuário já pode ver (insumo, nutrientes,
 * especificação de compra, ficha técnica) — não é dado pessoal nem classificado. Mesmo
 * assim, três travas para o computador compartilhado:
 *   - **dono**: `bindOwner` descarta tudo quando outra conta entra no navegador. Guarda só
 *     uma assinatura curta da conta (`ownerSignature`), nunca o identificador;
 *   - **validade**: rascunho sem uso há mais de 7 dias é descartado ao carregar;
 *   - **só no dispositivo**: nada daqui vai ao servidor antes de o usuário salvar.
 *
 * O mapa em memória é o que os componentes leem; o armazenamento é espelho gravado a cada
 * mudança. Sem `localStorage` (SSR, modo privado cheio) o store segue só em memória.
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

/** Rascunho parado há mais que isto é descartado ao carregar. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

const DRAFT_OWNER_KEY = "sisub:draft:owner"
const draftStorageKey = (key: string) => `sisub:draft:${key}`
const STORAGE_PREFIX = draftStorageKey("")

const entries = new Map<string, DraftEntry>()
const listeners = new Set<() => void>()
let snapshot: DraftEntry[] = []
let keySnapshot = ""
let owner: string | null | undefined
let hydrated = false

function storage(): Storage | null {
	try {
		return typeof window === "undefined" ? null : window.localStorage
	} catch {
		return null
	}
}

function persist(entry: DraftEntry) {
	try {
		storage()?.setItem(draftStorageKey(entry.key), JSON.stringify(entry))
	} catch {
		// Cota cheia ou armazenamento bloqueado: o rascunho segue em memória nesta aba.
	}
}

function unpersist(key: string) {
	try {
		storage()?.removeItem(draftStorageKey(key))
	} catch {
		// idem persist
	}
}

/**
 * Assinatura curta da conta (FNV-1a de 32 bits, em hex). Basta para saber se a conta que
 * entrou é a mesma dona dos rascunhos, e não identifica ninguém: não se volta dela ao id.
 */
export function ownerSignature(userId: string): string {
	let hash = 0x811c9dc5
	for (let i = 0; i < userId.length; i++) {
		hash ^= userId.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(16).padStart(8, "0")
}

/** Lê o armazenamento uma vez, descartando o que venceu ou não é rascunho válido. */
function hydrate() {
	if (hydrated) return
	hydrated = true
	const store = storage()
	if (!store) return
	const now = Date.now()
	const keys: string[] = []
	for (let i = 0; i < store.length; i++) {
		const name = store.key(i)
		if (name?.startsWith(STORAGE_PREFIX) && name !== DRAFT_OWNER_KEY) keys.push(name)
	}
	for (const name of keys) {
		try {
			const entry = JSON.parse(store.getItem(name) ?? "null") as DraftEntry | null
			if (!entry || typeof entry.key !== "string" || now - entry.savedAt > DRAFT_TTL_MS) {
				store.removeItem(name)
				continue
			}
			entries.set(entry.key, entry)
		} catch {
			store.removeItem(name)
		}
	}
	rebuildSnapshots()
}

function rebuildSnapshots() {
	snapshot = [...entries.values()].sort((a, b) => b.savedAt - a.savedAt)
	keySnapshot = [...entries.keys()].sort().join("\n")
}

function emit() {
	rebuildSnapshots()
	for (const listener of listeners) listener()
}

/** O que os inscritos exibem: chave, título, endereço e contagem. Os valores não entram. */
function summaryOf(entry: DraftEntry | undefined): string {
	return entry ? `${entry.key}|${entry.title}|${entry.href}|${entry.changeCount}` : ""
}

function clearAll() {
	for (const key of entries.keys()) unpersist(key)
	entries.clear()
}

export const draftStore = {
	get<T>(key: string): DraftEntry<T> | undefined {
		hydrate()
		return entries.get(key) as DraftEntry<T> | undefined
	},
	/**
	 * Grava o rascunho. Só notifica quando o resumo muda: gravar a cada tecla notificando
	 * re-renderizava o indicador global e as listas inteiras (com o editor aberto dentro).
	 */
	set<T>(entry: DraftEntry<T>) {
		hydrate()
		const changed = summaryOf(entries.get(entry.key)) !== summaryOf(entry as DraftEntry)
		entries.set(entry.key, entry)
		persist(entry as DraftEntry)
		if (changed) emit()
	},
	delete(key: string) {
		hydrate()
		unpersist(key)
		if (entries.delete(key)) emit()
	},
	/**
	 * Amarra os rascunhos à conta da sessão; outra conta descarta todos. Chamado no render do
	 * cabeçalho do app — antes dos efeitos das telas, que restauram o rascunho — para que a
	 * tela de quem acabou de entrar nunca restaure o rascunho de quem saiu.
	 */
	bindOwner(userId: string | null) {
		hydrate()
		const signature = userId ? ownerSignature(userId) : null
		if (owner === signature) return
		const store = storage()
		let stored: string | null = null
		try {
			stored = store?.getItem(DRAFT_OWNER_KEY) ?? null
		} catch {
			stored = null
		}
		// Dono conhecido: o desta página, ou — logo depois do F5 — o que ficou gravado.
		const known = owner !== undefined ? owner : stored
		owner = signature
		if (known !== signature && entries.size > 0) {
			clearAll()
			// Notificar fora do render em curso: outro componente inscrito não pode ser
			// atualizado no meio do render de quem chamou.
			queueMicrotask(emit)
		}
		try {
			if (signature) store?.setItem(DRAFT_OWNER_KEY, signature)
			else store?.removeItem(DRAFT_OWNER_KEY)
		} catch {
			// idem persist
		}
	},
	/** Snapshot estável para `useSyncExternalStore` (mesma referência até a próxima mudança). */
	list(): DraftEntry[] {
		hydrate()
		return snapshot
	},
	/** Chaves abertas, uma por linha — string estável enquanto o conjunto não muda. */
	keys(): string {
		hydrate()
		return keySnapshot
	},
	subscribe(listener: () => void) {
		listeners.add(listener)
		return () => {
			listeners.delete(listener)
		}
	},
	/** Só para testes: esquece tudo, inclusive o que está no armazenamento. */
	clear() {
		clearAll()
		try {
			storage()?.removeItem(DRAFT_OWNER_KEY)
		} catch {
			// idem persist
		}
		owner = undefined
		hydrated = false
		emit()
	},
	/** Só para testes: relê o armazenamento como numa página recém-carregada. */
	reloadFromStorage() {
		entries.clear()
		owner = undefined
		hydrated = false
		hydrate()
	},
}

// Outra aba gravou ou apagou um rascunho: o indicador desta aba acompanha. O conteúdo
// restaurado numa tela já aberta não muda — a restauração acontece só ao abrir a tela.
if (typeof window !== "undefined") {
	window.addEventListener("storage", (event) => {
		if (!event.key?.startsWith(STORAGE_PREFIX) || event.key === DRAFT_OWNER_KEY) return
		const key = event.key.slice(STORAGE_PREFIX.length)
		if (event.newValue == null) entries.delete(key)
		else {
			try {
				entries.set(key, JSON.parse(event.newValue) as DraftEntry)
			} catch {
				return
			}
		}
		emit()
	})
}
