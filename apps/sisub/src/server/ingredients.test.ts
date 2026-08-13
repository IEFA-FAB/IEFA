import { describe, expect, test } from "vitest"
import { IngredientItemWriteSchema, IngredientWriteSchema } from "./ingredients.schemas"

// ============================================================================
// Unit — schema validation (sem DB)
// ============================================================================

// UUIDs válidos para testes (Zod v4 exige version bits [1-8] e variant bits [89ab])
const UUID_A = "550e8400-e29b-41d4-a716-446655440000"
const UUID_B = "6ba7b810-9dad-41d1-80b4-00c04fd430c8"

describe("IngredientWriteSchema", () => {
	test("aceita payload completo válido", () => {
		const result = IngredientWriteSchema.safeParse({
			description: "Arroz Branco",
			folder_id: UUID_A,
			measure_unit: "KG",
			correction_factor: 1.12,
			ceafa_id: UUID_B,
		})
		expect(result.success).toBe(true)
	})

	test("aceita payload mínimo (apenas description)", () => {
		const result = IngredientWriteSchema.safeParse({ description: "Feijão" })
		expect(result.success).toBe(true)
	})

	test("aceita campos opcionais como null", () => {
		const result = IngredientWriteSchema.safeParse({
			description: "Macarrão",
			folder_id: null,
			ceafa_id: null,
		})
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.ceafa_id).toBeNull()
			expect(result.data.folder_id).toBeNull()
		}
	})

	test("aceita payload vazio (todos opcionais)", () => {
		const result = IngredientWriteSchema.safeParse({})
		expect(result.success).toBe(true)
	})

	test("rejeita description vazia", () => {
		const result = IngredientWriteSchema.safeParse({ description: "" })
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error.issues[0]?.path).toContain("description")
		}
	})

	test("rejeita ceafa_id com formato inválido (não UUID)", () => {
		const result = IngredientWriteSchema.safeParse({ ceafa_id: "nao-e-uuid" })
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error.issues[0]?.path).toContain("ceafa_id")
		}
	})

	test("rejeita ceafa_id como número (tipo errado)", () => {
		const result = IngredientWriteSchema.safeParse({ ceafa_id: 0 })
		expect(result.success).toBe(false)
	})

	test("rejeita folder_id com formato inválido (não UUID)", () => {
		const result = IngredientWriteSchema.safeParse({ folder_id: "pasta-invalida" })
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error.issues[0]?.path).toContain("folder_id")
		}
	})
})

describe("IngredientItemWriteSchema", () => {
	test("aceita payload válido completo", () => {
		const result = IngredientItemWriteSchema.safeParse({
			ingredient_id: UUID_A,
			description: "Pacote 1kg",
			barcode: "7891234567890",
			purchase_measure_unit: "KG",
			unit_content_quantity: 1.0,
			correction_factor: 1.0,
		})
		expect(result.success).toBe(true)
	})

	test("aceita payload vazio (todos opcionais)", () => {
		expect(IngredientItemWriteSchema.safeParse({}).success).toBe(true)
	})

	test("rejeita ingredient_id com formato inválido", () => {
		const result = IngredientItemWriteSchema.safeParse({ ingredient_id: "nao-uuid" })
		expect(result.success).toBe(false)
	})
})
