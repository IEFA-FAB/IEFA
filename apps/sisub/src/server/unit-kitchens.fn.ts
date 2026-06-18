/**
 * @module unit-kitchens.fn
 * Reference list of kitchens belonging to a unit. Thin wrapper over @iefa/sisub-domain.
 * @domain core
 * @migration done
 */

import { ListUnitKitchensSchema, listUnitKitchens } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { handleDomainError } from "@/lib/domain-errors"
import { getSupabaseServerClient } from "@/lib/supabase.server"

export type UnitKitchen = {
	id: number
	display_name: string | null
}

export const fetchUnitKitchensFn = createServerFn({ method: "GET" })
	.inputValidator(ListUnitKitchensSchema)
	.handler(async ({ data }): Promise<UnitKitchen[]> => {
		const ctx = await requireAuth()
		return (await listUnitKitchens(getSupabaseServerClient(), ctx, data).catch(handleDomainError)) as unknown as UnitKitchen[]
	})
