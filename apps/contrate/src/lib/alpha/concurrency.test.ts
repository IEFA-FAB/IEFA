import { describe, expect, test } from "bun:test"
import { createTtlCache, mapWithConcurrency } from "./concurrency"

describe("mapWithConcurrency", () => {
	test("nunca passa do teto, e a saída segue a ordem da entrada", async () => {
		let active = 0
		let peak = 0
		const out = await mapWithConcurrency([30, 5, 20, 1, 10, 2, 8], 3, async (ms, i) => {
			active++
			peak = Math.max(peak, active)
			await Bun.sleep(ms)
			active--
			return i
		})
		expect(peak).toBe(3)
		expect(out).toEqual([0, 1, 2, 3, 4, 5, 6])
	})

	test("lista vazia não chama nada", async () => {
		expect(await mapWithConcurrency([], 5, async () => 1)).toEqual([])
	})
})

describe("createTtlCache", () => {
	test("vence depois do prazo e respeita o teto (sai a mais antiga)", () => {
		let now = 0
		const cache = createTtlCache<string>({ ttlMs: 100, maxEntries: 2, now: () => now })
		cache.set("a", "1")
		cache.set("b", "2")
		cache.set("c", "3")
		expect(cache.get("a")).toBeUndefined()
		expect(cache.get("b")).toBe("2")
		now = 100
		expect(cache.get("c")).toBeUndefined()
		expect(cache.size).toBe(1)
	})
})
