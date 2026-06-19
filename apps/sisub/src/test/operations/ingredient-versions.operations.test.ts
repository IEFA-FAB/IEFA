/**
 * Regressão happy-path — operations de VERSIONAMENTO DE INSUMOS (@iefa/sisub-domain).
 * Foco: shape do snapshot, numeração incremental de versão, dedup (sem mudança → null),
 * listagem desc e restauração ao estado de uma versão.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { buildIngredientSnapshot, listIngredientVersions, recordIngredientVersion, restoreIngredientVersion, updateIngredient } from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("ingredient-versions operations (regressão)", () => {
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

	test("buildIngredientSnapshot reflete os campos do insumo (shape)", async () => {
		if (!reachable || !seeder || !db) return
		const descr = uid("[TEST] Snap ")
		const ingredientId = await seeder.seedIngredient({ measureUnit: "KG", correctionFactor: 1.5 })
		await updateIngredient(db, ctx, { id: ingredientId, description: descr, measureUnit: "KG", correctionFactor: 1.5 })

		const snap = await buildIngredientSnapshot(db, ingredientId)

		expect(snap.ingredient.description).toBe(descr)
		expect(snap.ingredient.measure_unit).toBe("KG")
		expect(Number(snap.ingredient.correction_factor)).toBe(1.5)
		expect(Array.isArray(snap.nutrients)).toBe(true)
		expect(Array.isArray(snap.product_items)).toBe(true)
		expect(Array.isArray(snap.purchase_links)).toBe(true)
	})

	test("recordIngredientVersion numera incremental e dedup retorna null sem mudança", async () => {
		if (!reachable || !seeder || !db) return
		const ingredientId = await seeder.seedIngredient()
		seeder.trackWhere("ingredient_version", "ingredient_id", ingredientId)

		const v1 = await recordIngredientVersion(db, ctx, { ingredientId, changeSummary: uid("[TEST] v ") })
		expect(v1).not.toBeNull()
		expect(v1?.version_number).toBe(1)
		expect(v1?.ingredient_id).toBe(ingredientId)
		expect(v1?.snapshot).toBeTruthy()

		// Sem alteração no insumo → snapshot idêntico → dedup → null
		const dup = await recordIngredientVersion(db, ctx, { ingredientId })
		expect(dup).toBeNull()
	})

	test("listIngredientVersions retorna versões em ordem desc por version_number", async () => {
		if (!reachable || !seeder || !db) return
		const ingredientId = await seeder.seedIngredient()
		seeder.trackWhere("ingredient_version", "ingredient_id", ingredientId)

		await recordIngredientVersion(db, ctx, { ingredientId })
		await updateIngredient(db, ctx, { id: ingredientId, description: uid("[TEST] mudou ") })
		await recordIngredientVersion(db, ctx, { ingredientId })

		const versions = await listIngredientVersions(db, ctx, { ingredientId })
		expect(versions.length).toBeGreaterThanOrEqual(2)
		const nums = versions.map((v) => v.version_number)
		expect(nums).toEqual([...nums].sort((a, b) => b - a)) // desc
	})

	test("restoreIngredientVersion reverte o insumo ao snapshot e registra nova versão", async () => {
		if (!reachable || !seeder || !db) return
		const d1 = uid("[TEST] D1 ")
		const ingredientId = await seeder.seedIngredient()
		seeder.trackWhere("ingredient_version", "ingredient_id", ingredientId)
		await updateIngredient(db, ctx, { id: ingredientId, description: d1 })

		const v1 = await recordIngredientVersion(db, ctx, { ingredientId })
		expect(v1).not.toBeNull()

		// muda o insumo e versiona de novo
		await updateIngredient(db, ctx, { id: ingredientId, description: uid("[TEST] D2 ") })
		await recordIngredientVersion(db, ctx, { ingredientId })

		// restaura para v1
		const restored = await restoreIngredientVersion(db, ctx, { ingredientId, versionId: v1?.id ?? "" })
		expect(restored).not.toBeNull()

		const snapAfter = await buildIngredientSnapshot(db, ingredientId)
		expect(snapAfter.ingredient.description).toBe(d1)
	})
})
