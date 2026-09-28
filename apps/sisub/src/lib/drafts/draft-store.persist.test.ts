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

/** Chave no armazenamento: a assinatura da conta vem antes da chave do rascunho. */
async function storageKey(userId: string, key: string) {
	const { ownerSignature } = await import("./draft-store")
	return `sisub:draft:${ownerSignature(userId)}:${key}`
}

/** Outra aba escreveu no armazenamento: o navegador avisa as demais pelo evento `storage`. */
function otherTabWrote(key: string, newValue: string | null) {
	for (const listener of listeners.get("storage") ?? []) listener({ key, newValue })
}

const entry = (key: string, savedAt = Date.now()) => ({ key, values: { price: 28.5 }, baseStamp: null, title: key, href: null, changeCount: 1, savedAt })
const EIGHT_DAYS_AGO = () => Date.now() - 8 * 24 * 60 * 60 * 1000

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
		expect(storage.data.has(await storageKey("user-1", "sisub:ingredient:1"))).toBe(true)

		const reloaded = await loadStore()
		reloaded.bindOwner("user-1")
		expect(reloaded.get("sisub:ingredient:1")?.values).toEqual({ price: 28.5 })
	})

	it("grava com atraso, não a cada tecla", async () => {
		const store = await loadStore()
		store.bindOwner("user-1")
		store.set(entry("k"))
		const key = await storageKey("user-1", "k")
		expect(storage.data.has(key)).toBe(false)
		store.flush()
		expect(storage.data.has(key)).toBe(true)
	})

	it("descartar apaga também do armazenamento", async () => {
		const store = await loadStore()
		store.bindOwner("user-1")
		store.set(entry("k"))
		store.flush()
		store.delete("k")
		store.flush()
		expect(storage.data.has(await storageKey("user-1", "k"))).toBe(false)
	})

	it("rascunho parado há mais de 7 dias, ou sem data, é descartado ao carregar — de qualquer conta", async () => {
		const store = await loadStore()
		store.bindOwner("user-1")
		store.set(entry("velho", EIGHT_DAYS_AGO()))
		store.set(entry("novo"))
		store.flush()
		storage.setItem(await storageKey("user-1", "sem-data"), JSON.stringify({ ...entry("sem-data"), savedAt: "ontem" }))
		storage.setItem(await storageKey("user-2", "velho-dela"), JSON.stringify(entry("velho-dela", EIGHT_DAYS_AGO())))

		const reloaded = await loadStore()
		reloaded.bindOwner("user-1")
		expect(reloaded.get("velho")).toBeUndefined()
		expect(reloaded.get("sem-data")).toBeUndefined()
		expect(reloaded.get("novo")).toBeDefined()
		expect(storage.data.has(await storageKey("user-1", "velho"))).toBe(false)
		expect(storage.data.has(await storageKey("user-2", "velho-dela"))).toBe(false)
	})

	it("outra conta no mesmo navegador não vê os rascunhos de quem saiu, e eles voltam com a conta dona", async () => {
		const store = await loadStore()
		store.bindOwner("user-1")
		store.set(entry("k"))
		store.flush()

		const reloaded = await loadStore()
		reloaded.bindOwner("user-2")
		expect(reloaded.get("k")).toBeUndefined()
		expect(reloaded.list()).toEqual([])
		reloaded.set(entry("dela"))
		reloaded.flush()

		const back = await loadStore()
		back.bindOwner("user-1")
		expect(back.get("k")).toBeDefined()
		expect(back.get("dela")).toBeUndefined()
	})

	it("trocar de conta na mesma aba grava o que a anterior digitou na chave dela", async () => {
		const store = await loadStore()
		store.bindOwner("user-1")
		store.set(entry("k"))
		store.bindOwner("user-2")
		expect(store.get("k")).toBeUndefined()
		expect(storage.data.has(await storageKey("user-1", "k"))).toBe(true)
		store.bindOwner("user-1")
		expect(store.get("k")).toBeDefined()
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

	it("gravação de OUTRA conta em outra aba não aparece nesta; a da mesma conta aparece", async () => {
		const store = await loadStore()
		store.bindOwner("user-1")
		const theirs = await storageKey("user-2", "dela")
		storage.setItem(theirs, JSON.stringify(entry("dela")))
		otherTabWrote(theirs, JSON.stringify(entry("dela")))
		expect(store.get("dela")).toBeUndefined()

		const mine = await storageKey("user-1", "minha")
		otherTabWrote(mine, JSON.stringify(entry("minha")))
		expect(store.get("minha")).toBeDefined()
	})

	it("rascunho do formato antigo vai para a chave da conta que era dona dele", async () => {
		const { ownerSignature } = await import("./draft-store")
		storage.setItem("sisub:draft:owner", ownerSignature("user-1"))
		storage.setItem("sisub:draft:sisub:ingredient:1", JSON.stringify(entry("sisub:ingredient:1")))

		const store = await loadStore()
		store.bindOwner("user-1")
		expect(store.get("sisub:ingredient:1")).toBeDefined()
		expect(storage.data.has("sisub:draft:sisub:ingredient:1")).toBe(false)
		expect(storage.data.has(await storageKey("user-1", "sisub:ingredient:1"))).toBe(true)

		// Outra conta entra primeiro: não vê o rascunho, mas ele não se perde — vai para a dona.
		storage.setItem("sisub:draft:owner", ownerSignature("user-1"))
		storage.setItem("sisub:draft:sisub:ingredient:2", JSON.stringify(entry("sisub:ingredient:2")))
		const other = await loadStore()
		other.bindOwner("user-2")
		expect(other.get("sisub:ingredient:2")).toBeUndefined()
		expect(storage.data.has("sisub:draft:sisub:ingredient:2")).toBe(false)
		expect(storage.data.has(await storageKey("user-1", "sisub:ingredient:2"))).toBe(true)
		expect(storage.data.get("sisub:draft:owner")).toBe(ownerSignature("user-2"))
	})

	it("outra conta entrando em OUTRA aba esvazia esta até a sessão dela alcançar a conta nova", async () => {
		const { ownerSignature } = await import("./draft-store")
		const store = await loadStore()
		store.bindOwner("user-1")
		store.set(entry("k"))

		// aba 2: user-2 entrou
		storage.setItem("sisub:draft:owner", ownerSignature("user-2"))
		otherTabWrote("sisub:draft:owner", ownerSignature("user-2"))

		// o que user-1 digitou foi para a chave dele, e esta aba não mostra mais nada
		expect(storage.data.has(await storageKey("user-1", "k"))).toBe(true)
		expect(store.get("k")).toBeUndefined()
		expect(store.list()).toEqual([])
		expect(store.isPersistent()).toBe(false)

		// o cabeçalho re-renderiza com a sessão antiga em cache: não re-amarra a user-1
		store.bindOwner("user-1")
		expect(store.get("k")).toBeUndefined()
		store.set(entry("k2"))
		store.flush()
		expect(storage.data.has(await storageKey("user-1", "k2"))).toBe(false)

		// a sessão alcança user-2: esta aba passa a mostrar os rascunhos dela
		storage.setItem(await storageKey("user-2", "dela"), JSON.stringify(entry("dela")))
		store.bindOwner("user-2")
		expect(store.get("dela")).toBeDefined()
		expect(store.get("k")).toBeUndefined()
	})

	it("no primeiro bind só grava o que nasceu antes dele, não regrava os que vieram do armazenamento", async () => {
		const first = await loadStore()
		first.bindOwner("user-1")
		first.set(entry("antigo"))
		first.flush()

		const store = await loadStore()
		store.set(entry("antes-do-bind"))
		expect(store.isPersistent()).toBe(false)
		const writes: string[] = []
		const setItem = storage.setItem
		storage.setItem = (k: string, v: string) => {
			writes.push(k)
			setItem(k, v)
		}
		store.bindOwner("user-1")
		expect(writes).toEqual([await storageKey("user-1", "antes-do-bind")])
		expect(store.get("antigo")).toBeDefined()
		expect(store.isPersistent()).toBe(true)
	})

	it("entrada inválida vinda de outra aba é ignorada", async () => {
		const store = await loadStore()
		store.bindOwner("user-1")
		const key = await storageKey("user-1", "x")
		otherTabWrote(key, JSON.stringify({ key: "x" }))
		expect(store.get("x")).toBeUndefined()
	})

	it("a chave guarda só uma assinatura curta da conta, nunca o identificador", async () => {
		const store = await loadStore()
		const userId = "7f3c1d2e-9a8b-4c5d-b6e7-f8091a2b3c4d"
		store.bindOwner(userId)
		store.set(entry("k"))
		store.flush()
		const saved = [...storage.data.keys()].filter((key) => key !== "sisub:draft:owner")
		expect(saved).toHaveLength(1)
		expect(saved[0]).toMatch(/^sisub:draft:[0-9a-f]{8}:k$/)
		expect(saved[0]).not.toContain(userId.slice(0, 8))
	})

	it("armazenamento corrompido não derruba a carga", async () => {
		const key = await storageKey("user-1", "quebrado")
		storage.setItem(key, "{não é json")
		const store = await loadStore()
		store.bindOwner("user-1")
		expect(store.list()).toEqual([])
		expect(storage.data.has(key)).toBe(false)
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
