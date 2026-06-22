/**
 * @module forecast.fn
 * Meal forecast management for individual diners (will_eat intent per date+meal).
 * Thin wrappers over @iefa/sisub-domain (operations/forecast).
 * @domain core
 * @migration done
 */

import {
	DeleteForecastSchema,
	deleteForecast,
	GetUserDefaultMessHallSchema,
	getUserDefaultMessHall,
	ListMealForecastsSchema,
	listMealForecasts,
	PersistDefaultMessHallSchema,
	persistDefaultMessHall,
	UpsertForecastSchema,
	upsertForecast,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

// Reads stay unauthenticated to match the original server-fn posture (callers
// gate on the diner's own user id). Mutations below require auth (ctx.userId).
export const fetchMealForecastsFn = createServerFn({ method: "GET" })
	.validator(ListMealForecastsSchema)
	.handler(async ({ data }) => listMealForecasts(getDb(), data).catch(handleDomainError))

export const fetchUserDefaultMessHallFn = createServerFn({ method: "GET" })
	.validator(GetUserDefaultMessHallSchema)
	.handler(async ({ data }) => getUserDefaultMessHall(getDb(), data).catch(handleDomainError))

export const persistDefaultMessHallFn = createServerFn({ method: "POST" })
	.validator(PersistDefaultMessHallSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return persistDefaultMessHall(getDb(), ctx, data).catch(handleDomainError)
	})

export const upsertForecastFn = createServerFn({ method: "POST" })
	.validator(UpsertForecastSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return upsertForecast(getDb(), ctx, data).catch(handleDomainError)
	})

export const deleteForecastFn = createServerFn({ method: "POST" })
	.validator(DeleteForecastSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteForecast(getDb(), ctx, data).catch(handleDomainError)
	})
