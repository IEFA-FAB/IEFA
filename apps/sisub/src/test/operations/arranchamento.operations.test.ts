/**
 * Regressão happy-path — operations de MEAL FORECAST (@iefa/sisub-domain).
 * Congela: upsert por (user_id,date,meal), listagem ordenada com mess_halls(code),
 * default mess hall e delete ANTES da migração Drizzle.
 *
 * As mutações agem sobre ctx.userId → o ctx usa o id de um auth user real semeado.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { deleteArranchamento, getUserDefaultMessHall, listArranchamentos, persistDefaultMessHall, upsertArranchamento } from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

describeSupabaseIntegration("arranchamento operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("arranchamento")
		reachable = s.reachable
		if (s.client) client = s.client
		const url = getSisubDatabaseUrl()
		if (reachable && url) {
			const t = createSisubTestDb(url)
			db = t.db
			closeDb = t.close
		}
	})

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	})

	afterAll(async () => {
		await closeDb?.()
	})

	test("upsertArranchamento cria e atualiza (mesma chave user/date/meal) e listArranchamentos ordena por data", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		const ctx = fullAccessCtx(userId)
		const { id: messHallId } = await seeder.seedMessHall()
		seeder.trackWhere("arranchamento", "user_id", userId)

		await upsertArranchamento(db, ctx, { date: "2099-09-02", meal: "almoco", willEat: true, messHallId })
		await upsertArranchamento(db, ctx, { date: "2099-09-01", meal: "almoco", willEat: false, messHallId })
		// re-upsert mesma chave: atualiza willEat (não duplica)
		await upsertArranchamento(db, ctx, { date: "2099-09-02", meal: "almoco", willEat: false, messHallId })

		const list = await listArranchamentos(db, { userId, startDate: "2099-09-01", endDate: "2099-09-30" })
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

	test("deleteArranchamento remove a previsão da chave", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		const ctx = fullAccessCtx(userId)
		const { id: messHallId } = await seeder.seedMessHall()
		seeder.trackWhere("arranchamento", "user_id", userId)

		await upsertArranchamento(db, ctx, { date: "2099-09-10", meal: "janta", willEat: true, messHallId })
		await deleteArranchamento(db, ctx, { date: "2099-09-10", meal: "janta" })

		const list = await listArranchamentos(db, { userId, startDate: "2099-09-10", endDate: "2099-09-10" })
		expect(list).toHaveLength(0)
	})
})
