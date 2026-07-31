import { describe, expect, test } from "bun:test"
import { AttachPolicySchema, CreatePolicySchema, PolicyStatementInputSchema } from "./policies.ts"

const UUID = "550e8400-e29b-41d4-a716-446655440000"

describe("PolicyStatementInputSchema", () => {
	test("aceita statement sem escopo", () => {
		expect(PolicyStatementInputSchema.safeParse({ module: "global", level: 1 }).success).toBe(true)
	})

	test("aceita statement com um escopo", () => {
		expect(PolicyStatementInputSchema.safeParse({ module: "kitchen", level: 2, kitchen_id: 7 }).success).toBe(true)
	})

	test("rejeita statement com dois escopos", () => {
		// Espelha a check constraint do banco: dois escopos não têm significado definido na
		// resolução, e o erro de constraint cru seria ilegível na UI.
		const result = PolicyStatementInputSchema.safeParse({ module: "kitchen", level: 2, kitchen_id: 7, unit_id: 3 })

		expect(result.success).toBe(false)
	})

	test("rejeita statement com os três escopos", () => {
		expect(PolicyStatementInputSchema.safeParse({ module: "kitchen", level: 2, kitchen_id: 7, unit_id: 3, mess_hall_id: 5 }).success).toBe(false)
	})

	test("aceita nível 0 (deny explícito)", () => {
		expect(PolicyStatementInputSchema.safeParse({ module: "global", level: 0 }).success).toBe(true)
	})

	test("rejeita nível negativo ou acima de 3", () => {
		expect(PolicyStatementInputSchema.safeParse({ module: "global", level: -1 }).success).toBe(false)
		expect(PolicyStatementInputSchema.safeParse({ module: "global", level: 4 }).success).toBe(false)
	})

	test("rejeita módulo desconhecido", () => {
		expect(PolicyStatementInputSchema.safeParse({ module: "inexistente", level: 1 }).success).toBe(false)
	})

	test("rejeita escopo zero ou negativo", () => {
		expect(PolicyStatementInputSchema.safeParse({ module: "kitchen", level: 2, kitchen_id: 0 }).success).toBe(false)
		expect(PolicyStatementInputSchema.safeParse({ module: "kitchen", level: 2, kitchen_id: -1 }).success).toBe(false)
	})
})

describe("CreatePolicySchema", () => {
	test("aceita nome e descrição", () => {
		expect(CreatePolicySchema.safeParse({ name: "Operador de Rancho", description: "Acesso do fiscal" }).success).toBe(true)
	})

	test("aceita sem descrição", () => {
		expect(CreatePolicySchema.safeParse({ name: "Somente leitura" }).success).toBe(true)
	})

	test("rejeita nome curto demais", () => {
		expect(CreatePolicySchema.safeParse({ name: "ab" }).success).toBe(false)
	})
})

describe("AttachPolicySchema", () => {
	test("exige uuid nos dois lados", () => {
		expect(AttachPolicySchema.safeParse({ userId: UUID, policyId: UUID }).success).toBe(true)
		expect(AttachPolicySchema.safeParse({ userId: "nao-uuid", policyId: UUID }).success).toBe(false)
	})
})
