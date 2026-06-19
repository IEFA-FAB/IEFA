/**
 * @module messhall.fn
 * Mess hall lookup, diner forecast queries and extra-presence tracking.
 * Thin wrappers over @iefa/sisub-domain (operations/places).
 * @domain core
 * @migration done
 */

import {
	AddOtherPresenceSchema,
	addOtherPresence,
	FetchMessHallByCodeSchema,
	FetchOtherPresencesCountSchema,
	FetchUserMealForecastSchema,
	fetchMessHallByCode,
	fetchMessHallIdByCode,
	fetchOtherPresencesCount,
	fetchUserMealForecast,
	ResolveDisplayNameSchema,
	resolveDisplayName,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export const fetchMessHallByCodeFn = createServerFn({ method: "GET" })
	.inputValidator(FetchMessHallByCodeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchMessHallByCode(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchMessHallIdByCodeFn = createServerFn({ method: "GET" })
	.inputValidator(FetchMessHallByCodeSchema)
	.handler(async ({ data }): Promise<number | null> => {
		const ctx = await requireAuth()
		return fetchMessHallIdByCode(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchUserMealForecastFn = createServerFn({ method: "GET" })
	.inputValidator(FetchUserMealForecastSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchUserMealForecast(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchOtherPresencesCountFn = createServerFn({ method: "GET" })
	.inputValidator(FetchOtherPresencesCountSchema)
	.handler(async ({ data }): Promise<number> => {
		const ctx = await requireAuth()
		return fetchOtherPresencesCount(getDb(), ctx, data).catch(handleDomainError)
	})

export const addOtherPresenceFn = createServerFn({ method: "POST" })
	.inputValidator(AddOtherPresenceSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return addOtherPresence(getDb(), ctx, data).catch(handleDomainError)
	})

export const resolveDisplayNameFn = createServerFn({ method: "GET" })
	.inputValidator(ResolveDisplayNameSchema)
	.handler(async ({ data }): Promise<string | null> => {
		const ctx = await requireAuth()
		return resolveDisplayName(getDb(), ctx, data).catch(handleDomainError)
	})
