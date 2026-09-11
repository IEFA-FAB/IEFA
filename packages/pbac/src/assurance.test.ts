import { describe, expect, test } from "bun:test"
import { ASSURANCE_FRESHNESS_WINDOW_SECONDS, type AssuranceRequirement, assertAssurance, NO_ASSURANCE, satisfiesAssurance } from "./assurance.ts"
import { AssuranceRequiredError } from "./errors.ts"
import type { UserContext } from "./types.ts"

const NOW = 1_789_200_000

function ctx(overrides: Partial<UserContext> = {}): UserContext {
	return { userId: "u-1", permissions: [], aal: 1, lastFactorAt: null, origin: "session", ...overrides }
}

const SESSION: AssuranceRequirement = { require: "session", reason: "Esta operação registra uma liquidação." }
const FRESH: AssuranceRequirement = { require: "fresh", reason: "Esta operação altera permissões de acesso." }

/** Captura o erro tipado; falha o teste se a chamada tiver passado. */
function denial(fn: () => void): AssuranceRequiredError {
	try {
		fn()
	} catch (error) {
		if (error instanceof AssuranceRequiredError) return error
		throw error
	}
	throw new Error("esperava AssuranceRequiredError, mas a chamada passou")
}

describe("exigência ausente", () => {
	test("`none` passa para qualquer contexto — é o rollback do piso", () => {
		expect(() => assertAssurance(ctx(), NO_ASSURANCE, { now: NOW })).not.toThrow()
		expect(() => assertAssurance(ctx({ origin: "api-key" }), { require: "none" }, { now: NOW })).not.toThrow()
	})
})

describe("grau session", () => {
	test("AAL2 satisfaz, por mais antiga que seja a verificação", () => {
		// É a decisão D2 inteira: o operador de liquidação digitou uma vez no login e não é
		// interrompido no turno. Três horas atrás continua valendo.
		const elevated = ctx({ aal: 2, lastFactorAt: NOW - 3 * 60 * 60 })
		expect(() => assertAssurance(elevated, SESSION, { now: NOW })).not.toThrow()
	})

	test("AAL1 com fator cadastrado pede o código", () => {
		const error = denial(() => assertAssurance(ctx({ hasVerifiedFactor: true }), SESSION, { now: NOW }))
		expect(error.code).toBe("MFA_REQUIRED")
		expect(error.nextStep).toBe("challenge")
		expect(error.grade).toBe("session")
		expect(error.reason).toBe("Esta operação registra uma liquidação.")
	})

	test("AAL1 sem fator nenhum pede o cadastro", () => {
		expect(denial(() => assertAssurance(ctx(), SESSION, { now: NOW })).nextStep).toBe("enroll")
	})

	test("`hasVerifiedFactor` ausente é tratado como sem fator", () => {
		// Ausente = não se sabe. Mandar cadastrar quem já tem fator dá um erro claro do GoTrue
		// (V2: 403 insufficient_aal); mandar digitar código quem não tem fator é beco sem saída.
		expect(denial(() => assertAssurance(ctx({ hasVerifiedFactor: undefined }), SESSION, { now: NOW })).nextStep).toBe("enroll")
	})
})

describe("grau fresh", () => {
	test("verificação dentro da janela passa", () => {
		const recent = ctx({ aal: 2, lastFactorAt: NOW - 3 * 60 })
		expect(() => assertAssurance(recent, FRESH, { now: NOW })).not.toThrow()
	})

	test("o limite exato da janela ainda passa", () => {
		const borderline = ctx({ aal: 2, lastFactorAt: NOW - ASSURANCE_FRESHNESS_WINDOW_SECONDS })
		expect(() => assertAssurance(borderline, FRESH, { now: NOW })).not.toThrow()
	})

	test("um segundo além da janela vira step-up", () => {
		const expired = ctx({ aal: 2, lastFactorAt: NOW - ASSURANCE_FRESHNESS_WINDOW_SECONDS - 1 })
		expect(denial(() => assertAssurance(expired, FRESH, { now: NOW })).nextStep).toBe("step-up")
	})

	test("40 minutos depois é step-up (cenário da spec)", () => {
		const expired = ctx({ aal: 2, lastFactorAt: NOW - 40 * 60, hasVerifiedFactor: true })
		const error = denial(() => assertAssurance(expired, FRESH, { now: NOW }))
		expect(error.nextStep).toBe("step-up")
		expect(error.message).toBe("Esta operação altera permissões de acesso.")
	})

	test("AAL2 sem lastFactorAt falha fechado, conduzindo ao desafio", () => {
		// `amr` sem entrada `totp` num token que se diz aal2: formato inesperado. Tratar como
		// elevação válida seria confiar no que não se conseguiu ler.
		expect(denial(() => assertAssurance(ctx({ aal: 2, lastFactorAt: null }), FRESH, { now: NOW })).nextStep).toBe("step-up")
	})

	test("timestamp no futuro (relógio adiantado) continua dentro da janela", () => {
		const skewed = ctx({ aal: 2, lastFactorAt: NOW + 30 })
		expect(() => assertAssurance(skewed, FRESH, { now: NOW })).not.toThrow()
	})
})

describe("chave de API", () => {
	test("nunca satisfaz grau nenhum, e a mensagem diz por quê", () => {
		// Uma chave com `aal: 2` forjado no contexto também não passa: o ramo de origem vem
		// antes. É o que impede a chave de virar a via de contorno permanente do segundo fator.
		const key = ctx({ origin: "api-key", aal: 2, lastFactorAt: NOW, hasVerifiedFactor: true })
		const error = denial(() => assertAssurance(key, SESSION, { now: NOW }))
		expect(error.origin).toBe("api-key")
		expect(error.message).toContain("Chaves de API não executam esta operação")
	})

	test("segue operando o que não é classificado", () => {
		expect(() => assertAssurance(ctx({ origin: "api-key" }), NO_ASSURANCE, { now: NOW })).not.toThrow()
	})
})

describe("satisfiesAssurance", () => {
	test("é a versão booleana da mesma regra", () => {
		expect(satisfiesAssurance(ctx({ aal: 2, lastFactorAt: NOW }), FRESH, { now: NOW })).toBe(true)
		expect(satisfiesAssurance(ctx(), FRESH, { now: NOW })).toBe(false)
		expect(satisfiesAssurance(ctx(), NO_ASSURANCE, { now: NOW })).toBe(true)
	})
})

describe("pureza", () => {
	test("sem `now`, usa o relógio do processo em SEGUNDOS", () => {
		// Confundir milissegundos com segundos aqui faria toda elevação parecer vencida há 56
		// anos — e o piso `fresh` rejeitaria todo mundo, sempre.
		const nowSeconds = Math.floor(Date.now() / 1000)
		expect(() => assertAssurance(ctx({ aal: 2, lastFactorAt: nowSeconds - 60 }), FRESH)).not.toThrow()
	})

	test("não muta o contexto recebido", () => {
		const original = ctx({ aal: 2, lastFactorAt: NOW - 10 })
		const snapshot = JSON.stringify(original)
		assertAssurance(original, FRESH, { now: NOW })
		expect(JSON.stringify(original)).toBe(snapshot)
	})
})
