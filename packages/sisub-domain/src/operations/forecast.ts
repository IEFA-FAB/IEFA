/**
 * Diner meal-forecast operations (will_eat intent per date+meal). Drizzle query layer.
 *
 * Auth posture preserved from the original server functions, with no
 * module-level PBAC guard. Mutations are authenticated and act on the caller's
 * own identity (ctx.userId); reads are unauthenticated (matching the original)
 * and take an explicit userId.
 */

import { mealForecastsInSisub, type SisubDb, userDataInSisub } from "@iefa/database/drizzle/sisub"
import { and, eq, gte, lte } from "drizzle-orm"
import type { DeleteForecast, GetUserDefaultMessHall, ListMealForecasts, PersistDefaultMessHall, UpsertForecast } from "../schemas/meal-ops.ts"
import type { UserContext } from "../types/context.ts"
import { runQuery, toWire } from "../utils/index.ts"

// `mess_halls(code)` aninhado vem na relation `messHallsInSisub` (FK mess_hall_id) → contrato `mess_halls`.
const FORECAST_RELATIONS: Record<string, string> = { messHallsInSisub: "mess_halls" }

type ForecastListItem = { date: string; meal: string; will_eat: boolean; mess_halls: { code: string | null } | null }

export async function listMealForecasts(db: SisubDb, input: ListMealForecasts): Promise<ForecastListItem[]> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.mealForecastsInSisub.findMany({
			columns: { date: true, meal: true, willEat: true },
			with: { messHallsInSisub: { columns: { code: true } } },
			where: and(eq(mealForecastsInSisub.userId, input.userId), gte(mealForecastsInSisub.date, input.startDate), lte(mealForecastsInSisub.date, input.endDate)),
			orderBy: (forecast, { asc }) => [asc(forecast.date)],
		})
	)
	return rows.map((r) => toWire<ForecastListItem>(r, FORECAST_RELATIONS))
}

export async function getUserDefaultMessHall(db: SisubDb, input: GetUserDefaultMessHall) {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.select({ default_mess_hall_id: userDataInSisub.defaultMessHallId }).from(userDataInSisub).where(eq(userDataInSisub.id, input.userId)).limit(1)
	)
	return rows[0] ?? null
}

export async function persistDefaultMessHall(db: SisubDb, ctx: UserContext, input: PersistDefaultMessHall) {
	await runQuery("UPSERT_FAILED", () =>
		db
			.insert(userDataInSisub)
			.values({ id: ctx.userId, defaultMessHallId: input.messHallId, email: input.email })
			.onConflictDoUpdate({ target: userDataInSisub.id, set: { defaultMessHallId: input.messHallId, email: input.email } })
	)
}

export async function upsertForecast(db: SisubDb, ctx: UserContext, input: UpsertForecast) {
	const row = { date: input.date, userId: ctx.userId, meal: input.meal, willEat: input.willEat, messHallId: input.messHallId }

	try {
		await db
			.insert(mealForecastsInSisub)
			.values(row)
			.onConflictDoUpdate({
				target: [mealForecastsInSisub.userId, mealForecastsInSisub.date, mealForecastsInSisub.meal],
				set: { willEat: input.willEat, messHallId: input.messHallId },
			})
	} catch {
		// Fallback: delete + insert — cobre casos de borda que o onConflict não resolve.
		await runQuery("UPSERT_FAILED", async () => {
			await db
				.delete(mealForecastsInSisub)
				.where(and(eq(mealForecastsInSisub.userId, ctx.userId), eq(mealForecastsInSisub.date, input.date), eq(mealForecastsInSisub.meal, input.meal)))
			await db.insert(mealForecastsInSisub).values(row)
		})
	}
}

export async function deleteForecast(db: SisubDb, ctx: UserContext, input: DeleteForecast) {
	await runQuery("DELETE_FAILED", () =>
		db
			.delete(mealForecastsInSisub)
			.where(and(eq(mealForecastsInSisub.userId, ctx.userId), eq(mealForecastsInSisub.date, input.date), eq(mealForecastsInSisub.meal, input.meal)))
	)
}
