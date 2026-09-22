import { describe, expect, it } from "bun:test"
import { decideDailyLimit } from "./daily-limit.ts"

describe("decideDailyLimit", () => {
	it("abaixo do teto, libera", () => {
		expect(decideDailyLimit(["2026-09-22T10:00:00Z"], 2)).toEqual({ blocked: false })
	})

	it("no teto, bloqueia até a mais antiga contada sair da janela de 24 h", () => {
		const state = decideDailyLimit(["2026-09-22T10:00:00Z", "2026-09-22T08:00:00Z"], 2)
		expect(state).toEqual({ blocked: true, retryAt: new Date("2026-09-23T08:00:00Z") })
	})
})
