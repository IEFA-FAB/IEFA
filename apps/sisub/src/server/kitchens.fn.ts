/**
 * @module kitchens.fn
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 * Auth enforced via requireAuth() — all endpoints now require authentication.
 * @domain core
 * @migration done
 */

import type { Tables } from "@iefa/database/sisub"
import { ListUnitKitchensSchema, listKitchens, listUnitKitchens } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

/** Kitchen row with the joined unit (id + display_name + code). */
export type KitchenWithUnit = Tables<"kitchen"> & {
	unit: { id: number; display_name: string | null; code: string } | null
}

export const fetchKitchensFn = createServerFn({ method: "GET" }).handler(async () => {
	const ctx = await requireAuth()
	return (await listKitchens(getDb(), ctx).catch(handleDomainError)) as unknown as KitchenWithUnit[]
})

export const fetchUnitKitchensFn = createServerFn({ method: "GET" })
	.validator(ListUnitKitchensSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listUnitKitchens(getDb(), ctx, data).catch(handleDomainError)
	})
