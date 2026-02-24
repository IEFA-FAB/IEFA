import { createServerFn } from "@tanstack/react-start"
import type { KitchenWithUnit } from "@/hooks/data/useKitchens"
import { supabaseServer } from "@/lib/supabase.server"

export const fetchKitchensFn = createServerFn({ method: "GET" }).handler(async () => {
	const { data, error } = await supabaseServer
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
