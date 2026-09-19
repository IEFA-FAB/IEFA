import { describe, expect, test } from "bun:test"
import { TextCache } from "./text-cache.ts"

describe("TextCache", () => {
	test("expulsa o menos usado quando passa da quantidade", () => {
		const cache = new TextCache(2, 1_000)
		cache.set("a", "1")
		cache.set("b", "2")
		cache.get("a")
		cache.set("c", "3")

		expect(cache.get("b")).toBeUndefined()
		expect(cache.get("a")).toBe("1")
		expect(cache.get("c")).toBe("3")
	})

	test("expulsa até caber no teto de caracteres, e não guarda texto maior que o teto", () => {
		const cache = new TextCache(10, 10)
		cache.set("a", "12345")
		cache.set("b", "12345")
		cache.set("c", "123")

		expect(cache.get("a")).toBeUndefined()
		expect(cache.size).toBe(2)

		cache.set("huge", "x".repeat(11))
		expect(cache.get("huge")).toBeUndefined()
		expect(cache.size).toBe(2)
	})
})
