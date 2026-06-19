/**
 * @module unit-kitchens.fn
 * Reference list of kitchens belonging to a unit. Thin wrapper over @iefa/sisub-domain.
 * @domain core
 * @migration done
 */

import { ListUnitKitchensSchema, listUnitKitchens } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export type UnitKitchen = {
	id: number
	display_name: string | null
}

export const fetchUnitKitchensFn = createServerFn({ method: "GET" })
	.inputValidator(ListUnitKitchensSchema)
	.handler(async ({ data }): Promise<UnitKitchen[]> => {
		const ctx = await requireAuth()
		return (await listUnitKitchens(getDb(), ctx, data).catch(handleDomainError)) as unknown as UnitKitchen[]
	})
