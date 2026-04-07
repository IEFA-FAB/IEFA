import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { PlacesGraphData } from "@/types/domain/places"
import type { KitchenUpdate, MessHallUpdate } from "@/types/supabase.types"

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

const diffItemSchema = z.discriminatedUnion("table", [
	z.object({
		table: z.literal("kitchen"),
		recordId: z.number(),
		column: z.enum(["unit_id", "purchase_unit_id", "kitchen_id"]),
		newValue: z.number(),
	}),
	z.object({
		table: z.literal("mess_halls"),
		recordId: z.number(),
		column: z.enum(["unit_id", "kitchen_id"]),
		newValue: z.number(),
	}),
])

function buildKitchenUpdate(column: "unit_id" | "purchase_unit_id" | "kitchen_id", newValue: number): KitchenUpdate {
	switch (column) {
		case "unit_id":
			return { unit_id: newValue }
		case "purchase_unit_id":
			return { purchase_unit_id: newValue }
		case "kitchen_id":
			return { kitchen_id: newValue }
	}
}

function buildMessHallUpdate(column: "unit_id" | "kitchen_id", newValue: number): MessHallUpdate {
	switch (column) {
		case "unit_id":
			return { unit_id: newValue }
		case "kitchen_id":
			return { kitchen_id: newValue }
	}
}

export const applyPlacesDiffFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ diffs: z.array(diffItemSchema) }))
	.handler(async ({ data }) => {
		const client = getSupabaseServerClient()

		for (const diff of data.diffs) {
			const { error } =
				diff.table === "kitchen"
					? await client.from("kitchen").update(buildKitchenUpdate(diff.column, diff.newValue)).eq("id", diff.recordId)
					: await client.from("mess_halls").update(buildMessHallUpdate(diff.column, diff.newValue)).eq("id", diff.recordId)

			if (error) {
				throw new Error(`Falha ao atualizar ${diff.table} (id ${diff.recordId}): ${error.message}`)
			}
		}

		return { ok: true, count: data.diffs.length }
	})
