import { describe, expect, test } from "vitest"
import { isTrashOpen, setTrashOpen, subscribeTrashOpen } from "./catalog-trash-open"

describe("catalog-trash-open", () => {
	test("começa fechada e abre por catálogo", () => {
		expect(isTrashOpen("weekly")).toBe(false)
		setTrashOpen("weekly", true)
		expect(isTrashOpen("weekly")).toBe(true)
		expect(isTrashOpen("evento")).toBe(false)
		setTrashOpen("weekly", false)
		expect(isTrashOpen("weekly")).toBe(false)
	})

	test("só avisa quando muda", () => {
		let calls = 0
		const unsubscribe = subscribeTrashOpen(() => calls++)
		setTrashOpen("apoio", true)
		setTrashOpen("apoio", true)
		expect(calls).toBe(1)
		unsubscribe()
	})
})
