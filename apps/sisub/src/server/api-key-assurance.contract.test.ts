/**
 * Contrato do requisito "Credencial de API nunca satisfaz exigência de garantia", do lado do
 * sisub.
 *
 * O irmão no `apps/sisub-mcp` prova a mesma coisa onde a chave é apresentada (`auth.test.ts`,
 * `assurance.test.ts`). Aqui a prova é contra o REGISTRO: seja qual for a classificação que o
 * repositório venha a ter, nenhuma entrada dele é alcançável por uma credencial de origem
 * `api-key`. Um teste que citasse uma lista de operações ficaria desatualizado no dia em que a
 * lista crescesse — este varre o registro inteiro, sempre.
 *
 * Por que os dois lados: a chave nasce no sisub (`createMcpKeyFn`) e é usada no MCP. Fechar só
 * a apresentação deixaria a criação livre; fechar só a criação deixaria a chave que já existe.
 */

import { AssuranceRequiredError, type AssuranceRequirement, assertAssurance, satisfiesAssurance, type UserContext } from "@iefa/pbac"
import { describe, expect, test } from "vitest"
import { assuranceFor, classifiedOperations } from "./assurance-registry"

const NOW = Math.floor(Date.now() / 1000)

/** Contexto de chave de API, no melhor cenário POSSÍVEL para ela. */
function apiKeyContext(overrides: Partial<UserContext> = {}): UserContext {
	return { userId: "u-1", permissions: [], aal: 1, lastFactorAt: null, origin: "api-key", ...overrides }
}

function requirementOf(operation: string): AssuranceRequirement {
	const entry = assuranceFor(operation)
	if (!entry || entry.require === "none") throw new Error(`${operation} não está classificada`)
	return { require: entry.require, reason: entry.reason }
}

describe("chave de API contra o registro de classificação", () => {
	test("o registro tem operação classificada — o teste não é vacuoso", () => {
		expect(classifiedOperations().length).toBeGreaterThan(10)
	})

	test("nenhuma operação classificada é satisfeita por credencial de API", () => {
		// Inclusive com AAL2 e elevação recém-feita: se um dia alguém popular esses campos a
		// partir de uma chave, a ORIGEM continua barrando. É a única barreira que não depende
		// de ninguém ter lembrado de deixar `aal` em 1.
		const forjado = apiKeyContext({ aal: 2, lastFactorAt: NOW, hasVerifiedFactor: true })

		const passaram = classifiedOperations()
			.map(({ operation }) => operation)
			.filter((operation) => satisfiesAssurance(forjado, requirementOf(operation), { now: NOW }))

		expect(passaram, "operação classificada alcançável por chave de API").toEqual([])
	})

	test("a negativa diz que chaves de API não executam a operação", () => {
		try {
			assertAssurance(apiKeyContext(), requirementOf("createMcpKeyFn"), { now: NOW })
			expect.unreachable("a chave de API deveria ter sido barrada")
		} catch (error) {
			expect(error).toBeInstanceOf(AssuranceRequiredError)
			const denial = error as AssuranceRequiredError
			expect(denial.origin).toBe("api-key")
			expect(denial.message).toContain("Chaves de API não executam esta operação")
			// O `reason` da operação continua visível: quem lê o erro sabe O QUE foi barrado.
			expect(denial.message).toContain(denial.reason)
		}
	})

	test("criar chave de API é `fresh` — a credencial de prazo longo não se cria a si mesma sem prova", () => {
		// Fechar o uso da chave e deixar a CRIAÇÃO livre seria fechar a porta e deixar a chave
		// na fechadura: quem tomasse uma sessão criaria a própria credencial de prazo longo.
		expect(assuranceFor("createMcpKeyFn")?.require).toBe("fresh")
	})

	test("sem exigência, a chave de API continua operando normalmente", () => {
		// O piso fecha a operação sensível, não a integração inteira — é o segundo cenário do
		// requisito, e sem ele o contrato acima poderia ser satisfeito barrando tudo.
		expect(satisfiesAssurance(apiKeyContext(), { require: "none" }, { now: NOW })).toBe(true)
		expect(assuranceFor("upsertForecastFn")?.require).toBe("none")
	})
})
