/**
 * Regressão happy-path — operations de MEAL FORECAST (@iefa/sisub-domain).
 * Congela: upsert por (user_id,date,meal), listagem ordenada com mess_halls(code),
 * default mess hall e delete ANTES da migração Drizzle.
 *
 * As mutações agem sobre ctx.userId → o ctx usa o id de um auth user real semeado.
 */

import { deleteForecast, getUserDefaultMessHall, listMealForecasts, persistDefaultMessHall, upsertForecast } from "@iefa/sisub-domain"
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { describeSupabaseIntegration } from "@/test/supabase"

describeSupabaseIntegration("forecast operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null

	beforeAll(async () => {
		const s = await setupIntegration("meal_forecasts")
		reachable = s.reachable
		if (s.client) client = s.client
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	test("upsertForecast cria e atualiza (mesma chave user/date/meal) e listMealForecasts ordena por data", async () => {
		if (!reachable || !seeder) return
		const userId = await seeder.seedAuthUser()
		const ctx = fullAccessCtx(userId)
		const { id: messHallId } = await seeder.seedMessHall()
		seeder.trackWhere("meal_forecasts", "user_id", userId)

		await upsertForecast(client, ctx, { date: "2099-09-02", meal: "almoco", willEat: true, messHallId })
		await upsertForecast(client, ctx, { date: "2099-09-01", meal: "almoco", willEat: false, messHallId })
		// re-upsert mesma chave: atualiza willEat (não duplica)
		await upsertForecast(client, ctx, { date: "2099-09-02", meal: "almoco", willEat: false, messHallId })

		const list = await listMealForecasts(client, { userId, startDate: "2099-09-01", endDate: "2099-09-30" })
		expect(list).toHaveLength(2)
		expect(list.map((r) => r.date)).toEqual(["2099-09-01", "2099-09-02"]) // asc
		const sep2 = list.find((r) => r.date === "2099-09-02")
		expect(sep2?.will_eat).toBe(false) // atualizado pelo re-upsert
	})

	test("persistDefaultMessHall + getUserDefaultMessHall (round-trip)", async () => {
		if (!reachable || !seeder) return
		const userId = await seeder.seedAuthUser()
		const ctx = fullAccessCtx(userId)
		const { id: messHallId } = await seeder.seedMessHall()
		seeder.track("user_data", userId)

		await persistDefaultMessHall(client, ctx, { messHallId, email: `${uid("fc-")}@example.invalid`.toLowerCase() })

		const def = await getUserDefaultMessHall(client, { userId })
		expect(def?.default_mess_hall_id).toBe(messHallId)
	})

	test("deleteForecast remove a previsão da chave", async () => {
		if (!reachable || !seeder) return
		const userId = await seeder.seedAuthUser()
		const ctx = fullAccessCtx(userId)
		const { id: messHallId } = await seeder.seedMessHall()
		seeder.trackWhere("meal_forecasts", "user_id", userId)

		await upsertForecast(client, ctx, { date: "2099-09-10", meal: "janta", willEat: true, messHallId })
		await deleteForecast(client, ctx, { date: "2099-09-10", meal: "janta" })

		const list = await listMealForecasts(client, { userId, startDate: "2099-09-10", endDate: "2099-09-10" })
		expect(list).toHaveLength(0)
	})
})
