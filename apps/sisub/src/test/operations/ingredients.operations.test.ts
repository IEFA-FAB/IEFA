/**
 * Regressão happy-path — operations de INSUMOS (@iefa/sisub-domain).
 * Cobre folders, insumos, itens de produto, nutrientes, CEAFA e CATMAT.
 * Foco: filtro deleted_at, filtro por folder, normalização de join (purchase_item),
 * upsert de nutrientes e busca (ilike) em CEAFA/CATMAT.
 */

import {
	createFolder,
	createIngredient,
	createIngredientItem,
	deleteFolder,
	deleteIngredient,
	deleteIngredientItem,
	fetchIngredient,
	listCatmatItems,
	listCeafa,
	listFolders,
	listIngredientItems,
	listIngredientNutrients,
	listIngredients,
	listNutrients,
	restoreFolder,
	restoreIngredient,
	setIngredientNutrients,
	updateFolder,
	updateIngredient,
	updateIngredientItem,
} from "@iefa/sisub-domain"
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { describeSupabaseIntegration } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("ingredients operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null

	beforeAll(async () => {
		const s = await setupIntegration("ingredient")
		reachable = s.reachable
		if (s.client) client = s.client
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	// ── Folders ────────────────────────────────────────────────────────────────

	test("createFolder/listFolders/updateFolder e soft-delete + restore", async () => {
		if (!reachable || !seeder) return
		const descr = uid("[TEST] Pasta ")
		const folder = await createFolder(client, ctx, { description: descr, parentId: null })
		seeder.track("folder", folder.id)
		expect(folder.description).toBe(descr)

		const list = await listFolders(client, ctx, {})
		expect(list.map((f) => f.id)).toContain(folder.id)

		const novoDescr = uid("[TEST] Pasta Renomeada ")
		const updated = await updateFolder(client, ctx, { id: folder.id, description: novoDescr, parentId: null })
		expect(updated.description).toBe(novoDescr)

		await deleteFolder(client, ctx, { id: folder.id })
		expect((await listFolders(client, ctx, {})).map((f) => f.id)).not.toContain(folder.id)
		expect((await listFolders(client, ctx, { includeDeleted: true })).map((f) => f.id)).toContain(folder.id)

		await restoreFolder(client, ctx, { id: folder.id })
		expect((await listFolders(client, ctx, {})).map((f) => f.id)).toContain(folder.id)
	})

	// ── Ingredients ──────────────────────────────────────────────────────────────

	test("createIngredient/fetchIngredient round-trip + mapeamento de campos", async () => {
		if (!reachable || !seeder) return
		const folderId = await seeder.seedFolder()
		const descr = uid("[TEST] Insumo ")

		const created = await createIngredient(client, ctx, {
			description: descr,
			folderId,
			measureUnit: "KG",
			correctionFactor: 1.2,
		})
		seeder.track("ingredient", created.id)

		const fetched = await fetchIngredient(client, ctx, { id: created.id })
		expect(fetched.id).toBe(created.id)
		expect(fetched.description).toBe(descr)
		expect(fetched.folder_id).toBe(folderId)
		expect(fetched.measure_unit).toBe("KG")
	})

	test("listIngredients filtra por folder e respeita deleted_at; update + restore", async () => {
		if (!reachable || !seeder) return
		const folderId = await seeder.seedFolder()
		const id = await seeder.seedIngredient({ folderId })

		const naPasta = await listIngredients(client, ctx, { folderId })
		expect(naPasta.map((i) => i.id)).toContain(id)

		const novoDescr = uid("[TEST] Insumo Atualizado ")
		const updated = await updateIngredient(client, ctx, { id, description: novoDescr, folderId, measureUnit: "L" })
		expect(updated.description).toBe(novoDescr)
		expect(updated.measure_unit).toBe("L")

		await deleteIngredient(client, ctx, { id })
		expect((await listIngredients(client, ctx, { folderId })).map((i) => i.id)).not.toContain(id)
		expect((await listIngredients(client, ctx, { folderId, includeDeleted: true })).map((i) => i.id)).toContain(id)

		await restoreIngredient(client, ctx, { id })
		expect((await listIngredients(client, ctx, { folderId })).map((i) => i.id)).toContain(id)
	})

	// ── Ingredient items ─────────────────────────────────────────────────────────

	test("createIngredientItem/listIngredientItems normaliza purchase_item e soft-delete", async () => {
		if (!reachable || !seeder) return
		const ingredientId = await seeder.seedIngredient()

		const item = await createIngredientItem(client, ctx, {
			ingredientId,
			description: uid("[TEST] Item "),
			purchaseMeasureUnit: "UN",
			unitContentQuantity: 1,
		})
		seeder.track("ingredient_item", item.id)

		const list = await listIngredientItems(client, ctx, { ingredientId })
		const found = list.find((i) => i.id === item.id)
		expect(found).toBeDefined()
		expect(found).toHaveProperty("purchase_item") // normalizado (null quando sem vínculo)
		expect(found?.purchase_item).toBeNull()

		const novoDescr = uid("[TEST] Item Atualizado ")
		const updated = await updateIngredientItem(client, ctx, { id: item.id, ingredientId, description: novoDescr })
		expect(updated.description).toBe(novoDescr)

		await deleteIngredientItem(client, ctx, { id: item.id })
		expect((await listIngredientItems(client, ctx, { ingredientId })).map((i) => i.id)).not.toContain(item.id)
	})

	// ── Nutrientes ─────────────────────────────────────────────────────────────

	test("listNutrients lista o catálogo e setIngredientNutrients faz upsert (read-back)", async () => {
		if (!reachable || !seeder) return
		const nutrientId = await seeder.seedNutrient()
		const ingredientId = await seeder.seedIngredient()

		const catalogo = await listNutrients(client, ctx)
		expect(catalogo.map((n) => n.id)).toContain(nutrientId)

		await setIngredientNutrients(client, ctx, { ingredientId, nutrients: [{ nutrientId, nutrientValue: 42 }] })
		seeder.trackWhere("ingredient_nutrient", "ingredient_id", ingredientId)

		const linked = await listIngredientNutrients(client, ctx, { ingredientId })
		const row = linked.find((r) => r.nutrient_id === nutrientId)
		expect(row).toBeDefined()
		expect(Number(row?.nutrient_value)).toBe(42)
		expect(row?.nutrient?.id).toBe(nutrientId) // join aninhado preservado
	})

	// ── Buscas (CEAFA / CATMAT) ──────────────────────────────────────────────────

	test("listCeafa encontra por ilike na descrição", async () => {
		if (!reachable || !seeder) return
		const descr = uid("[TEST]CEAFA")
		await seeder.seedCeafa({ description: descr })

		const result = await listCeafa(client, ctx, { search: descr })
		expect(result.some((c) => c.description === descr)).toBe(true)
	})

	test("listCatmatItems encontra item ativo por descrição (ilike)", async () => {
		if (!reachable || !seeder) return
		const descricao = uid("[TEST]CATMAT")
		const codigo = 999_000_000 + (Number.parseInt(descricao.split("-")[1] ?? "1", 10) || 1)
		const { error } = await client.from("compras_material_item").insert({ codigo_item: codigo, descricao_item: descricao, status_item: true })
		if (error) throw new Error(`seed compras_material_item failed: ${error.message}`)
		seeder.trackWhere("compras_material_item", "codigo_item", codigo)

		const result = await listCatmatItems(client, ctx, { search: descricao })
		expect(result.some((c) => c.codigo_item === codigo)).toBe(true)
	})

	test("listCatmatItems retorna vazio para termo curto (< 2 chars)", async () => {
		if (!reachable || !seeder) return
		const result = await listCatmatItems(client, ctx, { search: "a" })
		expect(result).toEqual([])
	})
})
