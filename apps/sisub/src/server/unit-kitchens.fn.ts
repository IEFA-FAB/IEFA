import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"

export type UnitKitchen = {
	id: number
	display_name: string | null
}

export const fetchUnitKitchensFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ unitId: z.number() }))
	.handler(async ({ data }): Promise<UnitKitchen[]> => {
		const supabase = getSupabaseServerClient()
		const { data: kitchens, error } = await supabase.from("kitchen").select("id, display_name").eq("unit_id", data.unitId).order("display_name")
		if (error) throw new Error(`Erro ao buscar cozinhas da unidade: ${error.message}`)
		return kitchens || []
	})
