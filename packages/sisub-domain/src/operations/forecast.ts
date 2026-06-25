/**
 * Diner meal-forecast operations (will_eat intent per date+meal). Drizzle query layer.
 *
 * Auth posture preserved from the original server functions, with no
 * module-level PBAC guard. Mutations are authenticated and act on the caller's
 * own identity (ctx.userId); reads are unauthenticated (matching the original)
 * and take an explicit userId.
 */

import { mealForecastsInKitchen, type SisubDb, userDataInCore } from "@iefa/database/drizzle/sisub"
import { and, eq, gte, lte } from "drizzle-orm"
import type { DeleteForecast, GetUserDefaultMessHall, ListMealForecasts, PersistDefaultMessHall, UpsertForecast } from "../schemas/meal-ops.ts"
import type { UserContext } from "../types/context.ts"
import { runQuery, toWire } from "../utils/index.ts"

// `mess_halls(code)` aninhado vem na relation `messHallsInCore` (FK mess_hall_id) → contrato `mess_halls`.
const FORECAST_RELATIONS: Record<string, string> = { messHallsInCore: "mess_halls" }

type ForecastListItem = { date: string; meal: string; will_eat: boolean; mess_halls: { code: string | null } | null }

export async function listMealForecasts(db: SisubDb, input: ListMealForecasts): Promise<ForecastListItem[]> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.mealForecastsInKitchen.findMany({
			columns: { date: true, meal: true, willEat: true },
			with: { messHallsInCore: { columns: { code: true } } },
			where: and(
				eq(mealForecastsInKitchen.userId, input.userId),
				gte(mealForecastsInKitchen.date, input.startDate),
				lte(mealForecastsInKitchen.date, input.endDate)
			),
			orderBy: (forecast, { asc }) => [asc(forecast.date)],
		})
	)
	return rows.map((r) => toWire<ForecastListItem>(r, FORECAST_RELATIONS))
}

export async function getUserDefaultMessHall(db: SisubDb, input: GetUserDefaultMessHall) {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.select({ default_mess_hall_id: userDataInCore.defaultMessHallId }).from(userDataInCore).where(eq(userDataInCore.id, input.userId)).limit(1)
	)
	return rows[0] ?? null
}

export async function persistDefaultMessHall(db: SisubDb, ctx: UserContext, input: PersistDefaultMessHall) {
	await runQuery("UPSERT_FAILED", () =>
		db
			.insert(userDataInCore)
			.values({ id: ctx.userId, defaultMessHallId: input.messHallId, email: input.email })
			.onConflictDoUpdate({ target: userDataInCore.id, set: { defaultMessHallId: input.messHallId, email: input.email } })
	)
}

export async function upsertForecast(db: SisubDb, ctx: UserContext, input: UpsertForecast) {
	const row = { date: input.date, userId: ctx.userId, meal: input.meal, willEat: input.willEat, messHallId: input.messHallId }

	try {
		await db
			.insert(mealForecastsInKitchen)
			.values(row)
			.onConflictDoUpdate({
				target: [mealForecastsInKitchen.userId, mealForecastsInKitchen.date, mealForecastsInKitchen.meal],
				set: { willEat: input.willEat, messHallId: input.messHallId },
			})
	} catch {
		// Fallback: delete + insert — cobre casos de borda que o onConflict não resolve.
		// Em transação: se o insert falhar, o delete reverte (senão a linha sumiria de vez).
		await runQuery("UPSERT_FAILED", () =>
			db.transaction(async (tx) => {
				await tx
					.delete(mealForecastsInKitchen)
					.where(and(eq(mealForecastsInKitchen.userId, ctx.userId), eq(mealForecastsInKitchen.date, input.date), eq(mealForecastsInKitchen.meal, input.meal)))
				await tx.insert(mealForecastsInKitchen).values(row)
			})
		)
	}
}

export async function deleteForecast(db: SisubDb, ctx: UserContext, input: DeleteForecast) {
	await runQuery("DELETE_FAILED", () =>
		db
			.delete(mealForecastsInKitchen)
			.where(and(eq(mealForecastsInKitchen.userId, ctx.userId), eq(mealForecastsInKitchen.date, input.date), eq(mealForecastsInKitchen.meal, input.meal)))
	)
}
