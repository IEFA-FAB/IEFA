import { describe, expect, test } from "bun:test"
import { WRITE_LIMITS_PER_MINUTE, WriteRateLimiter } from "./rate-limit"

describe("WriteRateLimiter", () => {
	test("admite até o teto na janela e depois recusa com a espera", () => {
		const limiter = new WriteRateLimiter({ answer: 3, session: 1, submit: 1, reopen: 1 })
		const t0 = 1_000_000
		expect(limiter.admit("u1", "answer", t0)).toEqual({ allowed: true })
		expect(limiter.admit("u1", "answer", t0 + 1)).toEqual({ allowed: true })
		expect(limiter.admit("u1", "answer", t0 + 2)).toEqual({ allowed: true })
		expect(limiter.admit("u1", "answer", t0 + 10_000)).toEqual({ allowed: false, retryAfterSeconds: 50 })
	})

	test("a janela vira depois de um minuto", () => {
		const limiter = new WriteRateLimiter({ answer: 1, session: 1, submit: 1, reopen: 1 })
		expect(limiter.admit("u1", "answer", 0).allowed).toBe(true)
		expect(limiter.admit("u1", "answer", 59_999).allowed).toBe(false)
		expect(limiter.admit("u1", "answer", 60_000).allowed).toBe(true)
	})

	test("baldes separados por usuário e por tipo", () => {
		const limiter = new WriteRateLimiter({ answer: 1, session: 1, submit: 1, reopen: 1 })
		expect(limiter.admit("u1", "answer", 0).allowed).toBe(true)
		expect(limiter.admit("u2", "answer", 0).allowed).toBe(true)
		expect(limiter.admit("u1", "submit", 0).allowed).toBe(true)
		expect(limiter.admit("u1", "answer", 0).allowed).toBe(false)
	})

	test("o teto do autosave cobre um checklist inteiro preenchido de uma vez", () => {
		// Maior questionário em produção (2026-10-01): 22 perguntas numa seção; resposta + observação.
		expect(WRITE_LIMITS_PER_MINUTE.answer).toBeGreaterThanOrEqual(44)
	})
})
