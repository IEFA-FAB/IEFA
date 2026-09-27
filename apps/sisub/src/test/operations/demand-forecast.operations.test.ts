/**
 * Regressão happy-path — operations da PREVISÃO DE DEMANDA (@iefa/sisub-domain).
 * Lifecycle pending → sent. Congela CRUD + replace de selections + ordenação ANTES da migração Drizzle.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import {
	createDemandForecast,
	deleteDemandForecast,
	fetchDemandForecasts,
	fetchPendingDemandForecast,
	sendDemandForecast,
	updateDemandForecast,
} from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("demand-forecast operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("kitchen_demand_forecast")
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

	async function setupForecastDeps() {
		if (!seeder) throw new Error("no seeder")
		const { id: kitchenId } = await seeder.seedKitchen()
		const templateId = await seeder.seedTemplate({ kitchenId })
		return { kitchenId, templateId }
	}

	test("createDemandForecast cria com status 'pending' e insere selections", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, templateId } = await setupForecastDeps()

		const forecast = await createDemandForecast(db, ctx, {
			kitchenId,
			title: uid("[TEST] Previsão "),
			notes: "obs",
			selections: [{ templateId, templateName: "T", repetitions: 2 }],
		})
		seeder.trackWhere("kitchen_demand_forecast_selection", "forecast_id", forecast.id)
		seeder.track("kitchen_demand_forecast", forecast.id)

		expect(forecast.status).toBe("pending")

		const forecasts = await fetchDemandForecasts(db, ctx, { kitchenId })
		const found = forecasts.find((d) => d.id === forecast.id)
		expect(found).toBeDefined()
		expect(found?.selections).toHaveLength(1)
		expect(found?.selections[0].template_id).toBe(templateId)
		expect(found?.selections[0].repetitions).toBe(2)
	})

	test("fetchDemandForecasts ordena por created_at desc; fetchPendingDemandForecast só retorna 'sent'", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, templateId } = await setupForecastDeps()

		const first = await createDemandForecast(db, ctx, { kitchenId, title: uid("[TEST] D1 "), notes: undefined, selections: [] })
		seeder.track("kitchen_demand_forecast", first.id)
		const second = await createDemandForecast(db, ctx, {
			kitchenId,
			title: uid("[TEST] D2 "),
			notes: undefined,
			selections: [{ templateId, templateName: "T", repetitions: 1 }],
		})
		seeder.trackWhere("kitchen_demand_forecast_selection", "forecast_id", second.id)
		seeder.track("kitchen_demand_forecast", second.id)

		// nenhum 'sent' ainda
		expect(await fetchPendingDemandForecast(db, ctx, { kitchenId })).toBeNull()

		await sendDemandForecast(db, ctx, { forecastId: second.id })
		const pending = await fetchPendingDemandForecast(db, ctx, { kitchenId })
		expect(pending?.id).toBe(second.id)

		const forecasts = await fetchDemandForecasts(db, ctx, { kitchenId })
		const idx1 = forecasts.findIndex((d) => d.id === first.id)
		const idx2 = forecasts.findIndex((d) => d.id === second.id)
		expect(idx2).toBeLessThan(idx1) // second criado depois → vem primeiro (desc)
	})

	test("updateDemandForecast substitui selections (delete-all + re-insert)", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, templateId } = await setupForecastDeps()
		const otherTemplate = await seeder.seedTemplate({ kitchenId })

		const forecast = await createDemandForecast(db, ctx, {
			kitchenId,
			title: uid("[TEST] D "),
			notes: undefined,
			selections: [{ templateId, templateName: "T", repetitions: 1 }],
		})
		seeder.trackWhere("kitchen_demand_forecast_selection", "forecast_id", forecast.id)
		seeder.track("kitchen_demand_forecast", forecast.id)

		await updateDemandForecast(db, ctx, {
			forecastId: forecast.id,
			updates: { title: uid("[TEST] Renomeado ") },
			selections: [{ templateId: otherTemplate, templateName: "T", repetitions: 5 }],
		})

		const forecasts = await fetchDemandForecasts(db, ctx, { kitchenId })
		const found = forecasts.find((d) => d.id === forecast.id)
		expect(found?.selections).toHaveLength(1)
		expect(found?.selections[0].template_id).toBe(otherTemplate)
		expect(found?.selections[0].repetitions).toBe(5)
	})

	test("deleteDemandForecast remove a previsão", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId } = await setupForecastDeps()
		const forecast = await createDemandForecast(db, ctx, { kitchenId, title: uid("[TEST] D "), notes: undefined, selections: [] })
		seeder.track("kitchen_demand_forecast", forecast.id) // cleanup-safe se deleteDemandForecast falhar (delete de row já removida é no-op)

		await deleteDemandForecast(db, ctx, { forecastId: forecast.id })
		const forecasts = await fetchDemandForecasts(db, ctx, { kitchenId })
		expect(forecasts.map((d) => d.id)).not.toContain(forecast.id)
	})
})
