import { CreateRecipeSchema, IngredientSchema, SaveRecipeEditSchema } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"

// UUIDs válidos (Zod v4 requer version bits [1-8] e variant bits [89ab])
const UUID_A = "550e8400-e29b-41d4-a716-446655440000"

// ============================================================================
// Unit — schema validation (sem DB)
// ============================================================================

describe("CreateRecipeSchema", () => {
	test("aceita payload mínimo válido", () => {
		const result = CreateRecipeSchema.safeParse({
			name: "Arroz Branco Simples",
			portionYield: 100,
		})
		expect(result.success).toBe(true)
	})

	test("aceita payload completo", () => {
		const result = CreateRecipeSchema.safeParse({
			name: "Feijão Tropeiro",
			preparationMethod: "Refogar e cozinhar...",
			portionYield: 200,
			preparationTimeMinutes: 45,
			cookingFactor: 0.85,
			kitchenId: null,
			ingredients: [
				{
					ingredientId: UUID_A,
					netQuantity: 150,
					isOptional: false,
					priorityOrder: 0,
				},
			],
		})
		expect(result.success).toBe(true)
	})

	test("rejeita name vazio", () => {
		const result = CreateRecipeSchema.safeParse({ name: "", portionYield: 100 })
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error.issues[0]?.path).toContain("name")
		}
	})

	test("rejeita portionYield zero ou negativo", () => {
		expect(CreateRecipeSchema.safeParse({ name: "Teste", portionYield: 0 }).success).toBe(false)
		expect(CreateRecipeSchema.safeParse({ name: "Teste", portionYield: -10 }).success).toBe(false)
	})

	test("aceita portionYield positivo", () => {
		expect(CreateRecipeSchema.safeParse({ name: "Teste", portionYield: 0.1 }).success).toBe(true)
	})

	test("rejeita preparationTimeMinutes não inteiro", () => {
		const result = CreateRecipeSchema.safeParse({
			name: "Teste",
			portionYield: 100,
			preparationTimeMinutes: 30.5,
		})
		expect(result.success).toBe(false)
	})

	test("aceita kitchenId null (receita global)", () => {
		const result = CreateRecipeSchema.safeParse({
			name: "Receita Global",
			portionYield: 100,
			kitchenId: null,
		})
		expect(result.success).toBe(true)
	})
})

describe("IngredientSchema (em receita)", () => {
	test("rejeita ingredientId inválido (não UUID)", () => {
		const result = IngredientSchema.safeParse({
			ingredientId: "nao-uuid",
			netQuantity: 100,
			isOptional: false,
			priorityOrder: 0,
		})
		expect(result.success).toBe(false)
	})

	test("rejeita netQuantity zero ou negativo", () => {
		const result = IngredientSchema.safeParse({
			ingredientId: UUID_A,
			netQuantity: 0,
			isOptional: false,
			priorityOrder: 0,
		})
		expect(result.success).toBe(false)
	})

	test("rejeita priorityOrder negativo", () => {
		const result = IngredientSchema.safeParse({
			ingredientId: UUID_A,
			netQuantity: 100,
			isOptional: false,
			priorityOrder: -1,
		})
		expect(result.success).toBe(false)
	})
})

describe("SaveRecipeEditSchema", () => {
	test("aceita edição no contexto global", () => {
		const result = SaveRecipeEditSchema.safeParse({
			name: "Arroz Integral",
			portionYield: 100,
			baseRecipeId: UUID_A,
			context: { scope: "global" },
		})
		expect(result.success).toBe(true)
	})

	test("aceita edição no contexto de uma cozinha", () => {
		const result = SaveRecipeEditSchema.safeParse({
			name: "Arroz Integral",
			portionYield: 100,
			baseRecipeId: UUID_A,
			context: { scope: "kitchen", kitchenId: 7 },
		})
		expect(result.success).toBe(true)
	})

	test("rejeita payload sem contexto — não há default", () => {
		// Escolher um default aqui reintroduziria o bug: a edição de uma receita global
		// feita na tela de uma cozinha viraria nova versão global.
		const result = SaveRecipeEditSchema.safeParse({
			name: "Teste",
			portionYield: 100,
			baseRecipeId: UUID_A,
		})
		expect(result.success).toBe(false)
	})

	test("rejeita contexto de cozinha sem kitchenId", () => {
		const result = SaveRecipeEditSchema.safeParse({
			name: "Teste",
			portionYield: 100,
			baseRecipeId: UUID_A,
			context: { scope: "kitchen" },
		})
		expect(result.success).toBe(false)
	})

	test("rejeita baseRecipeId inválido", () => {
		const result = SaveRecipeEditSchema.safeParse({
			name: "Teste",
			portionYield: 100,
			baseRecipeId: "nao-uuid",
			context: { scope: "global" },
		})
		expect(result.success).toBe(false)
	})

	test("não aceita version do cliente — o servidor calcula", () => {
		// A dedup por família mantém a maior versão; com o número vindo do cliente,
		// bastava enviar um valor alto para fixar a própria linha como canônica.
		const result = SaveRecipeEditSchema.safeParse({
			name: "Teste",
			portionYield: 100,
			baseRecipeId: UUID_A,
			context: { scope: "global" },
			version: 9999,
		})
		expect(result.success && "version" in result.data).toBe(false)
	})
})
