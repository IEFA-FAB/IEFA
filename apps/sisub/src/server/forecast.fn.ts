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
import { requireAuth, requireUserId } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

// Reads self-only: o `userId` do payload é IGNORADO em favor do da sessão. Antes eram
// anônimos e o chamador escolhia de quem era a previsão/rancho padrão que queria ler.
export const fetchMealForecastsFn = createServerFn({ method: "GET" })
	.validator(ListMealForecastsSchema)
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		return listMealForecasts(getDb(), { ...data, userId }).catch(handleDomainError)
	})

export const fetchUserDefaultMessHallFn = createServerFn({ method: "GET" })
	.validator(GetUserDefaultMessHallSchema)
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		return getUserDefaultMessHall(getDb(), { ...data, userId }).catch(handleDomainError)
	})

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
