/**
 * Guardas do ponto único de IA das server functions.
 *
 * O que estes testes provam, e por que cada um existe:
 *  - sem `SUCONT_AI_*` o caminho responde 503 e NÃO tenta montar o adapter;
 *  - o teto é aplicado ANTES de qualquer chamada ao modelo, com `Retry-After`;
 *  - o teto é por usuário — um usuário estourando não bloqueia os outros;
 *  - `generateText`/`generateJson` passam pela mesma guarda que `getSucontAdapter`,
 *    então não existe atalho para o modelo.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"

import { defaultRateLimitStore } from "@iefa/ai-provider"

// `setResponseStatus`/`setResponseHeader` do Start precisam de um contexto de request
// que não existe em teste. O dublê registra o que foi setado — que é exatamente o que
// o cliente vai ler, já que o valor lançado é um Error e não uma Response.
const response = { status: 0, headers: {} as Record<string, string> }

mock.module("@tanstack/react-start/server", () => ({
	setResponseStatus: (status: number) => {
		response.status = status
	},
	setResponseHeader: (name: string, value: string) => {
		response.headers[name] = value
	},
}))

const { generateText, getSucontAdapter } = await import("./ai.server.ts")

const AI_VARS = [
	"SUCONT_AI_PROVIDER",
	"SUCONT_AI_MODEL",
	"SUCONT_AI_API_KEY",
	"SUCONT_AI_REGION",
	"SUCONT_AI_MAX_REQUESTS_PER_MINUTE",
	"SUCONT_AI_MAX_TOKENS_PER_MINUTE",
	"SUCONT_AI_MAX_TOKENS_PER_DAY",
] as const

function clearAiEnv() {
	for (const name of AI_VARS) delete process.env[name]
}

/** Bedrock como em produção: o SDK é carregado sob demanda, então montar o adapter não faz rede. */
function configureBedrock() {
	process.env.SUCONT_AI_PROVIDER = "bedrock"
	process.env.SUCONT_AI_MODEL = "us.anthropic.claude-sonnet-4-6-v1:0"
	process.env.SUCONT_AI_REGION = "us-east-1"
}

beforeEach(() => {
	clearAiEnv()
	defaultRateLimitStore.reset()
	response.status = 0
	response.headers = {}
})

afterEach(clearAiEnv)

describe("capability gate", () => {
	it("lança 503 sem SUCONT_AI_* — e o status vai por setResponseStatus, não por throw Response", () => {
		expect(() => getSucontAdapter("user-1")).toThrow("Recurso de IA indisponível — não configurado neste ambiente")
		expect(response.status).toBe(503)
	})

	it("não altera o status quando a IA está configurada", () => {
		configureBedrock()
		const adapter = getSucontAdapter("user-1")
		expect(typeof adapter.chatStream).toBe("function")
		expect(response.status).toBe(0)
	})
})

describe("teto de requisições", () => {
	it("admite até o limite e então lança 429", () => {
		configureBedrock()
		process.env.SUCONT_AI_MAX_REQUESTS_PER_MINUTE = "2"

		getSucontAdapter("user-1")
		getSucontAdapter("user-1")

		expect(() => getSucontAdapter("user-1")).toThrow(/limite de mensagens por minuto/i)
		expect(response.status).toBe(429)
	})

	// A espera precisa ir na MENSAGEM: o Start remonta a resposta de erro da server
	// function e só o status sobrevive — um header `Retry-After` não chegaria à tela,
	// e o `retryAfterSeconds` do RateLimitError se perde ao virar Error.
	it("diz na mensagem quantos segundos faltam", () => {
		configureBedrock()
		process.env.SUCONT_AI_MAX_REQUESTS_PER_MINUTE = "1"
		getSucontAdapter("user-1")

		expect(() => getSucontAdapter("user-1")).toThrow(/\(aguarde \d+s\)/)
		expect(response.headers["Retry-After"]).toBeUndefined()
	})

	// Sem chave por usuário o teto vira um balde único: o primeiro a estourar
	// derruba a seção inteira.
	it("é por usuário — o estouro de um não bloqueia o outro", () => {
		configureBedrock()
		process.env.SUCONT_AI_MAX_REQUESTS_PER_MINUTE = "1"

		getSucontAdapter("user-1")
		expect(() => getSucontAdapter("user-1")).toThrow()

		response.status = 0
		expect(() => getSucontAdapter("user-2")).not.toThrow()
		expect(response.status).toBe(0)
	})

	it("não freia nada quando nenhum teto está configurado", () => {
		configureBedrock()
		for (let i = 0; i < 50; i++) getSucontAdapter("user-1")
		expect(response.status).toBe(0)
	})
})

describe("generateText", () => {
	it("passa pela mesma guarda — sem IA configurada, 503 antes de qualquer chamada ao modelo", async () => {
		await expect(generateText({ userId: "user-1", user: "oi" })).rejects.toThrow(/indisponível/i)
		expect(response.status).toBe(503)
	})

	it("respeita o teto: com a cota do usuário esgotada, falha em 429 sem falar com o provider", async () => {
		configureBedrock()
		process.env.SUCONT_AI_MAX_REQUESTS_PER_MINUTE = "1"
		getSucontAdapter("user-1")

		await expect(generateText({ userId: "user-1", user: "oi" })).rejects.toThrow(/limite de mensagens por minuto/i)
		expect(response.status).toBe(429)
	})
})
