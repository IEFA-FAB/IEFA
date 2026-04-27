/**
 * @module kitchens.fn
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 * Auth enforced via requireAuth() — all endpoints now require authentication.
 */

import type { Tables } from "@iefa/database/sisub"
import { ListUnitKitchensSchema, listKitchens, listUnitKitchens } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { handleDomainError } from "@/lib/domain-errors"
import { getSupabaseServerClient } from "@/lib/supabase.server"

/** Kitchen row with the joined unit (id + display_name + code). */
export type KitchenWithUnit = Tables<"kitchen"> & {
	unit: { id: number; display_name: string | null; code: string } | null
}

export const fetchKitchensFn = createServerFn({ method: "GET" }).handler(async () => {
	const ctx = await requireAuth()
	return (await listKitchens(getSupabaseServerClient(), ctx).catch(handleDomainError)) as unknown as KitchenWithUnit[]
})

export const fetchUnitKitchensFn = createServerFn({ method: "GET" })
	.inputValidator(ListUnitKitchensSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listUnitKitchens(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})
