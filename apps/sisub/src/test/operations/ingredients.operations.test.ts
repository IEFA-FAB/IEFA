/**
 * Regressão happy-path — operations de INSUMOS (@iefa/sisub-domain).
 * Cobre folders, insumos, itens de produto, nutrientes, CEAFA e CATMAT.
 * Foco: filtro deleted_at, filtro por folder, normalização de join (purchase_item),
 * upsert de nutrientes e busca (ilike) em CEAFA/CATMAT.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
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
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("ingredients operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	// Ops já migradas para Drizzle recebem `db` (pooler); o seeder/cleanup seguem no client Supabase.
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("ingredient")
		reachable = s.reachable
		if (s.client) client = s.client
		const url = getSisubDatabaseUrl()
		if (reachable && url) {
			const t = createSisubTestDb(url)
			db = t.db
			closeDb = t.close
		}
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	afterAll(async () => {
		await closeDb?.()
	})

	// ── Folders ────────────────────────────────────────────────────────────────

	test("createFolder/listFolders/updateFolder e soft-delete + restore", async () => {
		if (!reachable || !seeder || !db) return
		const descr = uid("[TEST] Pasta ")
		const folder = await createFolder(db, ctx, { description: descr, parentId: null })
		seeder.track("folder", folder.id)
		expect(folder.description).toBe(descr)

		const list = await listFolders(db, ctx, {})
		expect(list.map((f) => f.id)).toContain(folder.id)

		const novoDescr = uid("[TEST] Pasta Renomeada ")
		const updated = await updateFolder(db, ctx, { id: folder.id, description: novoDescr, parentId: null })
		expect(updated.description).toBe(novoDescr)

		await deleteFolder(db, ctx, { id: folder.id })
		expect((await listFolders(db, ctx, {})).map((f) => f.id)).not.toContain(folder.id)
		expect((await listFolders(db, ctx, { includeDeleted: true })).map((f) => f.id)).toContain(folder.id)

		await restoreFolder(db, ctx, { id: folder.id })
		expect((await listFolders(db, ctx, {})).map((f) => f.id)).toContain(folder.id)
	})

	// ── Ingredients ──────────────────────────────────────────────────────────────

	test("createIngredient/fetchIngredient round-trip + mapeamento de campos", async () => {
		if (!reachable || !seeder || !db) return
		const folderId = await seeder.seedFolder()
		const descr = uid("[TEST] Insumo ")

		const created = await createIngredient(db, ctx, {
			description: descr,
			folderId,
			measureUnit: "KG",
			correctionFactor: 1.2,
		})
		seeder.track("ingredient", created.id)

		const fetched = await fetchIngredient(db, ctx, { id: created.id })
		expect(fetched.id).toBe(created.id)
		expect(fetched.description).toBe(descr)
		expect(fetched.folder_id).toBe(folderId)
		expect(fetched.measure_unit).toBe("KG")
	})

	test("listIngredients filtra por folder e respeita deleted_at; update + restore", async () => {
		if (!reachable || !seeder || !db) return
		const folderId = await seeder.seedFolder()
		const id = await seeder.seedIngredient({ folderId })

		const naPasta = await listIngredients(db, ctx, { folderId })
		expect(naPasta.map((i) => i.id)).toContain(id)

		const novoDescr = uid("[TEST] Insumo Atualizado ")
		const updated = await updateIngredient(db, ctx, { id, description: novoDescr, folderId, measureUnit: "L" })
		expect(updated.description).toBe(novoDescr)
		expect(updated.measure_unit).toBe("L")

		await deleteIngredient(db, ctx, { id })
		expect((await listIngredients(db, ctx, { folderId })).map((i) => i.id)).not.toContain(id)
		expect((await listIngredients(db, ctx, { folderId, includeDeleted: true })).map((i) => i.id)).toContain(id)

		await restoreIngredient(db, ctx, { id })
		expect((await listIngredients(db, ctx, { folderId })).map((i) => i.id)).toContain(id)
	})

	// ── Ingredient items ─────────────────────────────────────────────────────────

	test("createIngredientItem/listIngredientItems normaliza purchase_item e soft-delete", async () => {
		if (!reachable || !seeder || !db) return
		const ingredientId = await seeder.seedIngredient()

		const item = await createIngredientItem(db, ctx, {
			ingredientId,
			description: uid("[TEST] Item "),
			purchaseMeasureUnit: "UN",
			unitContentQuantity: 1,
		})
		seeder.track("ingredient_item", item.id)

		const list = await listIngredientItems(db, ctx, { ingredientId })
		const found = list.find((i) => i.id === item.id)
		expect(found).toBeDefined()
		expect(found).toHaveProperty("purchase_item") // normalizado (null quando sem vínculo)
		expect(found?.purchase_item).toBeNull()

		const novoDescr = uid("[TEST] Item Atualizado ")
		const updated = await updateIngredientItem(db, ctx, { id: item.id, ingredientId, description: novoDescr })
		expect(updated.description).toBe(novoDescr)

		await deleteIngredientItem(db, ctx, { id: item.id })
		expect((await listIngredientItems(db, ctx, { ingredientId })).map((i) => i.id)).not.toContain(item.id)
	})

	// ── Nutrientes ─────────────────────────────────────────────────────────────

	test("listNutrients lista o catálogo e setIngredientNutrients faz upsert (read-back)", async () => {
		if (!reachable || !seeder || !db) return
		const nutrientId = await seeder.seedNutrient()
		const ingredientId = await seeder.seedIngredient()

		const catalogo = await listNutrients(db, ctx)
		expect(catalogo.map((n) => n.id)).toContain(nutrientId)

		await setIngredientNutrients(db, ctx, { ingredientId, nutrients: [{ nutrientId, nutrientValue: 42 }] })
		seeder.trackWhere("ingredient_nutrient", "ingredient_id", ingredientId)

		const linked = await listIngredientNutrients(db, ctx, { ingredientId })
		const row = linked.find((r) => r.nutrient_id === nutrientId)
		expect(row).toBeDefined()
		expect(Number(row?.nutrient_value)).toBe(42)
		expect(row?.nutrient?.id).toBe(nutrientId) // join aninhado preservado
	})

	// ── Buscas (CEAFA / CATMAT) ──────────────────────────────────────────────────

	test("listCeafa encontra por ilike na descrição", async () => {
		if (!reachable || !seeder || !db) return
		const descr = uid("[TEST]CEAFA")
		await seeder.seedCeafa({ description: descr })

		const result = await listCeafa(db, ctx, { search: descr })
		expect(result.some((c) => c.description === descr)).toBe(true)
	})

	test("listCatmatItems encontra item ativo por descrição (ilike)", async () => {
		if (!reachable || !seeder || !db) return
		const descricao = uid("[TEST]CATMAT")
		const codigo = 999_000_000 + (Number.parseInt(descricao.split("-")[1] ?? "1", 10) || 1)
		// compras_material_item foi movida para o schema compras_gov_integration
		// (split de schemas por domínio); seed/cleanup apontam para lá. A leitura
		// de produção (listCatmatItems) cruza os schemas via Drizzle.
		const comprasGov = client.schema("compras_gov_integration")
		const { error } = await comprasGov.from("compras_material_item").insert({ codigo_item: codigo, descricao_item: descricao, status_item: true })
		if (error) throw new Error(`seed compras_material_item failed: ${error.message}`)
		seeder.trackFn(async () => {
			await comprasGov.from("compras_material_item").delete().eq("codigo_item", codigo)
		})

		const result = await listCatmatItems(db, ctx, { search: descricao })
		expect(result.some((c) => c.codigo_item === codigo)).toBe(true)
	})

	test("listCatmatItems retorna vazio para termo curto (< 2 chars)", async () => {
		if (!reachable || !seeder || !db) return
		const result = await listCatmatItems(db, ctx, { search: "a" })
		expect(result).toEqual([])
	})
})
