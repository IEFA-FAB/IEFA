/**
 * @module kitchens.fn
 * Full kitchen list with nested unit relation. Read-only, no input validation.
 * CLIENT: getSupabaseServerClient (service role).
 * TABLE: kitchen (joined to units via kitchen_unit_id_fkey FK alias).
 */

import type { Kitchen, Unit } from "@iefa/database/sisub"
import { createServerFn } from "@tanstack/react-start"
import { getSupabaseServerClient } from "@/lib/supabase.server"

export interface KitchenWithUnit extends Kitchen {
	unit: Unit | null
}

/**
 * Lists all kitchens ordered by id with their parent unit.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchKitchensFn = createServerFn({ method: "GET" }).handler(async () => {
	const { data, error } = await getSupabaseServerClient()
		.from("kitchen")
		.select(
			`
      *,
      unit:units!kitchen_unit_id_fkey(*)
    `
		)
		.order("id")

	if (error) throw new Error(`Failed to fetch kitchens: ${error.message}`)

	return (data ?? []) as KitchenWithUnit[]
})
