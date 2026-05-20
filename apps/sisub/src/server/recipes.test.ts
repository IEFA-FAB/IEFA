import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { CreateRecipeSchema, CreateRecipeVersionSchema, IngredientSchema } from "@iefa/sisub-domain"
import { createSisubReachabilityClient, createSisubServiceClient, describeSupabaseIntegration, getSupabaseTestEnv } from "@/test/supabase"

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

describe("CreateRecipeVersionSchema", () => {
	test("aceita versão válida com baseRecipeId", () => {
		const result = CreateRecipeVersionSchema.safeParse({
			name: "Arroz Integral v2",
			portionYield: 100,
			baseRecipeId: UUID_A,
			version: 2,
		})
		expect(result.success).toBe(true)
	})

	test("rejeita version zero ou negativo", () => {
		expect(
			CreateRecipeVersionSchema.safeParse({
				name: "Teste",
				portionYield: 100,
				baseRecipeId: UUID_A,
				version: 0,
			}).success
		).toBe(false)
	})

	test("rejeita baseRecipeId inválido", () => {
		const result = CreateRecipeVersionSchema.safeParse({
			name: "Teste",
			portionYield: 100,
			baseRecipeId: "nao-uuid",
			version: 1,
		})
		expect(result.success).toBe(false)
	})
})

// ============================================================================
// Integração — requer VITE_SISUB_SUPABASE_URL + SISUB_SUPABASE_SECRET_KEY
// ============================================================================

const supabaseEnv = getSupabaseTestEnv()

async function canReachSupabase() {
	if (!supabaseEnv) return false
	try {
		const supabase = createSisubReachabilityClient(supabaseEnv)
		const { error } = await supabase.from("recipes").select("id").limit(1)
		return !error
	} catch {
		return false
	}
}

describeSupabaseIntegration("recipe CRUD (integração)", () => {
	let reachable = false
	let testRecipeId: string | null = null
	let testIngredientId: string | null = null

	beforeAll(async () => {
		reachable = await canReachSupabase()
		if (!reachable || !supabaseEnv) return

		const supabase = createSisubServiceClient(supabaseEnv)
		const { data } = await supabase
			.from("ingredient")
			.insert({ description: "[TEST-RECIPE] Insumo para teste de receita", measure_unit: "KG" })
			.select("id")
			.single()
		testIngredientId = data?.id ?? null
	})

	afterAll(async () => {
		if (!reachable || !supabaseEnv) return
		const supabase = createSisubServiceClient(supabaseEnv)
		if (testRecipeId) {
			await supabase.from("recipes").update({ deleted_at: new Date().toISOString() }).eq("id", testRecipeId)
		}
		if (testIngredientId) {
			await supabase.from("ingredient").update({ deleted_at: new Date().toISOString() }).eq("id", testIngredientId)
		}
	})

	test("cria receita global com ingrediente", async () => {
		if (!reachable || !testIngredientId || !supabaseEnv) return
		const supabase = createSisubServiceClient(supabaseEnv)

		const { data: recipe, error: recipeErr } = await supabase
			.from("recipes")
			.insert({
				name: "[TEST] Receita de Teste Automatizado",
				portion_yield: 100,
				kitchen_id: null,
				version: 1,
			})
			.select()
			.single()

		expect(recipeErr).toBeNull()
		expect(recipe?.name).toBe("[TEST] Receita de Teste Automatizado")
		testRecipeId = recipe?.id ?? null

		if (recipe && testIngredientId) {
			const { error: ingErr } = await supabase.from("recipe_ingredients").insert({
				recipe_id: recipe.id,
				ingredient_id: testIngredientId,
				net_quantity: 150,
				is_optional: false,
				priority_order: 0,
			})
			expect(ingErr).toBeNull()
		}
	})

	test("cria nova versão de receita existente", async () => {
		if (!reachable || !testRecipeId || !supabaseEnv) return
		const supabase = createSisubServiceClient(supabaseEnv)

		const { data, error } = await supabase
			.from("recipes")
			.insert({
				name: "[TEST] Receita de Teste Automatizado",
				portion_yield: 120,
				kitchen_id: null,
				base_recipe_id: testRecipeId,
				version: 2,
			})
			.select()
			.single()

		expect(error).toBeNull()
		expect(data?.version).toBe(2)
		expect(data?.base_recipe_id).toBe(testRecipeId)

		if (data) {
			await supabase.from("recipes").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)
		}
	})

	test("busca receita por id retorna dados corretos", async () => {
		if (!reachable || !testRecipeId || !supabaseEnv) return
		const supabase = createSisubServiceClient(supabaseEnv)

		const { data, error } = await supabase.from("recipes").select("*, recipe_ingredients(*)").eq("id", testRecipeId).is("deleted_at", null).single()

		expect(error).toBeNull()
		expect(data?.id).toBe(testRecipeId)
	})
})
