import { describe, expect, test } from "bun:test"
import {
	enforceRequestRateLimit,
	estimatePromptTokens,
	RateLimitError,
	RateLimitStore,
	rateLimitConfigFromEnv,
	scopedKey,
	withRateLimit,
} from "./rate-limit.js"

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

describe("escopo por consumidor", () => {
	test("chat dos módulos e analytics não dividem o mesmo balde", () => {
		// Antes do escopo, 12 mensagens no chat faziam o analytics responder 429 ao mesmo usuário.
		const store = new RateLimitStore()
		const config = { requestsPerMinute: 1 }

		store.admitRequest(scopedKey("MODULE_CHAT", "user-1"), config, T0)

		expect(() => store.admitRequest(scopedKey("MODULE_CHAT", "user-1"), config, T0)).toThrow(RateLimitError)
		expect(() => store.admitRequest(scopedKey("ANALYTICS", "user-1"), config, T0)).not.toThrow()
	})

	test("o orçamento diário é do consumidor e soma todos os usuários dele", () => {
		const store = new RateLimitStore()
		const config = { tokensPerDay: 1000 }

		store.recordTokens(scopedKey("MODULE_CHAT", "user-1"), 1000, T0)

		// Mesmo consumidor, outro usuário: o teto de custo é compartilhado.
		expect(() => store.admitRequest(scopedKey("MODULE_CHAT", "user-2"), config, T0)).toThrow(/Orçamento diário/)
		// Outro consumidor: orçamento próprio.
		expect(() => store.admitRequest(scopedKey("ANALYTICS", "user-1"), config, T0)).not.toThrow()
	})
})

describe("teto diário por usuário", () => {
	test("um usuário esgota a própria fatia sem barrar os demais do mesmo consumidor", () => {
		const store = new RateLimitStore()
		const config = { tokensPerDay: 10_000, tokensPerDayPerUser: 1000 }

		store.recordTokens(scopedKey("MODULE_CHAT", "user-1"), 1000, T0)

		try {
			store.admitRequest(scopedKey("MODULE_CHAT", "user-1"), config, T0)
			throw new Error("deveria ter lançado")
		} catch (error) {
			expect(error).toBeInstanceOf(RateLimitError)
			expect((error as RateLimitError).limit).toBe("tokens-per-day-per-user")
			expect((error as RateLimitError).message).toMatch(/seu limite diário/)
		}
		expect(() => store.admitRequest(scopedKey("MODULE_CHAT", "user-2"), config, T0)).not.toThrow()
	})

	test("a fatia do usuário vira com o dia", () => {
		const store = new RateLimitStore()
		const config = { tokensPerDayPerUser: 1000 }
		store.recordTokens("user-1", 1000, T0)

		expect(() => store.admitRequest("user-1", config, T0 + 23 * 3_600_000)).toThrow(RateLimitError)
		expect(() => store.admitRequest("user-1", config, T0 + 24 * 3_600_000 + 1)).not.toThrow()
	})

	test("devolução não deixa janela abaixo de zero, e valor negativo em recordTokens é ignorado", () => {
		const store = new RateLimitStore()
		store.recordTokens("user-1", 100, T0)
		store.recordTokens("user-1", -50, T0)
		expect(store.snapshot("user-1", T0)).toMatchObject({ tokensThisMinute: 100, tokensToday: 100, tokensTodayForKey: 100 })

		store.refundTokens("user-1", 300, T0, T0)
		expect(store.snapshot("user-1", T0)).toMatchObject({ tokensThisMinute: 0, tokensToday: 0, tokensTodayForKey: 0 })
	})

	test("devolução só vale na janela da cobrança: a que virou no meio da chamada não recebe", () => {
		const store = new RateLimitStore()
		// Cobrou a estimativa no fim da janela do minuto; a chamada terminou no minuto seguinte.
		store.recordTokens("user-1", 1000, T0)
		store.recordTokens("user-1", 10, T0 + 61_000) // abre a janela nova do minuto
		store.refundTokens("user-1", 800, T0, T0 + 61_000)

		const after = store.snapshot("user-1", T0 + 61_000)
		// Minuto novo: não recebe devolução do que foi cobrado no anterior.
		expect(after.tokensThisMinute).toBe(10)
		// Dia: mesma janela da cobrança, devolve.
		expect(after.tokensTodayForKey).toBe(210)
	})
})

describe("rateLimitConfigFromEnv", () => {
	test("devolve undefined quando nenhum teto está setado", () => {
		expect(rateLimitConfigFromEnv("PREFIX_QUE_NAO_EXISTE_98765")).toBeUndefined()
	})

	test("lê os três tetos, ignora valor inválido e avisa em vez de falhar calado", () => {
		process.env.RLTEST_AI_MAX_REQUESTS_PER_MINUTE = "10"
		process.env.RLTEST_AI_MAX_TOKENS_PER_DAY = "500000"
		process.env.RLTEST_AI_MAX_TOKENS_PER_MINUTE = "não-é-número"

		const avisos: string[] = []
		const original = console.warn
		console.warn = (...args: unknown[]) => avisos.push(args.join(" "))

		try {
			expect(rateLimitConfigFromEnv("RLTEST")).toEqual({
				requestsPerMinute: 10,
				tokensPerMinute: undefined,
				tokensPerDay: 500_000,
				tokensPerDayPerUser: undefined,
			})
		} finally {
			console.warn = original
		}

		// Um "1O000" com letra no lugar do zero desligaria o teto sem nada denunciar.
		expect(avisos.join(" ")).toContain("RLTEST_AI_MAX_TOKENS_PER_MINUTE")

		delete process.env.RLTEST_AI_MAX_REQUESTS_PER_MINUTE
		delete process.env.RLTEST_AI_MAX_TOKENS_PER_DAY
		delete process.env.RLTEST_AI_MAX_TOKENS_PER_MINUTE
	})

	test("defaults preenchem o que o env não define, e o env vence", () => {
		process.env.RLDEF_AI_MAX_REQUESTS_PER_MINUTE = "30"
		try {
			expect(rateLimitConfigFromEnv("RLDEF", { requestsPerMinute: 12, tokensPerDayPerUser: 2_000_000 })).toEqual({
				requestsPerMinute: 30,
				tokensPerMinute: undefined,
				tokensPerDay: undefined,
				tokensPerDayPerUser: 2_000_000,
			})
			process.env.RLDEF_AI_MAX_TOKENS_PER_DAY_PER_USER = "5000"
			expect(rateLimitConfigFromEnv("RLDEF", { tokensPerDayPerUser: 2_000_000 })?.tokensPerDayPerUser).toBe(5000)
		} finally {
			delete process.env.RLDEF_AI_MAX_REQUESTS_PER_MINUTE
			delete process.env.RLDEF_AI_MAX_TOKENS_PER_DAY_PER_USER
		}
		// Sem env e sem default continua "sem teto".
		expect(rateLimitConfigFromEnv("RLDEF")).toBeUndefined()
	})

	test("`off` no env desliga o teto, inclusive o default do código", () => {
		process.env.RLOFF_AI_MAX_TOKENS_PER_DAY_PER_USER = "off"
		try {
			expect(rateLimitConfigFromEnv("RLOFF", { requestsPerMinute: 12, tokensPerDayPerUser: 2_000_000 })).toEqual({
				requestsPerMinute: 12,
				tokensPerMinute: undefined,
				tokensPerDay: undefined,
				tokensPerDayPerUser: undefined,
			})
		} finally {
			delete process.env.RLOFF_AI_MAX_TOKENS_PER_DAY_PER_USER
		}
	})
})

describe("enforceRequestRateLimit", () => {
	test("aplica os defaults sem env: o turno conta no início e o seguinte é recusado", () => {
		const store = new RateLimitStore()
		const defaults = { requestsPerMinute: 1 }

		enforceRequestRateLimit("RLENF_SEM_ENV", "user-1", store, defaults)
		expect(() => enforceRequestRateLimit("RLENF_SEM_ENV", "user-1", store, defaults)).toThrow(RateLimitError)
	})

	test("recusa o turno de quem já esgotou a fatia diária, antes do stream", () => {
		const store = new RateLimitStore()
		store.recordTokens(scopedKey("RLENF_SEM_ENV", "user-1"), 50)

		expect(() => enforceRequestRateLimit("RLENF_SEM_ENV", "user-1", store, { tokensPerDayPerUser: 50 })).toThrow(/seu limite diário/)
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

	test("orçamento estourado vira RUN_ERROR, não exceção — o SSE já está aberto", async () => {
		// Lançar aqui devolveria ao usuário uma conexão cortada sem mensagem: exatamente o
		// sintoma que este pacote existe para eliminar. O cliente já sabe mostrar RUN_ERROR.
		const store = new RateLimitStore()
		const wrapped = withRateLimit(adapterEmitting({ totalTokens: 1000 }), { key: "user-1", config: { tokensPerDay: 900 }, store })

		for await (const _ of wrapped.chatStream({} as never)) {
			// primeira chamada passa: o orçamento só é conhecido depois de gasto
		}

		const chunks: { type?: string; message?: string }[] = []
		for await (const chunk of wrapped.chatStream({} as never)) {
			chunks.push(chunk as { type?: string; message?: string })
		}

		expect(chunks).toHaveLength(1)
		expect(chunks[0]?.type).toBe("RUN_ERROR")
		expect(chunks[0]?.message).toMatch(/Orçamento diário/)
	})

	test("o prompt conta no início: chamada interrompida antes do RUN_FINISHED ainda entra no teto", async () => {
		const store = new RateLimitStore()
		const wrapped = withRateLimit(adapterEmitting({ totalTokens: 9999 }), { key: "user-1", config: { tokensPerDayPerUser: 10_000 }, store })
		const options = { messages: [{ role: "user", content: "x".repeat(4000) }] }
		const expected = estimatePromptTokens(options)
		expect(expected).toBeGreaterThan(1000)

		// O usuário fecha a aba no primeiro chunk: o gerador é encerrado, o RUN_FINISHED nunca chega.
		for await (const _ of wrapped.chatStream(options as never)) break

		expect(store.snapshot("user-1").tokensTodayForKey).toBe(expected)
	})

	test("o RUN_FINISHED acerta a estimativa pelo gasto real", async () => {
		const store = new RateLimitStore()
		const wrapped = withRateLimit(adapterEmitting({ totalTokens: 300 }), { key: "user-1", config: { tokensPerDay: 1_000_000 }, store })

		for await (const _ of wrapped.chatStream({ messages: [{ role: "user", content: "y".repeat(8000) }] } as never)) {
			// consome o stream
		}

		expect(store.snapshot("user-1")).toMatchObject({ tokensToday: 300, tokensTodayForKey: 300, tokensThisMinute: 300 })
	})
})
