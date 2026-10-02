/**
 * Fluxos guiados do planejamento da contratação (change `sisub-procurement-planning-flows`), no
 * banco real: o status lido pelos dois fluxos, o retorno da previsão à cozinha e o fechamento do
 * ciclo do calendário por anexo concluído.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import {
	createDemandForecast,
	createQuantityEstimateDraft,
	createSegment,
	fetchDemandForecastStatus,
	fetchPendingDemandForecast,
	fetchProcurementPlanningStatus,
	getBrasiliaToday,
	recordDemandForecastImport,
	sendDemandForecast,
	updateQuantityEstimateDraft,
	updateQuantityEstimateStatus,
} from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

describeSupabaseIntegration("fluxos do planejamento da contratação", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("segment")
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

	test("previsão enviada → importada no anexo → recebida na cozinha; anexo concluído fecha o ciclo do calendário", async () => {
		if (!reachable || !seeder || !db) return
		const ctx = { ...fullAccessCtx(), userId: await seeder.seedAuthUser() }
		const unitId = await seeder.seedUnit()
		const { id: kitchenId } = await seeder.seedKitchen({ unitId })
		const ingredientId = await seeder.seedIngredient()
		const recipeId = await seeder.seedRecipe({ kitchenId, portionYield: 1, ingredients: [{ ingredientId, netQuantity: 0.1 }] })
		const mealTypeId = await seeder.seedMealType({ kitchenId })
		const templateId = await seeder.seedTemplate({ kitchenId, templateType: "weekly" })
		await seeder.seedTemplateItem({ templateId, mealTypeId, recipeId, dayOfWeek: 1, headcountOverride: 50 })

		// Cozinha: previsão enviada.
		const draft = (await createDemandForecast(db, ctx, {
			kitchenId,
			title: uid("[TEST] Previsão "),
			selections: [{ templateId, templateName: "T", repetitions: 4 }],
		})) as { id: string }
		seeder.track("kitchen_demand_forecast", draft.id)
		await sendDemandForecast(db, ctx, { forecastId: draft.id })

		let kitchenStatus = await fetchDemandForecastStatus(db, ctx, { kitchenId })
		expect(kitchenStatus.weeklyWithItems).toBe(1)
		expect(kitchenStatus.forecast).toMatchObject({ id: draft.id, status: "sent", imports: [] })

		// Unidade: contratação no mês corrente, com a janela aberta.
		const month = Number(getBrasiliaToday().slice(5, 7))
		const segment = await createSegment(db, ctx, { unitId, name: uid("Carnes "), plannedMonth: month, leadTimeMonths: 1 })
		seeder.track("segment", segment.id)

		let unitStatus = await fetchProcurementPlanningStatus(db, ctx, { unitId })
		expect(unitStatus.kitchens).toHaveLength(1)
		expect(unitStatus.kitchens[0]).toMatchObject({ id: kitchenId, weeklyWithItems: 1, forecast: { status: "sent", imports: 0 } })
		expect(unitStatus.calendar[0].cycle).toMatchObject({ active: true, closed: false })

		// Importar a previsão num anexo: a cozinha passa a ver "recebida", e a previsão continua
		// disponível para o anexo de outra contratação.
		const { id: quantityEstimateId } = await createQuantityEstimateDraft(db, ctx, { unitId })
		seeder.track("quantity_estimate", quantityEstimateId)
		await updateQuantityEstimateDraft(db, ctx, { draftId: quantityEstimateId, title: "Carnes 2027", segmentId: segment.id })
		await recordDemandForecastImport(db, ctx, { forecastId: draft.id, quantityEstimateId })
		await recordDemandForecastImport(db, ctx, { forecastId: draft.id, quantityEstimateId }) // idempotente

		kitchenStatus = await fetchDemandForecastStatus(db, ctx, { kitchenId })
		expect(kitchenStatus.forecast?.status).toBe("reviewed")
		expect(kitchenStatus.forecast?.reviewedAt).not.toBeNull()
		expect(kitchenStatus.forecast?.imports.map((i) => i.title)).toEqual(["Carnes 2027"])
		const pending = await fetchPendingDemandForecast(db, ctx, { kitchenId })
		expect(pending?.id).toBe(draft.id)
		expect((pending as { imports: unknown[] }).imports).toHaveLength(1)

		// Concluir o anexo da contratação fecha o ciclo do calendário.
		await updateQuantityEstimateStatus(db, ctx, { quantityEstimateId: quantityEstimateId, status: "completed" })
		unitStatus = await fetchProcurementPlanningStatus(db, ctx, { unitId })
		expect(unitStatus.calendar[0].cycle?.closed).toBe(true)
		expect(unitStatus.kitchens[0].forecast?.imports).toBe(1)
	}, 90_000)

	test("cardápio com preparação sem efetivo aparece no fluxo da cozinha; modelo global é recusado na previsão", async () => {
		if (!reachable || !seeder || !db) return
		const ctx = { ...fullAccessCtx(), userId: await seeder.seedAuthUser() }
		const unitId = await seeder.seedUnit()
		const { id: kitchenId } = await seeder.seedKitchen({ unitId })
		const recipeId = await seeder.seedRecipe({ kitchenId, portionYield: 1 })
		const mealTypeId = await seeder.seedMealType({ kitchenId })
		const withPax = await seeder.seedTemplate({ kitchenId, templateType: "weekly", name: uid("[TEST] Com pax ") })
		await seeder.seedTemplateItem({ templateId: withPax, mealTypeId, recipeId, dayOfWeek: 1, headcountOverride: 50 })
		const withoutName = uid("[TEST] Sem efetivo ")
		const without = await seeder.seedTemplate({ kitchenId, templateType: "weekly", name: withoutName })
		await seeder.seedTemplateItem({ templateId: without, mealTypeId, recipeId, dayOfWeek: 1, recommendedProportion: 30 })

		const status = await fetchDemandForecastStatus(db, ctx, { kitchenId })
		expect(status.menusWithoutHeadcount).toEqual([withoutName])

		const globalTemplate = await seeder.seedTemplate({ kitchenId: null, templateType: "weekly" })
		await expect(
			createDemandForecast(db, ctx, {
				kitchenId,
				title: uid("[TEST] Previsão "),
				selections: [{ templateId: globalTemplate, templateName: "G", repetitions: 1 }],
			})
		).rejects.toThrow(/adapte o modelo/)
	}, 60_000)

	test("previsão de cozinha de outra OM não entra no anexo", async () => {
		if (!reachable || !seeder || !db) return
		const ctx = { ...fullAccessCtx(), userId: await seeder.seedAuthUser() }
		const unitId = await seeder.seedUnit()
		const { id: foreignKitchen } = await seeder.seedKitchen()
		const templateId = await seeder.seedTemplate({ kitchenId: foreignKitchen, templateType: "weekly" })
		const draft = (await createDemandForecast(db, ctx, {
			kitchenId: foreignKitchen,
			title: uid("[TEST] Previsão "),
			selections: [{ templateId, templateName: "T", repetitions: 1 }],
		})) as { id: string }
		seeder.track("kitchen_demand_forecast", draft.id)
		await sendDemandForecast(db, ctx, { forecastId: draft.id })
		const { id: quantityEstimateId } = await createQuantityEstimateDraft(db, ctx, { unitId })
		seeder.track("quantity_estimate", quantityEstimateId)
		await expect(recordDemandForecastImport(db, ctx, { forecastId: draft.id, quantityEstimateId })).rejects.toMatchObject({ code: "KITCHEN_NOT_IN_UNIT" })
	}, 60_000)
})
