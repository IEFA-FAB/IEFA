import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"
import { CHAT_HISTORY_WRITES_PER_MINUTE, ChatHistoryWriteLimiter } from "./chat-history-rate-limit"

const T0 = 1_700_000_000_000

describe("ChatHistoryWriteLimiter", () => {
	test("admite até o teto e recusa a seguinte, dizendo quanto esperar", () => {
		const limiter = new ChatHistoryWriteLimiter(3)
		for (let i = 0; i < 3; i++) expect(limiter.admit("user-1", T0).allowed).toBe(true)

		const verdict = limiter.admit("user-1", T0 + 20_000)
		expect(verdict).toMatchObject({ allowed: false, retryAfterSeconds: 40 })
	})

	test("o teto é por usuário", () => {
		const limiter = new ChatHistoryWriteLimiter(1)
		expect(limiter.admit("user-1", T0).allowed).toBe(true)
		expect(limiter.admit("user-2", T0).allowed).toBe(true)
		expect(limiter.admit("user-1", T0).allowed).toBe(false)
	})

	test("a janela vira depois de um minuto", () => {
		const limiter = new ChatHistoryWriteLimiter(1)
		limiter.admit("user-1", T0)
		expect(limiter.admit("user-1", T0 + 59_999).allowed).toBe(false)
		expect(limiter.admit("user-1", T0 + 60_000).allowed).toBe(true)
	})

	test("o teto padrão cabe um minuto de uso real (12 turnos de até 4 linhas)", () => {
		expect(CHAT_HISTORY_WRITES_PER_MINUTE).toBeGreaterThanOrEqual(12 * 4)
	})
})

describe("as duas fns de gravação passam pelo teto antes de gravar", () => {
	for (const file of ["analytics-chat.fn.ts", "module-chat.fn.ts"]) {
		test(file, () => {
			const source = readFileSync(resolve(__dirname, "../server", file), "utf8")
			const handler = source.slice(source.indexOf("export const save"))
			expect(handler).toContain("CHAT_HISTORY_WRITE_LIMITER.admit(ctx.userId)")
			expect(handler).toContain("setResponseStatus(429)")
			expect(handler.indexOf("CHAT_HISTORY_WRITE_LIMITER.admit(")).toBeLessThan(handler.indexOf("(getDb(), ctx, data)"))
		})
	}
})
