/**
 * Segmentação das contratações (change `sisub-procurement-planning-flows`, D3/D4), no banco real.
 *
 * Cenário: uma OM com cozinha e cardápio semanal que usa três insumos em pastas diferentes
 * (Proteínas › Bovinos, Proteínas › Pescados, Bebidas). A OM monta "Carnes" (Proteínas, exceto
 * Pescados) e "Congelados" (Pescados). O anexo de Carnes leva só o bovino.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import {
	addProcurementSegmentRule,
	calculateAtaNeedsForSegment,
	createAtaDraft,
	createProcurementSegment,
	deleteProcurementSegment,
	fetchSegmentationOverview,
	updateAtaDraft,
} from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

/** `created_by` tem FK para auth.users: o ator do teste precisa existir. */
async function actor(s: Seeder) {
	return { ...fullAccessCtx(), userId: await s.seedAuthUser() }
}

describeSupabaseIntegration("segmentação das contratações", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("procurement_segment")
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

	async function scenario(s: Seeder) {
		const unitId = await s.seedUnit()
		const { id: kitchenId } = await s.seedKitchen({ unitId })
		const proteinas = await s.seedFolder()
		const bovinos = await s.seedFolder({ parentId: proteinas })
		const pescados = await s.seedFolder({ parentId: proteinas })
		const bebidas = await s.seedFolder()
		const boi = await s.seedIngredient({ folderId: bovinos })
		const peixe = await s.seedIngredient({ folderId: pescados })
		const suco = await s.seedIngredient({ folderId: bebidas })
		const recipeId = await s.seedRecipe({
			kitchenId,
			portionYield: 1,
			ingredients: [
				{ ingredientId: boi, netQuantity: 0.2 },
				{ ingredientId: peixe, netQuantity: 0.15 },
				{ ingredientId: suco, netQuantity: 0.3 },
			],
		})
		const mealTypeId = await s.seedMealType({ kitchenId })
		const templateId = await s.seedTemplate({ kitchenId, templateType: "weekly" })
		await s.seedTemplateItem({ templateId, mealTypeId, recipeId, dayOfWeek: 1, headcountOverride: 100 })
		return { unitId, kitchenId, templateId, folders: { proteinas, pescados }, ingredients: { boi, peixe, suco } }
	}

	test("regra mais específica vence, item fora fica sem contratação e o anexo leva só a contratação", async () => {
		if (!reachable || !seeder || !db) return
		const ctx = await actor(seeder)
		const { unitId, kitchenId, templateId, folders, ingredients } = await scenario(seeder)

		const carnes = await createProcurementSegment(db, ctx, { unitId, name: uid("Carnes "), plannedMonth: 3, validityMonths: 12 })
		seeder.track("procurement_segment", carnes.id)
		const congelados = await createProcurementSegment(db, ctx, { unitId, name: uid("Congelados ") })
		seeder.track("procurement_segment", congelados.id)
		await addProcurementSegmentRule(db, ctx, { segmentId: carnes.id, mode: "include", folderId: folders.proteinas })
		await addProcurementSegmentRule(db, ctx, { segmentId: carnes.id, mode: "exclude", folderId: folders.pescados })
		await addProcurementSegmentRule(db, ctx, { segmentId: congelados.id, mode: "include", folderId: folders.pescados })

		const overview = await fetchSegmentationOverview(db, ctx, { unitId })
		const byIngredient = new Map(overview.lines.map((l) => [l.key, l.resolution]))
		expect(byIngredient.get(`ing:${ingredients.boi}`)).toEqual({ kind: "assigned", segmentId: carnes.id })
		expect(byIngredient.get(`ing:${ingredients.peixe}`)).toEqual({ kind: "assigned", segmentId: congelados.id })
		expect(byIngredient.get(`ing:${ingredients.suco}`)).toEqual({ kind: "unassigned" })
		expect(overview.unassignedCount).toBe(1)
		expect(overview.conflictCount).toBe(0)

		const result = await calculateAtaNeedsForSegment(db, ctx, {
			segmentId: carnes.id,
			kitchenSelections: [
				{
					kitchenId,
					kitchenName: "K",
					deliveryNotes: "",
					templateSelections: [{ templateId, templateName: "T", repetitions: 4 }],
					eventSelections: [],
					exceptionSelections: [],
				},
			],
		})
		expect(result.items.map((i) => i.ingredient_id)).toEqual([ingredients.boi])
		expect(result.excluded).toEqual({ otherSegment: 1, unassigned: 1, conflict: 0 })
	}, 60_000)

	test("mesma pasta em duas contratações é conflito; contratação removida sai da resolução e não serve a anexo novo", async () => {
		if (!reachable || !seeder || !db) return
		const ctx = await actor(seeder)
		const { unitId, folders, ingredients } = await scenario(seeder)

		const a = await createProcurementSegment(db, ctx, { unitId, name: uid("A ") })
		seeder.track("procurement_segment", a.id)
		const b = await createProcurementSegment(db, ctx, { unitId, name: uid("B ") })
		seeder.track("procurement_segment", b.id)
		await addProcurementSegmentRule(db, ctx, { segmentId: a.id, mode: "include", folderId: folders.pescados })
		await addProcurementSegmentRule(db, ctx, { segmentId: b.id, mode: "include", folderId: folders.pescados })

		let overview = await fetchSegmentationOverview(db, ctx, { unitId })
		const peixe = overview.lines.find((l) => l.key === `ing:${ingredients.peixe}`)
		expect(peixe?.resolution).toEqual({ kind: "conflict", segmentIds: [a.id, b.id].toSorted() })

		await deleteProcurementSegment(db, ctx, { segmentId: b.id })
		overview = await fetchSegmentationOverview(db, ctx, { unitId })
		expect(overview.segments.map((s) => s.id)).toEqual([a.id])
		expect(overview.lines.find((l) => l.key === `ing:${ingredients.peixe}`)?.resolution).toEqual({ kind: "assigned", segmentId: a.id })

		const { id: draftId } = await createAtaDraft(db, ctx, { unitId })
		seeder.track("procurement_list", draftId)
		await expect(updateAtaDraft(db, ctx, { draftId, segmentId: b.id })).rejects.toMatchObject({ code: "SEGMENT_NOT_FOUND" })
		await updateAtaDraft(db, ctx, { draftId, segmentId: a.id })
	}, 60_000)

	test("nome repetido na mesma OM é recusado", async () => {
		if (!reachable || !seeder || !db) return
		const ctx = await actor(seeder)
		const unitId = await seeder.seedUnit()
		const name = uid("Estocáveis ")
		const first = await createProcurementSegment(db, ctx, { unitId, name })
		seeder.track("procurement_segment", first.id)
		await expect(createProcurementSegment(db, ctx, { unitId, name: ` ${name.toUpperCase()} ` })).rejects.toMatchObject({ code: "SEGMENT_NAME_TAKEN" })
	}, 30_000)
})
