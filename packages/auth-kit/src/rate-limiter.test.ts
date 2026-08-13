import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import { getRemainingSeconds, recordFailure, resetRateLimit } from "./rate-limiter.ts"

const MAX_ATTEMPTS = 5

/** `sessionStorage` mínimo — o ambiente do bun test não tem DOM. */
function installSessionStorage() {
	const store = new Map<string, string>()
	Object.defineProperty(globalThis, "sessionStorage", {
		configurable: true,
		value: {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => void store.set(k, v),
			removeItem: (k: string) => void store.delete(k),
		},
	})
}

const realNow = Date.now
function freezeTime(at: number) {
	Date.now = () => at
}

beforeEach(installSessionStorage)
afterEach(() => {
	Date.now = realNow
	Reflect.deleteProperty(globalThis, "sessionStorage")
})

function failNTimes(n: number) {
	let remaining = 0
	for (let i = 0; i < n; i++) remaining = recordFailure()
	return remaining
}

describe("login rate limiter", () => {
	test("não trava antes de MAX_ATTEMPTS", () => {
		freezeTime(1_000_000)
		expect(failNTimes(MAX_ATTEMPTS - 1)).toBe(0)
	})

	test("trava por 30s na primeira vez que atinge MAX_ATTEMPTS", () => {
		freezeTime(1_000_000)
		expect(failNTimes(MAX_ATTEMPTS)).toBe(30)
	})

	test("escalona o cooldown a cada nova rodada de bloqueio", () => {
		let now = 1_000_000
		freezeTime(now)
		expect(failNTimes(MAX_ATTEMPTS)).toBe(30)

		// Passa o cooldown e queima outra rodada inteira de tentativas.
		now += 31_000
		freezeTime(now)
		expect(failNTimes(MAX_ATTEMPTS)).toBe(60)

		now += 61_000
		freezeTime(now)
		expect(failNTimes(MAX_ATTEMPTS)).toBe(120)
	})

	/**
	 * Regressão do bug que vivia em sisub/portal/forms: `recordFailure` zerava
	 * `failures` mas não `lockUntil`. Como a guarda é `lockUntil > 0 && lockUntil <= now`,
	 * ela passava a valer em TODA chamada seguinte, zerando o contador antes do
	 * incremento — `failures` oscilava entre 0 e 1 e nunca mais chegava a MAX_ATTEMPTS.
	 * Na prática a trava disparava uma vez e ficava desligada para sempre.
	 */
	test("volta a travar depois que o primeiro lock expira", () => {
		freezeTime(1_000_000)
		expect(failNTimes(MAX_ATTEMPTS)).toBe(30)

		freezeTime(1_031_000)
		expect(getRemainingSeconds()).toBe(0)

		expect(failNTimes(MAX_ATTEMPTS)).toBeGreaterThan(0)
	})

	test("getRemainingSeconds arredonda para cima e zera ao expirar", () => {
		freezeTime(1_000_000)
		failNTimes(MAX_ATTEMPTS)

		freezeTime(1_029_500)
		expect(getRemainingSeconds()).toBe(1)

		freezeTime(1_030_000)
		expect(getRemainingSeconds()).toBe(0)
	})

	test("reset limpa a trava por completo", () => {
		freezeTime(1_000_000)
		failNTimes(MAX_ATTEMPTS)
		expect(getRemainingSeconds()).toBe(30)

		resetRateLimit()
		expect(getRemainingSeconds()).toBe(0)
		expect(failNTimes(MAX_ATTEMPTS - 1)).toBe(0)
	})

	test("sobrevive a sessionStorage indisponível (modo restrito do browser)", () => {
		Object.defineProperty(globalThis, "sessionStorage", {
			configurable: true,
			value: {
				getItem: () => {
					throw new Error("blocked")
				},
				setItem: () => {
					throw new Error("blocked")
				},
				removeItem: () => {
					throw new Error("blocked")
				},
			},
		})
		freezeTime(1_000_000)

		expect(() => failNTimes(MAX_ATTEMPTS)).not.toThrow()
		expect(getRemainingSeconds()).toBe(0)
	})
})
