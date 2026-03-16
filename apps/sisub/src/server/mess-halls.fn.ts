import { createServerFn } from "@tanstack/react-start"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { MessHall, Unit } from "@/types/domain/meal"

export const fetchUnitsFn = createServerFn({ method: "GET" }).handler(async () => {
	const { data, error } = await getSupabaseServerClient().from("units").select("id, code, display_name").order("display_name", { ascending: true })

	if (error) throw new Error(error.message)

	return (data ?? []).map((row) => ({
		id: row.id,
		code: row.code,
		display_name: row.display_name,
		type: null,
	})) as Unit[]
})

export const fetchMessHallsFn = createServerFn({ method: "GET" }).handler(async () => {
	const { data, error } = await getSupabaseServerClient()
		.from("mess_halls")
		.select("id, unit_id, code, display_name, kitchen_id")
		.order("display_name", { ascending: true })

	if (error) throw new Error(error.message)

	return (data ?? []).map((row) => ({
		id: row.id,
		unit_id: row.unit_id,
		code: row.code,
		display_name: row.display_name,
		kitchen_id: row.kitchen_id,
	})) as MessHall[]
})
