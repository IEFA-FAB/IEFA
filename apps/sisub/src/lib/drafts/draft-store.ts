/**
 * Rascunhos de edição, guardados no armazenamento LOCAL do navegador (família
 * `sisub:draft:*`, declarada na Política de Cookies). Sobrevivem à navegação, ao F5, à
 * recarga automática depois de uma publicação e a fechar o navegador.
 *
 * O que o rascunho guarda é dado de catálogo que o usuário já pode ver (insumo, nutrientes,
 * especificação de compra, ficha técnica) — não é dado pessoal nem classificado. Mesmo
 * assim, três travas para o computador compartilhado:
 *   - **por conta**: a chave de cada rascunho leva uma assinatura curta da conta
 *     (`sisub:draft:<assinatura>:<chave>`), e cada conta só lê os próprios. Outra conta
 *     entrar no mesmo navegador NÃO apaga nada: quem volta encontra o que deixou, e quem
 *     entrou não vê nem salva em nome próprio o rascunho de outra pessoa. A assinatura
 *     (`ownerSignature`) não volta ao identificador da conta;
 *   - **validade**: rascunho sem uso há mais de 7 dias é descartado ao carregar, de
 *     qualquer conta;
 *   - **só no dispositivo**: nada daqui vai ao servidor antes de o usuário salvar.
 *
 * O mapa em memória é a fonte que as telas leem e só contém os rascunhos da conta amarrada
 * (`bindOwner`); o armazenamento é espelho, gravado com atraso curto (a cada tecla seria
 * `JSON.stringify` + escrita síncrona no thread principal) e descarregado ao esconder a
 * página. Sem armazenamento utilizável (SSR, bloqueado, cota cheia) o store segue em memória
 * e `isPersistent()` diz isso — `useDraft` volta a avisar antes de sair.
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

const STORAGE_PREFIX = "sisub:draft:"
/**
 * Assinatura da conta que entrou por último neste navegador. É o sinal entre abas: quando
 * outra conta entra numa aba, as demais param de mostrar (e de gravar) os rascunhos da conta
 * anterior até a sessão delas alcançar a nova. No formato antigo (rascunho sem conta na
 * chave) era a dona de todos, e é por ela que esses rascunhos migram para a chave da conta.
 */
const SESSION_OWNER_KEY = `${STORAGE_PREFIX}owner`
const ACCOUNT_KEY = /^([0-9a-f]{8}):(.+)$/
const draftStorageKey = (signature: string, key: string) => `${STORAGE_PREFIX}${signature}:${key}`

const entries = new Map<string, DraftEntry>()
const listeners = new Set<() => void>()
const pendingWrites = new Set<string>()
let persistTimer: ReturnType<typeof setTimeout> | null = null
let snapshot: DraftEntry[] = []
let keySnapshot = ""
/** Assinatura da conta amarrada. Sem ela, o store fica só em memória (nada lido nem gravado). */
let owner: string | null = null
/**
 * Conta que entrou em OUTRA aba. A aba recarrega para assumi-la; se o recarregamento for
 * cancelado (aviso de alteração não salva), ela fica sem conta até a sessão dela alcançar
 * esta: não mostra, não aceita nem grava rascunho — senão quem entrou salvaria em nome
 * próprio o que a conta anterior digitou.
 */
let foreignOwner: string | null = null
let hydrated = false
let writable = true

function storage(): Storage | null {
	try {
		return typeof window === "undefined" ? null : window.localStorage
	} catch {
		return null
	}
}

function readSessionOwner(): string | null {
	try {
		return storage()?.getItem(SESSION_OWNER_KEY) ?? null
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

/** Grava no armazenamento o que mudou desde a última descarga, sob a chave da conta amarrada. */
function flush() {
	if (persistTimer) clearTimeout(persistTimer)
	persistTimer = null
	const store = storage()
	if (!store) {
		writable = false
		pendingWrites.clear()
		return
	}
	// Sem conta amarrada, não há sob que chave gravar: espera o `bindOwner`.
	if (owner === null) return
	for (const key of pendingWrites) {
		const entry = entries.get(key)
		try {
			if (entry) store.setItem(draftStorageKey(owner, key), JSON.stringify(entry))
			else store.removeItem(draftStorageKey(owner, key))
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

/** Esquece a memória (não o armazenamento): troca de conta ou teste. */
function forgetMemory() {
	entries.clear()
	pendingWrites.clear()
	rebuildSnapshots()
}

/**
 * Lê o armazenamento uma vez por conta: carrega os rascunhos dela e apaga, de qualquer conta,
 * o que venceu ou não é rascunho válido. Rascunho do formato antigo (sem conta na chave) vai
 * para a chave da conta que era dona dele — a desta sessão ou outra, que o reencontra ao voltar.
 */
function hydrate() {
	if (hydrated || owner === null) return
	hydrated = true
	const store = storage()
	if (!store) return
	const now = Date.now()
	const names: string[] = []
	for (let i = 0; i < store.length; i++) {
		const name = store.key(i)
		if (name?.startsWith(STORAGE_PREFIX) && name !== SESSION_OWNER_KEY) names.push(name)
	}
	const legacyOwner = readSessionOwner()
	for (const name of names) {
		try {
			const entry: unknown = JSON.parse(store.getItem(name) ?? "null")
			if (!isLiveEntry(entry, now)) {
				store.removeItem(name)
				continue
			}
			const match = ACCOUNT_KEY.exec(name.slice(STORAGE_PREFIX.length))
			if (match) {
				// Descartado antes do bind (pendente de apagar): não volta do armazenamento.
				const discardedBeforeBind = pendingWrites.has(entry.key) && !entries.has(entry.key)
				if (match[1] === owner && !entries.has(entry.key) && !discardedBeforeBind) entries.set(entry.key, entry)
				continue
			}
			// Formato antigo: sem conta na chave. Vai para a chave da conta dona (sem passar por
			// cima de rascunho mais novo dela); sem dona conhecida, não há de quem seja, e sai.
			if (legacyOwner === owner) {
				if (!entries.has(entry.key)) {
					entries.set(entry.key, entry)
					pendingWrites.add(entry.key)
				}
			} else if (legacyOwner && /^[0-9a-f]{8}$/.test(legacyOwner)) {
				const target = draftStorageKey(legacyOwner, entry.key)
				try {
					if (store.getItem(target) == null) store.setItem(target, JSON.stringify(entry))
				} catch {
					// Sem espaço para copiar: o original fica, e a próxima carga tenta de novo.
					continue
				}
			}
			store.removeItem(name)
		} catch {
			store.removeItem(name)
		}
	}
	if (pendingWrites.size > 0) flush()
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
		if (foreignOwner) return
		hydrate()
		const changed = summaryOf(entries.get(entry.key)) !== summaryOf(entry as DraftEntry)
		entries.set(entry.key, entry as DraftEntry)
		schedule(entry.key)
		if (changed) emit()
	},
	delete(key: string) {
		if (foreignOwner) return
		hydrate()
		const existed = entries.delete(key)
		schedule(key)
		if (existed) emit()
	},
	/**
	 * Amarra o store à conta da sessão: a memória passa a mostrar só os rascunhos dela. Trocar
	 * de conta NÃO apaga os da anterior — eles ficam no armazenamento, sob a assinatura dela,
	 * até ela voltar (ou vencerem os 7 dias). Sessão sem usuário (logout, expiração) mantém a
	 * conta amarrada: quem volta encontra o que deixou.
	 *
	 * Chamar no render do cabeçalho, ANTES de ler a lista: o cabeçalho renderiza antes da
	 * tela, e os efeitos da tela (que restauram o rascunho) rodam depois do render dele.
	 */
	bindOwner(userId: string | null) {
		if (!userId) return
		const signature = ownerSignature(userId)
		if (foreignOwner) {
			// A sessão desta aba ainda é a antiga (auth em cache): espera alcançar a conta nova.
			if (signature !== foreignOwner) return
			foreignOwner = null
		}
		if (owner === signature) {
			hydrate()
			return
		}
		const previous = owner
		if (previous !== null) {
			// O que a conta anterior digitou até agora vai para a chave DELA antes da troca.
			flush()
			forgetMemory()
		}
		owner = signature
		hydrated = false
		// Rascunho criado antes de haver conta (primeiro render) ficou pendente, porque não havia
		// sob que chave gravar: é desta sessão, e o `hydrate` o descarrega sob ela — só ele, sem
		// regravar o que veio do armazenamento.
		hydrate()
		// Avisa as outras abas de que esta conta entrou (evento `storage`).
		try {
			if (readSessionOwner() !== signature) storage()?.setItem(SESSION_OWNER_KEY, signature)
		} catch {
			writable = false
		}
		// A notificação vai fora do render em curso (o cabeçalho chama isto no render).
		queueMicrotask(emit)
	},
	/** O rascunho sobrevive a recarregar? `false` sem armazenamento ou depois de uma gravação que falhou. */
	isPersistent(): boolean {
		// Sem conta amarrada nada vai ao armazenamento: o rascunho é só de memória.
		return storage() != null && writable && owner !== null
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
		const store = storage()
		try {
			const names: string[] = []
			for (let i = 0; i < (store?.length ?? 0); i++) {
				const name = store?.key(i)
				if (name?.startsWith(STORAGE_PREFIX)) names.push(name)
			}
			for (const name of names) store?.removeItem(name)
		} catch {
			// idem flush
		}
		forgetMemory()
		owner = null
		foreignOwner = null
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

	// Outra aba mudou o armazenamento. Só interessa rascunho da conta amarrada nesta aba: se
	// outra conta entrou na outra aba, as gravações dela vão para a chave dela e não aparecem
	// aqui (e o cabeçalho desta aba re-amarra quando a sessão daqui alcançar a conta nova).
	window.addEventListener("storage", (event) => {
		if (event.key === SESSION_OWNER_KEY) {
			// Outra conta entrou em outra aba. A sessão do navegador é dela agora, e esta aba tem
			// na tela (formulários montados, rascunhos) o que a conta anterior digitou. Grava isso
			// na chave da conta anterior e recarrega: a aba volta já com a conta nova, sem mostrar
			// nem deixar salvar em nome dela o trabalho de quem saiu.
			if (!event.newValue) return
			if (owner === null && foreignOwner !== null) {
				// Já esperando uma conta nova, e outra entrou: espera esta.
				foreignOwner = event.newValue
				return
			}
			if (owner !== null && event.newValue !== owner) {
				flush()
				forgetMemory()
				owner = null
				hydrated = false
				foreignOwner = event.newValue
				emit()
				window.location.reload()
			}
			return
		}
		if (owner === null || !event.key?.startsWith(STORAGE_PREFIX)) return
		const match = ACCOUNT_KEY.exec(event.key.slice(STORAGE_PREFIX.length))
		if (!match || match[1] !== owner) return
		const key = match[2] as string
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
