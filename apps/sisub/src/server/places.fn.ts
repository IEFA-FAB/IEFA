import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { PlacesGraphData } from "@/types/domain/places"

// ─── Fetch ────────────────────────────────────────────────────────────────────

export const fetchPlacesGraphFn = createServerFn({ method: "GET" }).handler(async () => {
	const client = getSupabaseServerClient()

	const [unitsRes, kitchensRes, messHallsRes] = await Promise.all([
		client.from("units").select("*").order("display_name"),
		client.from("kitchen").select("*").order("display_name"),
		client.from("mess_halls").select("*").order("display_name"),
	])

	if (unitsRes.error) throw new Error(unitsRes.error.message)
	if (kitchensRes.error) throw new Error(kitchensRes.error.message)
	if (messHallsRes.error) throw new Error(messHallsRes.error.message)

	return {
		units: unitsRes.data ?? [],
		kitchens: kitchensRes.data ?? [],
		messHalls: messHallsRes.data ?? [],
	} satisfies PlacesGraphData
})

// ─── Update entity attributes ─────────────────────────────────────────────────

const updateEntitySchema = z.discriminatedUnion("entityType", [
	z.object({
		entityType: z.literal("unit"),
		id: z.number(),
		display_name: z.string().min(1, "Nome é obrigatório"),
		code: z.string().min(1, "Código é obrigatório"),
		type: z.enum(["consumption", "purchase"]).nullable(),
	}),
	z.object({
		entityType: z.literal("kitchen"),
		id: z.number(),
		display_name: z.string().min(1, "Nome é obrigatório"),
		type: z.enum(["consumption", "production"]).nullable(),
	}),
	z.object({
		entityType: z.literal("mess_hall"),
		id: z.number(),
		display_name: z.string().min(1, "Nome é obrigatório"),
		code: z.string().min(1, "Código é obrigatório"),
	}),
])

export type UpdateEntityInput = z.infer<typeof updateEntitySchema>

export const updatePlacesEntityFn = createServerFn({ method: "POST" })
	.inputValidator(updateEntitySchema)
	.handler(async ({ data }) => {
		const client = getSupabaseServerClient()

		if (data.entityType === "unit") {
			const { error } = await client.from("units").update({ display_name: data.display_name, code: data.code, type: data.type }).eq("id", data.id)
			if (error) throw new Error(error.message)
		} else if (data.entityType === "kitchen") {
			const { error } = await client.from("kitchen").update({ display_name: data.display_name, type: data.type }).eq("id", data.id)
			if (error) throw new Error(error.message)
		} else {
			const { error } = await client.from("mess_halls").update({ display_name: data.display_name, code: data.code }).eq("id", data.id)
			if (error) throw new Error(error.message)
		}

		return { ok: true }
	})

// ─── Apply relation diffs (batch) ─────────────────────────────────────────────

const diffItemSchema = z.object({
	table: z.enum(["kitchen", "mess_halls"]),
	recordId: z.number(),
	column: z.string(),
	newValue: z.number(),
})

export const applyPlacesDiffFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ diffs: z.array(diffItemSchema) }))
	.handler(async ({ data }) => {
		const client = getSupabaseServerClient()

		for (const diff of data.diffs) {
			const { error } = await client
				.from(diff.table)
				.update({ [diff.column]: diff.newValue })
				.eq("id", diff.recordId)

			if (error) {
				throw new Error(`Falha ao atualizar ${diff.table} (id ${diff.recordId}): ${error.message}`)
			}
		}

		return { ok: true, count: data.diffs.length }
	})
