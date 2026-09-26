import { describe, expect, test } from "bun:test"
import { CreateIngredientItemSchema, CreateIngredientSchema, UpdateIngredientSchema } from "./ingredients.ts"

const UUID = "550e8400-e29b-41d4-a716-446655440000"

describe("unidade do insumo na entrada", () => {
	test("vira código do catálogo em maiúscula", () => {
		expect(CreateIngredientSchema.parse({ description: "Arroz", measureUnit: " kg " }).measureUnit).toBe("KG")
	})

	test('"Selecione" (string vazia) grava NULL, não ""', () => {
		expect(CreateIngredientSchema.parse({ description: "Arroz", measureUnit: "" }).measureUnit).toBeNull()
		expect(CreateIngredientSchema.parse({ description: "Arroz", measureUnit: "  " }).measureUnit).toBeNull()
		expect(CreateIngredientSchema.parse({ description: "Arroz", measureUnit: null }).measureUnit).toBeNull()
	})

	test("ausente continua ausente: o update não apaga a unidade que o payload nem trouxe", () => {
		const parsed = UpdateIngredientSchema.parse({ id: UUID, description: "Arroz" })
		expect("measureUnit" in parsed).toBe(false)
	})
})

describe("unidade de embalagem do item", () => {
	test("só apara e troca vazio por NULL: é texto livre, não código", () => {
		expect(CreateIngredientItemSchema.parse({ purchaseMeasureUnit: " maço " }).purchaseMeasureUnit).toBe("maço")
		expect(CreateIngredientItemSchema.parse({ purchaseMeasureUnit: "" }).purchaseMeasureUnit).toBeNull()
		expect("purchaseMeasureUnit" in CreateIngredientItemSchema.parse({})).toBe(false)
	})
})
