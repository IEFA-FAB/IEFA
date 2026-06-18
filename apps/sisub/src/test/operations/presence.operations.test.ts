/**
 * Regressão happy-path — operations de FISCAL PRESENCE (@iefa/sisub-domain).
 * Congela: leitura via view v_meal_presences_with_user (shape mapeado), listForecastMap,
 * insertPresence (preserva código PG 23505) e deletePresence ANTES da migração Drizzle.
 */

import { deletePresence, insertPresence, listForecastMap, listPresences } from "@iefa/sisub-domain"
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { describeSupabaseIntegration } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("presence operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null

	beforeAll(async () => {
		const s = await setupIntegration("meal_presences")
		reachable = s.reachable
		if (s.client) client = s.client
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	test("listPresences mapeia a view (display_name, unidade, updated_at null)", async () => {
		if (!reachable || !seeder) return
		const userId = await seeder.seedAuthUser()
		const email = `${uid("pr-")}@example.invalid`.toLowerCase()
		await seeder.seedUserData({ id: userId, email })
		const { id: messHallId } = await seeder.seedMessHall()
		const date = "2099-10-01"
		const meal = "almoco"
		await seeder.seedMealPresence({ userId, messHallId, date, meal })

		const rows = await listPresences(client, { date, meal, messHallId })
		const found = rows.find((r) => r.user_id === userId)
		expect(found).toBeDefined()
		expect(found?.unidade).toBe(String(messHallId))
		expect(found?.updated_at).toBeNull()
		expect(found?.display_name).toBe(email) // v_user_identity → email (sem dado militar)
	})

	test("listForecastMap mapeia user_id → will_eat; [] → {}", async () => {
		if (!reachable || !seeder) return
		const userId = await seeder.seedAuthUser()
		const { id: messHallId } = await seeder.seedMessHall()
		const date = "2099-10-02"
		const meal = "janta"
		seeder.trackWhere("meal_forecasts", "user_id", userId)
		await seeder.seedMealForecast({ userId, messHallId, date, meal, willEat: true })

		const map = await listForecastMap(client, { date, meal, messHallId, userIds: [userId] })
		expect(map[userId]).toBe(true)

		expect(await listForecastMap(client, { date, meal, messHallId, userIds: [] })).toEqual({})
	})

	test("insertPresence grava e preserva código 23505 em duplicata; deletePresence remove", async () => {
		if (!reachable || !seeder) return
		const userId = await seeder.seedAuthUser()
		const { id: messHallId } = await seeder.seedMessHall()
		const date = "2099-10-03"
		const meal = "almoco"
		seeder.trackWhere("meal_presences", "user_id", userId)

		await insertPresence(client, ctx, { user_id: userId, date, meal, messHallId })

		// duplicata viola UNIQUE(user_id,date,meal) → erro com code 23505 preservado
		await expect(insertPresence(client, ctx, { user_id: userId, date, meal, messHallId })).rejects.toMatchObject({ code: "23505" })

		const rows = await listPresences(client, { date, meal, messHallId })
		const row = rows.find((r) => r.user_id === userId)
		if (!row) throw new Error("presença esperada não encontrada")
		await deletePresence(client, ctx, { id: row.id })

		const after = await listPresences(client, { date, meal, messHallId })
		expect(after.map((r) => r.user_id)).not.toContain(userId)
	})
})
