import { afterEach, describe, expect, it } from "bun:test"

import { getServerCapabilities } from "./capabilities.server.ts"

const VARS = ["SUCONT_AI_PROVIDER", "SUCONT_AI_MODEL", "SUCONT_AI_API_KEY"] as const

function setEnv(values: Partial<Record<(typeof VARS)[number], string>>) {
	for (const name of VARS) {
		const value = values[name]
		if (value == null) delete process.env[name]
		else process.env[name] = value
	}
}

afterEach(() => setEnv({}))

describe("getServerCapabilities().oracle", () => {
	it("é falso sem nenhuma var — o hub sobe, o oráculo é que fica indisponível", () => {
		setEnv({})
		expect(getServerCapabilities().oracle).toBe(false)
	})

	it("é falso com provider sem model, e com model sem provider", () => {
		setEnv({ SUCONT_AI_PROVIDER: "bedrock" })
		expect(getServerCapabilities().oracle).toBe(false)

		setEnv({ SUCONT_AI_MODEL: "us.anthropic.claude-sonnet-4-6-v1:0" })
		expect(getServerCapabilities().oracle).toBe(false)
	})

	// O ponto do gate: bedrock autentica pela task role, então exigir API key aqui
	// deixaria o oráculo desligado em produção — que é justamente onde ele roda.
	it("é verdadeiro no bedrock SEM api key — provider keyless", () => {
		setEnv({ SUCONT_AI_PROVIDER: "bedrock", SUCONT_AI_MODEL: "us.anthropic.claude-sonnet-4-6-v1:0" })
		expect(getServerCapabilities().oracle).toBe(true)
	})

	it("é verdadeiro no ollama SEM api key — o outro keyless", () => {
		setEnv({ SUCONT_AI_PROVIDER: "ollama", SUCONT_AI_MODEL: "llama3" })
		expect(getServerCapabilities().oracle).toBe(true)
	})

	// Espelha createAdapterFromEnv: com provider de API key e sem a chave, montar o
	// adapter estoura. Melhor a tela dizer "não configurado" que a chamada falhar.
	it("é falso em provider de api key sem a chave, e verdadeiro com ela", () => {
		setEnv({ SUCONT_AI_PROVIDER: "groq", SUCONT_AI_MODEL: "llama-3.3-70b-versatile" })
		expect(getServerCapabilities().oracle).toBe(false)

		setEnv({ SUCONT_AI_PROVIDER: "groq", SUCONT_AI_MODEL: "llama-3.3-70b-versatile", SUCONT_AI_API_KEY: "gsk_test" })
		expect(getServerCapabilities().oracle).toBe(true)
	})
})
