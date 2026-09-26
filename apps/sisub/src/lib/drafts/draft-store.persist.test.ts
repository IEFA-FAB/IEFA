import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/** `localStorage` mínimo em memória — o vitest do sisub roda em `node`, sem DOM. */
function fakeStorage() {
	const data = new Map<string, string>()
	return {
		data,
		get length() {
			return data.size
		},
		key: (i: number) => [...data.keys()][i] ?? null,
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v),
		removeItem: (k: string) => void data.delete(k),
		clear: () => data.clear(),
	}
}

type Listener = (event: { key: string | null; newValue: string | null }) => void
let storage: ReturnType<typeof fakeStorage>
let listeners: Map<string, Listener[]>

/** Carrega o módulo do zero, como uma página recém-aberta (ou recarregada). */
async function loadStore() {
	vi.resetModules()
	return (await import("./draft-store")).draftStore
}

/** Outra aba escreveu no armazenamento: o navegador avisa as demais pelo evento `storage`. */
function otherTabWrote(key: string, newValue: string | null) {
	for (const listener of listeners.get("storage") ?? []) listener({ key, newValue })
}

const entry = (key: string, savedAt = Date.now()) => ({ key, values: { price: 28.5 }, baseStamp: null, title: key, href: null, changeCount: 1, savedAt })

beforeEach(() => {
	storage = fakeStorage()
	listeners = new Map()
	vi.stubGlobal("window", {
		localStorage: storage,
		addEventListener: (type: string, fn: Listener) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
	})
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("draftStore — persistência local", () => {
	it("o rascunho sobrevive a recarregar a página", async () => {
		const store = await loadStore()
		store.bindOwner("user-1")
		store.set(entry("sisub:ingredient:1"))
		store.flush()
		expect(storage.data.has("sisub:draft:sisub:ingredient:1")).toBe(true)

		const reloaded = await loadStore()
		reloaded.bindOwner("user-1")
		expect(reloaded.get("sisub:ingredient:1")?.values).toEqual({ price: 28.5 })
	})

	it("grava com atraso, não a cada tecla", async () => {
		const store = await loadStore()
		store.bindOwner("user-1")
		store.set(entry("k"))
		expect(storage.data.has("sisub:draft:k")).toBe(false)
		store.flush()
		expect(storage.data.has("sisub:draft:k")).toBe(true)
	})

	it("descartar apaga também do armazenamento", async () => {
		const store = await loadStore()
		store.bindOwner("user-1")
		store.set(entry("k"))
		store.flush()
		store.delete("k")
		store.flush()
		expect(storage.data.has("sisub:draft:k")).toBe(false)
	})

	it("rascunho parado há mais de 7 dias, ou sem data, é descartado ao carregar", async () => {
		const store = await loadStore()
		store.bindOwner("user-1")
		store.set(entry("velho", Date.now() - 8 * 24 * 60 * 60 * 1000))
		store.set(entry("novo"))
		store.flush()
		storage.setItem("sisub:draft:sem-data", JSON.stringify({ ...entry("sem-data"), savedAt: "ontem" }))

		const reloaded = await loadStore()
		reloaded.bindOwner("user-1")
		expect(reloaded.get("velho")).toBeUndefined()
		expect(reloaded.get("sem-data")).toBeUndefined()
		expect(reloaded.get("novo")).toBeDefined()
		expect(storage.data.has("sisub:draft:velho")).toBe(false)
	})

	it("outra conta no mesmo navegador descarta os rascunhos de quem saiu, mesmo depois do F5", async () => {
		const store = await loadStore()
		store.bindOwner("user-1")
		store.set(entry("k"))
		store.flush()

		const reloaded = await loadStore()
		reloaded.bindOwner("user-2")
		expect(reloaded.get("k")).toBeUndefined()
		expect(reloaded.list()).toEqual([])
		expect(storage.data.has("sisub:draft:k")).toBe(false)
	})

	it("sair da conta não descarta: quem volta encontra o rascunho", async () => {
		const store = await loadStore()
		store.bindOwner("user-1")
		store.set(entry("k"))
		store.flush()
		store.bindOwner(null) // logout / sessão expirada

		const reloaded = await loadStore()
		reloaded.bindOwner("user-1")
		expect(reloaded.get("k")).toBeDefined()
	})

	it("outra conta entrando em OUTRA aba impede esta de gravar o rascunho da conta anterior", async () => {
		const store = await loadStore()
		store.bindOwner("user-1")
		store.set(entry("k"))
		store.flush()

		// aba 2: user-2 entrou, limpou e gravou a assinatura dele
		storage.data.delete("sisub:draft:k")
		storage.setItem("sisub:draft:owner", "outra-assinatura")
		otherTabWrote("sisub:draft:owner", "outra-assinatura")

		// aba 1 ainda digitando: nada vai para o armazenamento, e a memória foi esvaziada
		expect(store.get("k")).toBeUndefined()
		store.set(entry("k2"))
		store.flush()
		expect(storage.data.has("sisub:draft:k2")).toBe(false)

		// o cabeçalho da aba 1 re-renderiza com a sessão antiga em cache: não pode re-amarrar
		// à conta anterior nem regravar o dono dela
		store.bindOwner("user-1")
		expect(storage.data.get("sisub:draft:owner")).toBe("outra-assinatura")
		store.set(entry("k3"))
		store.flush()
		expect(storage.data.has("sisub:draft:k3")).toBe(false)
	})

	it("depois que a sessão da aba alcança a conta nova, ela carrega os rascunhos dessa conta", async () => {
		const store = await loadStore()
		store.bindOwner("user-1")
		const { ownerSignature } = await import("./draft-store")
		const signature2 = ownerSignature("user-2")
		storage.setItem("sisub:draft:owner", signature2)
		storage.setItem("sisub:draft:dela", JSON.stringify(entry("dela")))
		otherTabWrote("sisub:draft:owner", signature2)

		store.bindOwner("user-2")
		expect(store.get("dela")).toBeDefined()
		store.set(entry("nova"))
		store.flush()
		expect(storage.data.has("sisub:draft:nova")).toBe(true)
	})

	it("entrada inválida vinda de outra aba é ignorada", async () => {
		const store = await loadStore()
		store.bindOwner("user-1")
		otherTabWrote("sisub:draft:x", JSON.stringify({ key: "x" }))
		expect(store.get("x")).toBeUndefined()
	})

	it("guarda só uma assinatura curta da conta, nunca o identificador", async () => {
		const store = await loadStore()
		const userId = "7f3c1d2e-9a8b-4c5d-b6e7-f8091a2b3c4d"
		store.bindOwner(userId)
		const saved = storage.data.get("sisub:draft:owner")
		expect(saved).toMatch(/^[0-9a-f]{8}$/)
		expect(saved).not.toContain(userId.slice(0, 8))
	})

	it("armazenamento corrompido não derruba a carga", async () => {
		storage.setItem("sisub:draft:quebrado", "{não é json")
		const store = await loadStore()
		expect(store.list()).toEqual([])
		expect(storage.data.has("sisub:draft:quebrado")).toBe(false)
	})

	it("sem armazenamento, o store segue em memória e diz que não persiste", async () => {
		vi.stubGlobal("window", { addEventListener: () => {} })
		const store = await loadStore()
		store.set(entry("k"))
		store.flush()
		expect(store.get("k")).toBeDefined()
		expect(store.isPersistent()).toBe(false)
	})
})
