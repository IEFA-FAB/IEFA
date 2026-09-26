/**
 * Rascunhos de edição, guardados no armazenamento LOCAL do navegador (família
 * `sisub:draft:*`, declarada na Política de Cookies 1.5.0). Sobrevivem à navegação, ao F5,
 * à recarga automática depois de uma publicação e a fechar o navegador.
 *
 * O que o rascunho guarda é dado de catálogo que o usuário já pode ver (insumo, nutrientes,
 * especificação de compra, ficha técnica) — não é dado pessoal nem classificado. Mesmo
 * assim, três travas para o computador compartilhado:
 *   - **dono**: outra conta entrando no navegador — nesta aba ou em outra — descarta tudo.
 *     Guarda só uma assinatura curta da conta (`ownerSignature`), nunca o identificador.
 *     Sair da conta NÃO descarta: quem volta encontra o que deixou;
 *   - **validade**: rascunho sem uso há mais de 7 dias é descartado ao carregar;
 *   - **só no dispositivo**: nada daqui vai ao servidor antes de o usuário salvar.
 *
 * O mapa em memória é a fonte que as telas leem; o armazenamento é espelho, gravado com
 * atraso curto (a cada tecla seria `JSON.stringify` + escrita síncrona no thread principal)
 * e descarregado ao esconder a página. Sem armazenamento utilizável (SSR, bloqueado, cota
 * cheia) o store segue em memória e `isPersistent()` diz isso — `useDraft` volta a avisar
 * antes de sair.
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
/** Atraso da gravação no armazenamento depois da última mudança. */
const PERSIST_DELAY_MS = 400

const DRAFT_OWNER_KEY = "sisub:draft:owner"
const draftStorageKey = (key: string) => `sisub:draft:${key}`
const STORAGE_PREFIX = draftStorageKey("")

const entries = new Map<string, DraftEntry>()
const listeners = new Set<() => void>()
const pendingWrites = new Set<string>()
let persistTimer: ReturnType<typeof setTimeout> | null = null
let snapshot: DraftEntry[] = []
let keySnapshot = ""
let owner: string | null = null
let hydrated = false
let writable = true

function storage(): Storage | null {
	try {
		return typeof window === "undefined" ? null : window.localStorage
	} catch {
		return null
	}
}

function readOwner(): string | null {
	try {
		return storage()?.getItem(DRAFT_OWNER_KEY) ?? null
	} catch {
		return null
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

/** Rascunho lido do armazenamento (ou de outra aba) só entra se tiver a forma certa e estiver no prazo. */
function isLiveEntry(value: unknown, now: number): value is DraftEntry {
	if (!value || typeof value !== "object") return false
	const entry = value as Partial<DraftEntry>
	return (
		typeof entry.key === "string" &&
		typeof entry.title === "string" &&
		typeof entry.changeCount === "number" &&
		typeof entry.savedAt === "number" &&
		Number.isFinite(entry.savedAt) &&
		now - entry.savedAt <= DRAFT_TTL_MS &&
		!!entry.values &&
		typeof entry.values === "object"
	)
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

/** Grava no armazenamento o que mudou desde a última descarga. */
function flush() {
	if (persistTimer) clearTimeout(persistTimer)
	persistTimer = null
	const store = storage()
	if (!store) {
		writable = false
		pendingWrites.clear()
		return
	}
	// Outra aba entrou com outra conta: o que está em memória aqui é da conta anterior e
	// não pode ser gravado sob a assinatura da nova.
	if (readOwner() !== owner) {
		pendingWrites.clear()
		return
	}
	for (const key of pendingWrites) {
		const entry = entries.get(key)
		try {
			if (entry) store.setItem(draftStorageKey(key), JSON.stringify(entry))
			else store.removeItem(draftStorageKey(key))
			writable = true
		} catch {
			// Cota cheia ou armazenamento bloqueado: segue em memória, e `isPersistent()` avisa.
			writable = false
		}
	}
	pendingWrites.clear()
}

function schedule(key: string) {
	pendingWrites.add(key)
	if (persistTimer) clearTimeout(persistTimer)
	persistTimer = setTimeout(flush, PERSIST_DELAY_MS)
}

/** Descarta tudo: memória, gravações pendentes e armazenamento. */
function discardAll() {
	const store = storage()
	for (const key of entries.keys()) {
		try {
			store?.removeItem(draftStorageKey(key))
		} catch {
			// idem flush
		}
	}
	entries.clear()
	pendingWrites.clear()
	rebuildSnapshots()
}

/** Lê o armazenamento uma vez, descartando o que venceu ou não é rascunho válido. */
function hydrate() {
	if (hydrated) return
	hydrated = true
	const store = storage()
	if (!store) return
	const now = Date.now()
	const names: string[] = []
	for (let i = 0; i < store.length; i++) {
		const name = store.key(i)
		if (name?.startsWith(STORAGE_PREFIX) && name !== DRAFT_OWNER_KEY) names.push(name)
	}
	for (const name of names) {
		try {
			const entry: unknown = JSON.parse(store.getItem(name) ?? "null")
			if (isLiveEntry(entry, now)) entries.set(entry.key, entry)
			else store.removeItem(name)
		} catch {
			store.removeItem(name)
		}
	}
	rebuildSnapshots()
}

export const draftStore = {
	get<T>(key: string): DraftEntry<T> | undefined {
		hydrate()
		return entries.get(key) as DraftEntry<T> | undefined
	},
	/**
	 * Grava o rascunho. Só notifica quando o resumo muda: notificar a cada tecla
	 * re-renderizava o indicador global e as listas inteiras (com o editor aberto dentro).
	 */
	set<T>(entry: DraftEntry<T>) {
		hydrate()
		const changed = summaryOf(entries.get(entry.key)) !== summaryOf(entry as DraftEntry)
		entries.set(entry.key, entry as DraftEntry)
		schedule(entry.key)
		if (changed) emit()
	},
	delete(key: string) {
		hydrate()
		const existed = entries.delete(key)
		schedule(key)
		if (existed) emit()
	},
	/**
	 * Amarra os rascunhos à conta da sessão; OUTRA conta descarta todos. Sessão sem usuário
	 * (logout, expiração) não descarta nada: a política promete o rascunho até outra conta
	 * entrar, e quem volta encontra o que deixou.
	 *
	 * Chamar no render do cabeçalho, ANTES de ler a lista: o cabeçalho renderiza antes da
	 * tela, e os efeitos da tela (que restauram o rascunho) rodam depois do render dele.
	 */
	bindOwner(userId: string | null) {
		if (!userId) return
		hydrate()
		const signature = ownerSignature(userId)
		if (owner === signature) return
		const known = owner ?? readOwner()
		owner = signature
		if (known !== signature && entries.size > 0) {
			// Snapshot já refeito aqui (quem lê logo depois não vê os títulos da conta
			// anterior); a notificação vai fora do render em curso.
			discardAll()
			queueMicrotask(emit)
		}
		try {
			storage()?.setItem(DRAFT_OWNER_KEY, signature)
		} catch {
			writable = false
		}
	},
	/** O rascunho sobrevive a recarregar? `false` sem armazenamento ou depois de uma gravação que falhou. */
	isPersistent(): boolean {
		return storage() != null && writable
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
	/** Descarrega as gravações pendentes agora. */
	flush,
	/** Só para testes: esquece tudo, inclusive o que está no armazenamento. */
	clear() {
		discardAll()
		try {
			storage()?.removeItem(DRAFT_OWNER_KEY)
		} catch {
			// idem flush
		}
		owner = null
		hydrated = false
		writable = true
		emit()
	},
}

if (typeof window !== "undefined") {
	// A página vai sumir (fechar, trocar de aba no celular): grava o que falta.
	window.addEventListener("pagehide", flush)
	window.addEventListener("visibilitychange", () => {
		if (typeof document !== "undefined" && document.visibilityState === "hidden") flush()
	})

	// Outra aba mudou o armazenamento.
	window.addEventListener("storage", (event) => {
		if (event.key === DRAFT_OWNER_KEY) {
			// Outra conta entrou em outra aba: a sessão do navegador é dela agora, e o que
			// esta aba tem em memória é da conta anterior.
			if (event.newValue && event.newValue !== owner) {
				// Sem dono até o cabeçalho desta aba se amarrar à conta nova (`bindOwner`): até
				// lá nada desta aba vai para o armazenamento.
				owner = null
				entries.clear()
				pendingWrites.clear()
				emit()
			}
			return
		}
		if (!event.key?.startsWith(STORAGE_PREFIX)) return
		const key = event.key.slice(STORAGE_PREFIX.length)
		const before = summaryOf(entries.get(key))
		if (event.newValue == null) entries.delete(key)
		else {
			let parsed: unknown
			try {
				parsed = JSON.parse(event.newValue)
			} catch {
				return
			}
			if (!isLiveEntry(parsed, Date.now())) return
			entries.set(key, parsed)
		}
		// Tecla na outra aba só muda valores: notificar re-renderizaria esta a cada tecla.
		if (summaryOf(entries.get(key)) !== before) emit()
	})
}
