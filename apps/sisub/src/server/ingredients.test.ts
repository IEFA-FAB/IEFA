import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createSisubReachabilityClient, createSisubServiceClient, describeSupabaseIntegration, getSupabaseTestEnv } from "@/test/supabase"
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

// ============================================================================
// Integração — requer VITE_SISUB_SUPABASE_URL + SISUB_SUPABASE_SECRET_KEY
// ============================================================================

const supabaseEnv = getSupabaseTestEnv()

async function canReachSupabase() {
	if (!supabaseEnv) return false
	try {
		const supabase = createSisubReachabilityClient(supabaseEnv)
		const { error } = await supabase.from("ingredient").select("id").limit(1)
		return !error
	} catch {
		return false
	}
}

describeSupabaseIntegration("ingredient CRUD (integração)", () => {
	let reachable = false
	let testIngredientId: string | null = null

	beforeAll(async () => {
		reachable = await canReachSupabase()
	})

	afterAll(async () => {
		if (!reachable || !testIngredientId || !supabaseEnv) return
		const supabase = createSisubServiceClient(supabaseEnv)
		await supabase.from("ingredient").update({ deleted_at: new Date().toISOString() }).eq("id", testIngredientId)
	})

	test("cria insumo com payload válido", async () => {
		if (!reachable || !supabaseEnv) return
		const supabase = createSisubServiceClient(supabaseEnv)
		const payload = {
			description: "[TEST] Insumo de Teste Automatizado",
			measure_unit: "KG",
			correction_factor: 1.0,
		}
		const { data, error } = await supabase.from("ingredient").insert(payload).select().single()
		expect(error).toBeNull()
		expect(data).not.toBeNull()
		expect(data?.description).toBe(payload.description)
		testIngredientId = data?.id ?? null
	})

	test("atualiza insumo existente com campos válidos", async () => {
		if (!reachable || !testIngredientId || !supabaseEnv) return
		const supabase = createSisubServiceClient(supabaseEnv)
		const update = {
			description: "[TEST] Insumo Atualizado",
			measure_unit: "LT",
			correction_factor: 1.05,
			ceafa_id: null,
		}
		const { data, error } = await supabase.from("ingredient").update(update).eq("id", testIngredientId).select().single()
		expect(error).toBeNull()
		expect(data?.description).toBe(update.description)
		expect(data?.measure_unit).toBe("LT")
	})

	test("atualiza insumo sem ceafa_id não quebra (null aceito)", async () => {
		if (!reachable || !testIngredientId || !supabaseEnv) return
		const supabase = createSisubServiceClient(supabaseEnv)
		const { error } = await supabase.from("ingredient").update({ ceafa_id: null }).eq("id", testIngredientId).select().single()
		expect(error).toBeNull()
	})

	test("falha ao referenciar ceafa_id inexistente", async () => {
		if (!reachable || !testIngredientId || !supabaseEnv) return
		const supabase = createSisubServiceClient(supabaseEnv)
		const { error } = await supabase
			.from("ingredient")
			.update({ ceafa_id: "00000000-dead-beef-0000-000000000000" })
			.eq("id", testIngredientId)
			.select()
			.single()
		expect(error).not.toBeNull()
	})
})
