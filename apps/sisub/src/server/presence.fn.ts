/**
 * @module presence.fn
 * Fiscal presence tracking: read presences + forecasts, insert/delete presence records.
 * Thin wrappers over @iefa/sisub-domain (operations/presence).
 * @domain core
 * @migration done
 */

import {
	DeletePresenceSchema,
	deletePresence,
	InsertPresenceSchema,
	insertPresence,
	ListForecastMapSchema,
	ListPresencesSchema,
	listForecastMap,
	listPresences,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { handleDomainError } from "@/lib/domain-errors"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { FiscalPresenceRecord, ForecastMap } from "@/types/domain/presence"

// Reads stay unauthenticated to match the original server-fn posture.
// Mutations below require auth.
export const fetchPresencesFn = createServerFn({ method: "GET" })
	.inputValidator(ListPresencesSchema)
	.handler(async ({ data }) => {
		return (await listPresences(getSupabaseServerClient(), data).catch(handleDomainError)) as unknown as FiscalPresenceRecord[]
	})

export const fetchForecastsFn = createServerFn({ method: "GET" })
	.inputValidator(ListForecastMapSchema)
	.handler(async ({ data }) => {
		return (await listForecastMap(getSupabaseServerClient(), data)) as ForecastMap
	})

export const insertPresenceFn = createServerFn({ method: "POST" })
	.inputValidator(InsertPresenceSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		// No handleDomainError: insertPresence throws a code-bearing Error so callers
		// can detect PG unique violations (code "23505"). Propagate it unchanged.
		return insertPresence(getSupabaseServerClient(), ctx, data)
	})

export const deletePresenceFn = createServerFn({ method: "POST" })
	.inputValidator(DeletePresenceSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deletePresence(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})
