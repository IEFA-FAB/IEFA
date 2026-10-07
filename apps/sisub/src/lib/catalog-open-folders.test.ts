import { describe, expect, test } from "vitest"
import { getOpenFolders, revealOpenFolders, subscribeOpenFolders, toggleOpenFolder } from "./catalog-open-folders"

describe("catalog-open-folders", () => {
	test("começa tudo fechado e alterna por catálogo", () => {
		expect(getOpenFolders("event").size).toBe(0)
		toggleOpenFolder("event", "padrao-b")
		expect([...getOpenFolders("event")]).toEqual(["padrao-b"])
		expect(getOpenFolders("apoio").size).toBe(0)
		toggleOpenFolder("event", "padrao-b")
		expect(getOpenFolders("event").size).toBe(0)
	})

	test("revelar abre a pasta e a mãe, ignora nulo e só avisa quando muda", () => {
		let calls = 0
		const unsubscribe = subscribeOpenFolders(() => calls++)
		revealOpenFolders("apoio", [null, "bordo", "bordo-b"])
		expect(getOpenFolders("apoio")).toEqual(new Set(["bordo", "bordo-b"]))
		revealOpenFolders("apoio", ["bordo"])
		expect(calls).toBe(1)
		unsubscribe()
	})
})
