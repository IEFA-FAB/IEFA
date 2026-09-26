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

let storage: ReturnType<typeof fakeStorage>

async function loadStore() {
	vi.resetModules()
	return (await import("./draft-store")).draftStore
}

const entry = (key: string, savedAt = Date.now()) => ({ key, values: { price: 28.5 }, baseStamp: null, title: key, href: null, changeCount: 1, savedAt })

beforeEach(() => {
	storage = fakeStorage()
	vi.stubGlobal("window", { localStorage: storage, addEventListener: () => {} })
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("draftStore — persistência local", () => {
	it("o rascunho sobrevive a recarregar a página", async () => {
		const store = await loadStore()
		store.bindOwner("user-1")
		store.set(entry("sisub:ingredient:1"))
		expect(storage.data.has("sisub:draft:sisub:ingredient:1")).toBe(true)

		const reloaded = await loadStore()
		reloaded.bindOwner("user-1")
		expect(reloaded.get("sisub:ingredient:1")?.values).toEqual({ price: 28.5 })
	})

	it("descartar apaga também do armazenamento", async () => {
		const store = await loadStore()
		store.set(entry("k"))
		store.delete("k")
		expect(storage.data.has("sisub:draft:k")).toBe(false)
	})

	it("rascunho parado há mais de 7 dias é descartado ao carregar", async () => {
		const store = await loadStore()
		const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
		store.set(entry("velho", eightDaysAgo))
		store.set(entry("novo"))

		const reloaded = await loadStore()
		expect(reloaded.get("velho")).toBeUndefined()
		expect(reloaded.get("novo")).toBeDefined()
		expect(storage.data.has("sisub:draft:velho")).toBe(false)
	})

	it("outra conta no mesmo navegador descarta os rascunhos de quem saiu, mesmo depois do F5", async () => {
		const store = await loadStore()
		store.bindOwner("user-1")
		store.set(entry("k"))

		const reloaded = await loadStore()
		reloaded.bindOwner("user-2")
		expect(reloaded.get("k")).toBeUndefined()
		expect(storage.data.has("sisub:draft:k")).toBe(false)
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
})
