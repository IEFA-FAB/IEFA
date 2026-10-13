import { describe, expect, test } from "vitest"
import { UNFILED_CATALOG_FOLDER_ID } from "@/lib/template-catalog-tree"
import { getOpenFolders, revealOpenFolders, subscribeOpenFolders, toggleOpenFolder } from "./catalog-open-folders"

describe("catalog-open-folders", () => {
	test("pastas começam fechadas, 'Sem pasta' aberto; alterna por catálogo", () => {
		expect([...getOpenFolders("event")]).toEqual([UNFILED_CATALOG_FOLDER_ID])
		toggleOpenFolder("event", "padrao-b")
		expect(getOpenFolders("event").has("padrao-b")).toBe(true)
		expect(getOpenFolders("apoio").has("padrao-b")).toBe(false)
		toggleOpenFolder("event", "padrao-b")
		toggleOpenFolder("event", UNFILED_CATALOG_FOLDER_ID)
		expect(getOpenFolders("event").size).toBe(0)
	})

	test("revelar abre a pasta e a mãe, ignora nulo e só avisa quando muda", () => {
		let calls = 0
		const unsubscribe = subscribeOpenFolders(() => calls++)
		revealOpenFolders("apoio", [null, "bordo", "bordo-b"])
		expect(getOpenFolders("apoio")).toEqual(new Set([UNFILED_CATALOG_FOLDER_ID, "bordo", "bordo-b"]))
		revealOpenFolders("apoio", ["bordo"])
		expect(calls).toBe(1)
		unsubscribe()
	})
})
