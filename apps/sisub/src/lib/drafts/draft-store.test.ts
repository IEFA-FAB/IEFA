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
