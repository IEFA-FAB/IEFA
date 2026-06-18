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
import { handleDomainError } from "@/lib/domain-errors"
import { getSupabaseServerClient } from "@/lib/supabase.server"

// Reads stay unauthenticated to match the original server-fn posture (callers
// gate on the diner's own user id). Mutations below require auth (ctx.userId).
export const fetchMealForecastsFn = createServerFn({ method: "GET" })
	.inputValidator(ListMealForecastsSchema)
	.handler(async ({ data }) => listMealForecasts(getSupabaseServerClient(), data).catch(handleDomainError))

export const fetchUserDefaultMessHallFn = createServerFn({ method: "GET" })
	.inputValidator(GetUserDefaultMessHallSchema)
	.handler(async ({ data }) => getUserDefaultMessHall(getSupabaseServerClient(), data).catch(handleDomainError))

export const persistDefaultMessHallFn = createServerFn({ method: "POST" })
	.inputValidator(PersistDefaultMessHallSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return persistDefaultMessHall(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const upsertForecastFn = createServerFn({ method: "POST" })
	.inputValidator(UpsertForecastSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return upsertForecast(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const deleteForecastFn = createServerFn({ method: "POST" })
	.inputValidator(DeleteForecastSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteForecast(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})
