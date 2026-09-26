import { afterEach, describe, expect, it, vi } from "vitest"
import { draftStore } from "./draft-store"

const entry = (key: string, savedAt: number) => ({ key, values: { a: 1 }, baseStamp: null, title: key, href: null, changeCount: 1, savedAt })

afterEach(() => draftStore.clear())

describe("draftStore", () => {
	it("guarda, lê e apaga rascunhos, notificando os inscritos", () => {
		const listener = vi.fn()
		const unsubscribe = draftStore.subscribe(listener)
		draftStore.set(entry("a", 1))
		expect(draftStore.get("a")?.values).toEqual({ a: 1 })
		draftStore.delete("a")
		expect(draftStore.get("a")).toBeUndefined()
		expect(listener).toHaveBeenCalledTimes(2)
		unsubscribe()
	})

	it("lista do mais recente para o mais antigo e mantém a referência até a próxima mudança", () => {
		draftStore.set(entry("old", 1))
		draftStore.set(entry("new", 2))
		const list = draftStore.list()
		expect(list.map((item) => item.key)).toEqual(["new", "old"])
		expect(draftStore.list()).toBe(list)
	})

	it("apagar chave inexistente não notifica", () => {
		const listener = vi.fn()
		draftStore.subscribe(listener)
		draftStore.delete("nada")
		expect(listener).not.toHaveBeenCalled()
	})
})

describe("draftStore — dono e notificação", () => {
	it("descarta os rascunhos quando OUTRA conta entra; sair da conta não descarta", () => {
		draftStore.bindOwner("user-1")
		draftStore.set(entry("a", 1))
		draftStore.bindOwner("user-1")
		expect(draftStore.get("a")).toBeDefined()
		draftStore.bindOwner(null)
		expect(draftStore.get("a")).toBeDefined()
		draftStore.bindOwner("user-2")
		expect(draftStore.get("a")).toBeUndefined()
	})

	it("gravar só os valores não notifica; mudar a contagem notifica", () => {
		draftStore.set(entry("a", 1))
		const listener = vi.fn()
		draftStore.subscribe(listener)
		draftStore.set({ ...entry("a", 2), values: { a: 2 } })
		expect(listener).not.toHaveBeenCalled()
		expect(draftStore.get("a")?.values).toEqual({ a: 2 })
		draftStore.set({ ...entry("a", 3), changeCount: 2 })
		expect(listener).toHaveBeenCalledTimes(1)
	})

	it("expõe o conjunto de chaves como string estável", () => {
		draftStore.set(entry("b", 1))
		draftStore.set(entry("a", 1))
		expect(draftStore.keys()).toBe("a\nb")
	})
})
