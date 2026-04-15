/**
 * @module unit-kitchens.fn
 * Reference list of kitchens belonging to a unit. Read-only.
 * CLIENT: getSupabaseServerClient (service role).
 * TABLE: kitchen.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"

export type UnitKitchen = {
	id: number
	display_name: string | null
}

/**
 * Lists kitchens (id + display_name) for a unit ordered by display_name.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchUnitKitchensFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ unitId: z.number() }))
	.handler(async ({ data }): Promise<UnitKitchen[]> => {
		const supabase = getSupabaseServerClient()
		const { data: kitchens, error } = await supabase.from("kitchen").select("id, display_name").eq("unit_id", data.unitId).order("display_name")
		if (error) throw new Error(`Erro ao buscar cozinhas da unidade: ${error.message}`)
		return kitchens || []
	})
