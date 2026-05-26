import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createSisubReachabilityClient, createSisubServiceClient, describeSupabaseIntegration, getSupabaseTestEnv } from "@/test/supabase"
import { PurchaseItemIngredientWriteSchema, PurchaseItemWriteSchema } from "./purchase_item.schemas"

// UUIDs válidos (Zod v4 requer version bits [1-8] e variant bits [89ab])
const UUID_A = "550e8400-e29b-41d4-a716-446655440000"
const UUID_B = "6ba7b810-9dad-41d1-80b4-00c04fd430c8"

// ============================================================================
// Unit — PurchaseItemWriteSchema
// ============================================================================

describe("PurchaseItemWriteSchema", () => {
	test("aceita payload completo válido", () => {
		const result = PurchaseItemWriteSchema.safeParse({
			description: "Arroz Tipo 1 - 5kg",
			purchase_measure_unit: "KG",
			catmat_item_codigo: 327430,
			catmat_item_descricao: "ARROZ, TIPO 1",
			catmat_match_status: "matched",
			catmat_match_score: 0.97,
			gpc_segment_code: "50000000",
			gpc_family_code: "50180000",
			gpc_class_code: "50181900",
			gpc_brick_code: "50181901",
			unit_price: 12.5,
		})
		expect(result.success).toBe(true)
	})

	test("aceita payload mínimo (só description)", () => {
		const result = PurchaseItemWriteSchema.safeParse({ description: "Feijão Carioca" })
		expect(result.success).toBe(true)
	})

	test("rejeita description ausente", () => {
		const result = PurchaseItemWriteSchema.safeParse({})
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error.issues[0]?.path).toContain("description")
		}
	})

	test("rejeita description vazia", () => {
		const result = PurchaseItemWriteSchema.safeParse({ description: "" })
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error.issues[0]?.path).toContain("description")
		}
	})

	test("aceita catmat_item_codigo positivo", () => {
		expect(PurchaseItemWriteSchema.safeParse({ description: "X", catmat_item_codigo: 1 }).success).toBe(true)
	})

	test("aceita catmat_item_codigo null", () => {
		expect(PurchaseItemWriteSchema.safeParse({ description: "X", catmat_item_codigo: null }).success).toBe(true)
	})

	test("rejeita catmat_item_codigo negativo", () => {
		expect(PurchaseItemWriteSchema.safeParse({ description: "X", catmat_item_codigo: -1 }).success).toBe(false)
	})

	test("rejeita catmat_item_codigo zero", () => {
		expect(PurchaseItemWriteSchema.safeParse({ description: "X", catmat_item_codigo: 0 }).success).toBe(false)
	})

	test("aceita catmat_match_status válidos", () => {
		for (const status of ["pending", "matched", "review", "no_match", "skip"] as const) {
			expect(PurchaseItemWriteSchema.safeParse({ description: "X", catmat_match_status: status }).success).toBe(true)
		}
	})

	test("rejeita catmat_match_status inválido", () => {
		expect(PurchaseItemWriteSchema.safeParse({ description: "X", catmat_match_status: "approved" }).success).toBe(false)
	})

	test("aceita catmat_match_score 0 e 1", () => {
		expect(PurchaseItemWriteSchema.safeParse({ description: "X", catmat_match_score: 0 }).success).toBe(true)
		expect(PurchaseItemWriteSchema.safeParse({ description: "X", catmat_match_score: 1 }).success).toBe(true)
	})

	test("rejeita catmat_match_score fora de [0, 1]", () => {
		expect(PurchaseItemWriteSchema.safeParse({ description: "X", catmat_match_score: -0.1 }).success).toBe(false)
		expect(PurchaseItemWriteSchema.safeParse({ description: "X", catmat_match_score: 1.1 }).success).toBe(false)
	})

	test("aceita unit_price positivo", () => {
		expect(PurchaseItemWriteSchema.safeParse({ description: "X", unit_price: 0.01 }).success).toBe(true)
	})

	test("rejeita unit_price zero ou negativo", () => {
		expect(PurchaseItemWriteSchema.safeParse({ description: "X", unit_price: 0 }).success).toBe(false)
		expect(PurchaseItemWriteSchema.safeParse({ description: "X", unit_price: -5 }).success).toBe(false)
	})
})

// ============================================================================
// Unit — PurchaseItemIngredientWriteSchema
// ============================================================================

describe("PurchaseItemIngredientWriteSchema", () => {
	test("aceita payload completo válido", () => {
		const result = PurchaseItemIngredientWriteSchema.safeParse({
			purchase_item_id: UUID_A,
			ingredient_id: UUID_B,
			conversion_factor: 0.95,
			conversion_notes: "Fator de conversão kg→L",
			is_default: true,
		})
		expect(result.success).toBe(true)
	})

	test("aplica defaults (conversion_factor=1.0, is_default=false)", () => {
		const result = PurchaseItemIngredientWriteSchema.safeParse({
			purchase_item_id: UUID_A,
			ingredient_id: UUID_B,
		})
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.conversion_factor).toBe(1.0)
			expect(result.data.is_default).toBe(false)
		}
	})

	test("rejeita purchase_item_id ausente", () => {
		const result = PurchaseItemIngredientWriteSchema.safeParse({ ingredient_id: UUID_B })
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error.issues[0]?.path).toContain("purchase_item_id")
		}
	})

	test("rejeita ingredient_id ausente", () => {
		const result = PurchaseItemIngredientWriteSchema.safeParse({ purchase_item_id: UUID_A })
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error.issues[0]?.path).toContain("ingredient_id")
		}
	})

	test("rejeita UUID inválido em purchase_item_id", () => {
		const result = PurchaseItemIngredientWriteSchema.safeParse({ purchase_item_id: "nao-uuid", ingredient_id: UUID_B })
		expect(result.success).toBe(false)
	})

	test("rejeita conversion_factor zero ou negativo", () => {
		expect(PurchaseItemIngredientWriteSchema.safeParse({ purchase_item_id: UUID_A, ingredient_id: UUID_B, conversion_factor: 0 }).success).toBe(false)
		expect(PurchaseItemIngredientWriteSchema.safeParse({ purchase_item_id: UUID_A, ingredient_id: UUID_B, conversion_factor: -1 }).success).toBe(false)
	})

	test("aceita conversion_notes null", () => {
		const result = PurchaseItemIngredientWriteSchema.safeParse({
			purchase_item_id: UUID_A,
			ingredient_id: UUID_B,
			conversion_notes: null,
		})
		expect(result.success).toBe(true)
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
		const { error } = await supabase.from("purchase_item").select("id").limit(1)
		return !error
	} catch {
		return false
	}
}

describeSupabaseIntegration("purchase_item CRUD (integração)", () => {
	let reachable = false
	let testIngredientId: string | null = null
	let testPurchaseItemId: string | null = null
	let testJunctionId: string | null = null

	beforeAll(async () => {
		reachable = await canReachSupabase()
		if (!reachable || !supabaseEnv) return

		const supabase = createSisubServiceClient(supabaseEnv)
		const { data } = await supabase
			.from("ingredient")
			.insert({ description: "[TEST-PI] Insumo para teste de item de compra", measure_unit: "KG" })
			.select("id")
			.single()
		testIngredientId = data?.id ?? null
	}, 30_000)

	afterAll(async () => {
		if (!reachable || !supabaseEnv) return
		const supabase = createSisubServiceClient(supabaseEnv)
		if (testJunctionId) {
			await supabase.from("purchase_item_ingredient").delete().eq("id", testJunctionId)
		}
		if (testPurchaseItemId) {
			await supabase.from("purchase_item").delete().eq("id", testPurchaseItemId)
		}
		if (testIngredientId) {
			await supabase.from("ingredient").delete().eq("id", testIngredientId)
		}
	})

	test("cria purchase_item com payload válido", async () => {
		if (!reachable || !supabaseEnv) return
		const supabase = createSisubServiceClient(supabaseEnv)
		const payload = {
			description: "[TEST] Item de Compra Automatizado",
			purchase_measure_unit: "KG",
			unit_price: 10.5,
		}
		const { data, error } = await supabase.from("purchase_item").insert(payload).select().single()
		expect(error).toBeNull()
		expect(data?.description).toBe(payload.description)
		expect(data?.unit_price).toBe(payload.unit_price)
		testPurchaseItemId = data?.id ?? null
	})

	test("atualiza purchase_item (description, unit_price, catmat_match_status)", async () => {
		if (!reachable || !testPurchaseItemId || !supabaseEnv) return
		const supabase = createSisubServiceClient(supabaseEnv)
		const update = {
			description: "[TEST] Item de Compra Atualizado",
			unit_price: 15.0,
			catmat_match_status: "matched" as const,
		}
		const { data, error } = await supabase.from("purchase_item").update(update).eq("id", testPurchaseItemId).select().single()
		expect(error).toBeNull()
		expect(data?.description).toBe(update.description)
		expect(data?.unit_price).toBe(15.0)
		expect(data?.catmat_match_status).toBe("matched")
	})

	test("cria vínculo purchase_item_ingredient (junction)", async () => {
		if (!reachable || !testPurchaseItemId || !testIngredientId || !supabaseEnv) return
		const supabase = createSisubServiceClient(supabaseEnv)
		const { data, error } = await supabase
			.from("purchase_item_ingredient")
			.insert({
				purchase_item_id: testPurchaseItemId,
				ingredient_id: testIngredientId,
				conversion_factor: 1.0,
				is_default: true,
			})
			.select()
			.single()
		expect(error).toBeNull()
		expect(data?.purchase_item_id).toBe(testPurchaseItemId)
		expect(data?.ingredient_id).toBe(testIngredientId)
		testJunctionId = data?.id ?? null
	})

	test("upsert vínculo atualiza conversion_factor sem duplicar", async () => {
		if (!reachable || !testPurchaseItemId || !testIngredientId || !supabaseEnv) return
		const supabase = createSisubServiceClient(supabaseEnv)
		const { data, error } = await supabase
			.from("purchase_item_ingredient")
			.upsert(
				{
					purchase_item_id: testPurchaseItemId,
					ingredient_id: testIngredientId,
					conversion_factor: 0.85,
					is_default: true,
				},
				{ onConflict: "purchase_item_id,ingredient_id" }
			)
			.select()
			.single()
		expect(error).toBeNull()
		expect(data?.conversion_factor).toBe(0.85)

		const { count } = await supabase
			.from("purchase_item_ingredient")
			.select("id", { count: "exact", head: true })
			.eq("purchase_item_id", testPurchaseItemId)
			.eq("ingredient_id", testIngredientId)
		expect(count).toBe(1)
	})

	test("busca purchase_item com vínculos (nested select)", async () => {
		if (!reachable || !testPurchaseItemId || !supabaseEnv) return
		const supabase = createSisubServiceClient(supabaseEnv)
		const { data, error } = await supabase
			.from("purchase_item")
			.select("*, purchase_item_ingredient(id, ingredient_id, conversion_factor, is_default)")
			.eq("id", testPurchaseItemId)
			.single()
		expect(error).toBeNull()
		expect(data?.id).toBe(testPurchaseItemId)
		expect(Array.isArray(data?.purchase_item_ingredient)).toBe(true)
		expect((data?.purchase_item_ingredient as unknown[]).length).toBeGreaterThan(0)
	})

	test("FK constraint rejeita ingredient_id inexistente", async () => {
		if (!reachable || !testPurchaseItemId || !supabaseEnv) return
		const supabase = createSisubServiceClient(supabaseEnv)
		const { error } = await supabase.from("purchase_item_ingredient").insert({
			purchase_item_id: testPurchaseItemId,
			ingredient_id: "00000000-dead-beef-0000-000000000000",
			conversion_factor: 1.0,
		})
		expect(error).not.toBeNull()
	})

	test("soft-delete purchase_item (deleted_at preenchido)", async () => {
		if (!reachable || !testPurchaseItemId || !supabaseEnv) return
		const supabase = createSisubServiceClient(supabaseEnv)
		const deletedAt = new Date().toISOString()
		const { data, error } = await supabase.from("purchase_item").update({ deleted_at: deletedAt }).eq("id", testPurchaseItemId).select().single()
		expect(error).toBeNull()
		expect(data?.deleted_at).not.toBeNull()
	})
})
