import { createServerFn } from "@tanstack/react-start"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { Kitchen, Unit } from "@/types/supabase.types"

export interface KitchenWithUnit extends Kitchen {
	unit: Unit | null
}

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
