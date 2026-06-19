/**
 * Regressão happy-path — operations de MEAL FORECAST (@iefa/sisub-domain).
 * Congela: upsert por (user_id,date,meal), listagem ordenada com mess_halls(code),
 * default mess hall e delete ANTES da migração Drizzle.
 *
 * As mutações agem sobre ctx.userId → o ctx usa o id de um auth user real semeado.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { deleteForecast, getUserDefaultMessHall, listMealForecasts, persistDefaultMessHall, upsertForecast } from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

describeSupabaseIntegration("forecast operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("meal_forecasts")
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

	test("upsertForecast cria e atualiza (mesma chave user/date/meal) e listMealForecasts ordena por data", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		const ctx = fullAccessCtx(userId)
		const { id: messHallId } = await seeder.seedMessHall()
		seeder.trackWhere("meal_forecasts", "user_id", userId)

		await upsertForecast(db, ctx, { date: "2099-09-02", meal: "almoco", willEat: true, messHallId })
		await upsertForecast(db, ctx, { date: "2099-09-01", meal: "almoco", willEat: false, messHallId })
		// re-upsert mesma chave: atualiza willEat (não duplica)
		await upsertForecast(db, ctx, { date: "2099-09-02", meal: "almoco", willEat: false, messHallId })

		const list = await listMealForecasts(db, { userId, startDate: "2099-09-01", endDate: "2099-09-30" })
		expect(list).toHaveLength(2)
		expect(list.map((r) => r.date)).toEqual(["2099-09-01", "2099-09-02"]) // asc
		const sep2 = list.find((r) => r.date === "2099-09-02")
		expect(sep2?.will_eat).toBe(false) // atualizado pelo re-upsert
	})

	test("persistDefaultMessHall + getUserDefaultMessHall (round-trip)", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		const ctx = fullAccessCtx(userId)
		const { id: messHallId } = await seeder.seedMessHall()
		seeder.track("user_data", userId)

		await persistDefaultMessHall(db, ctx, { messHallId, email: `${uid("fc-")}@example.invalid`.toLowerCase() })

		const def = await getUserDefaultMessHall(db, { userId })
		expect(def?.default_mess_hall_id).toBe(messHallId)
	})

	test("deleteForecast remove a previsão da chave", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		const ctx = fullAccessCtx(userId)
		const { id: messHallId } = await seeder.seedMessHall()
		seeder.trackWhere("meal_forecasts", "user_id", userId)

		await upsertForecast(db, ctx, { date: "2099-09-10", meal: "janta", willEat: true, messHallId })
		await deleteForecast(db, ctx, { date: "2099-09-10", meal: "janta" })

		const list = await listMealForecasts(db, { userId, startDate: "2099-09-10", endDate: "2099-09-10" })
		expect(list).toHaveLength(0)
	})
})
