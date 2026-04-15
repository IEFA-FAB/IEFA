/**
 * @module mess-halls.fn
 * Reference data: all units and mess halls. Read-only, no input validation.
 * CLIENT: getSupabaseServerClient (service role) — all functions.
 * TABLES: units, mess_halls.
 */

import { createServerFn } from "@tanstack/react-start"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { MessHall, Unit } from "@/types/domain/meal"

/**
 * Lists all units ordered by display_name with id, code and display_name fields.
 *
 * @throws {Error} on Supabase query failure.
 */
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

/**
 * Lists all mess halls ordered by display_name with unit_id and kitchen_id associations.
 *
 * @throws {Error} on Supabase query failure.
 */
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
