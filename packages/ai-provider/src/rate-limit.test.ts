import { describe, expect, test } from "bun:test"
import { RateLimitError, RateLimitStore, rateLimitConfigFromEnv, withRateLimit } from "./rate-limit.js"

const T0 = 1_700_000_000_000

describe("RateLimitStore — requisições por minuto", () => {
	test("admite até o teto e barra a seguinte", () => {
		const store = new RateLimitStore()
		const config = { requestsPerMinute: 3 }

		for (let i = 0; i < 3; i++) store.admitRequest("user-1", config, T0)
		expect(() => store.admitRequest("user-1", config, T0)).toThrow(RateLimitError)
	})

	test("o teto é por chave — um usuário não consome a cota do outro", () => {
		const store = new RateLimitStore()
		const config = { requestsPerMinute: 1 }

		store.admitRequest("user-1", config, T0)
		expect(() => store.admitRequest("user-2", config, T0)).not.toThrow()
	})

	test("a janela vira depois de um minuto", () => {
		const store = new RateLimitStore()
		const config = { requestsPerMinute: 1 }

		store.admitRequest("user-1", config, T0)
		expect(() => store.admitRequest("user-1", config, T0 + 59_000)).toThrow(RateLimitError)
		expect(() => store.admitRequest("user-1", config, T0 + 60_001)).not.toThrow()
	})

	test("o erro diz quanto falta para liberar", () => {
		const store = new RateLimitStore()
		const config = { requestsPerMinute: 1 }
		store.admitRequest("user-1", config, T0)

		try {
			store.admitRequest("user-1", config, T0 + 20_000)
			throw new Error("deveria ter lançado")
		} catch (error) {
			expect(error).toBeInstanceOf(RateLimitError)
			expect((error as RateLimitError).limit).toBe("requests-per-minute")
			expect((error as RateLimitError).retryAfterSeconds).toBe(40)
		}
	})
})

describe("RateLimitStore — tokens", () => {
	test("teto diário é global: um usuário estourando barra os demais", () => {
		const store = new RateLimitStore()
		const config = { tokensPerDay: 1000 }

		store.recordTokens("user-1", 1000, T0)
		expect(() => store.admitRequest("user-2", config, T0)).toThrow(/Orçamento diário/)
	})

	test("teto de tokens por minuto é por chave", () => {
		const store = new RateLimitStore()
		const config = { tokensPerMinute: 500 }

		store.recordTokens("user-1", 500, T0)
		expect(() => store.admitRequest("user-1", config, T0)).toThrow(RateLimitError)
		expect(() => store.admitRequest("user-2", config, T0)).not.toThrow()
	})

	test("checkTokenBudgets não consome requisição — o loop agêntico não conta como N turnos", () => {
		const store = new RateLimitStore()
		const config = { requestsPerMinute: 1, tokensPerDay: 10_000 }

		store.admitRequest("user-1", config, T0)
		for (let i = 0; i < 8; i++) store.checkTokenBudgets("user-1", config, T0)

		expect(store.snapshot("user-1", T0).requestsThisMinute).toBe(1)
	})

	test("sem teto configurado nada barra", () => {
		const store = new RateLimitStore()
		store.recordTokens("user-1", 10_000_000, T0)
		expect(() => store.admitRequest("user-1", {}, T0)).not.toThrow()
	})
})

describe("rateLimitConfigFromEnv", () => {
	test("devolve undefined quando nenhum teto está setado", () => {
		expect(rateLimitConfigFromEnv("PREFIX_QUE_NAO_EXISTE_98765")).toBeUndefined()
	})

	test("lê os três tetos e ignora valor inválido", () => {
		process.env.RLTEST_AI_MAX_REQUESTS_PER_MINUTE = "10"
		process.env.RLTEST_AI_MAX_TOKENS_PER_DAY = "500000"
		process.env.RLTEST_AI_MAX_TOKENS_PER_MINUTE = "não-é-número"

		expect(rateLimitConfigFromEnv("RLTEST")).toEqual({
			requestsPerMinute: 10,
			tokensPerMinute: undefined,
			tokensPerDay: 500_000,
		})

		delete process.env.RLTEST_AI_MAX_REQUESTS_PER_MINUTE
		delete process.env.RLTEST_AI_MAX_TOKENS_PER_DAY
		delete process.env.RLTEST_AI_MAX_TOKENS_PER_MINUTE
	})
})

describe("withRateLimit", () => {
	function adapterEmitting(usage: { totalTokens: number }) {
		return {
			kind: "text" as const,
			name: "fake",
			model: "fake",
			chatStream: async function* (_options: never) {
				yield { type: "RUN_STARTED" }
				yield { type: "TEXT_MESSAGE_CONTENT", delta: "oi" }
				yield { type: "RUN_FINISHED", usage }
			},
			structuredOutput: async (_options: never) => ({ data: {}, rawText: "", usage }),
		}
	}

	test("contabiliza os tokens do RUN_FINISHED", async () => {
		const store = new RateLimitStore()
		const wrapped = withRateLimit(adapterEmitting({ totalTokens: 1234 }), { key: "user-1", config: { tokensPerDay: 10_000 }, store })

		for await (const _ of wrapped.chatStream({} as never)) {
			// consome o stream
		}

		expect(store.snapshot("user-1").tokensToday).toBe(1234)
	})

	test("barra a próxima chamada quando o orçamento diário já estourou", async () => {
		const store = new RateLimitStore()
		const wrapped = withRateLimit(adapterEmitting({ totalTokens: 1000 }), { key: "user-1", config: { tokensPerDay: 900 }, store })

		for await (const _ of wrapped.chatStream({} as never)) {
			// primeira chamada passa: o orçamento só é conhecido depois de gasto
		}

		await expect(
			(async () => {
				for await (const _ of wrapped.chatStream({} as never)) {
					// deve lançar antes do primeiro chunk
				}
			})()
		).rejects.toThrow(RateLimitError)
	})
})
