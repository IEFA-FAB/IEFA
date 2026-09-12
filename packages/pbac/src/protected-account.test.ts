import { describe, expect, test } from "bun:test"
import { type AssuranceReachability, isProtectedAccount } from "./protected-account.ts"
import type { AppModule, UserPermission } from "./types.ts"

function permission(module: AppModule, level: number, scope: Partial<UserPermission> = {}): UserPermission {
	return { module, level, mess_hall_id: null, kitchen_id: null, unit_id: null, ...scope }
}

/**
 * Projeção equivalente à que `assuranceReachability()` do sisub produz hoje: a execução
 * orçamentária exige `unit` nível 2 (`empenho.fn.ts:137` → `requireUnitScope(2, …)`) e a
 * administração de permissões exige `admin` nível 2. O teste do contrato que prova que o
 * sisub DERIVA exatamente isto do registro vive lá, em `assurance-registry.contract.test.ts`;
 * aqui se testa a função pura, com a lista como entrada.
 */
const REACHABILITY: AssuranceReachability[] = [
	{ module: "admin", level: 2 },
	{ module: "unit", level: 2 },
]

describe("isProtectedAccount", () => {
	test("`unit` nível 2 é conta protegida — é quem empenha, liquida e paga", () => {
		expect(isProtectedAccount([permission("unit", 2)], REACHABILITY)).toBe(true)
	})

	test("`unit` nível 3 também é — nível maior alcança o mesmo", () => {
		expect(isProtectedAccount([permission("unit", 3)], REACHABILITY)).toBe(true)
	})

	test("só `diner` NÃO é conta protegida — o comensal não alcança nada classificado", () => {
		expect(isProtectedAccount([permission("diner", 1)], REACHABILITY)).toBe(false)
	})

	test("`diner` nível 3 continua não sendo — o critério é o módulo, não o número do nível", () => {
		// É este o erro que a D9 corrige: amarrar fator reserva a "nível 3" cegava para o
		// operador de empenho, que é `unit` nível 2.
		expect(isProtectedAccount([permission("diner", 3)], REACHABILITY)).toBe(false)
	})

	test("`unit` nível 1 não é — leitura orçamentária não move dinheiro", () => {
		expect(isProtectedAccount([permission("unit", 1)], REACHABILITY)).toBe(false)
	})

	test("permissão escopada numa unidade basta — alcançar o empenho de UMA unidade é alcançar o empenho", () => {
		expect(isProtectedAccount([permission("unit", 2, { unit_id: 7 })], REACHABILITY)).toBe(true)
	})

	test("um módulo alcançado entre vários não-alcançados basta", () => {
		expect(isProtectedAccount([permission("kitchen", 3), permission("messhall", 2), permission("admin", 2)], REACHABILITY)).toBe(true)
	})

	test("deny sem escopo no módulo derruba a conta da lista", () => {
		expect(isProtectedAccount([permission("unit", 2), permission("unit", 0)], REACHABILITY)).toBe(false)
	})

	test("deny escopado NÃO derruba — a consulta é sem escopo e o allow sobrevive em outro escopo", () => {
		const permissions = [permission("unit", 2, { unit_id: 7 }), permission("unit", 2, { unit_id: 9 }), permission("unit", 0, { unit_id: 9 })]
		expect(isProtectedAccount(permissions, REACHABILITY)).toBe(true)
	})

	test("sem permissão nenhuma não é protegida", () => {
		expect(isProtectedAccount([], REACHABILITY)).toBe(false)
	})

	test("lista de alcance vazia não protege ninguém — é o rollback natural do registro todo em `none`", () => {
		expect(isProtectedAccount([permission("admin", 3), permission("unit", 3)], [])).toBe(false)
	})
})
