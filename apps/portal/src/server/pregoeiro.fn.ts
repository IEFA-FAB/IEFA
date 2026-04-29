/**
 * @module pregoeiro.fn
 * Server functions para pregoeiro_preferences (schema default) e
 * facilities_pregoeiro (schema iefa).
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { envServer } from "@/lib/env.server"
import { createClient } from "@supabase/supabase-js"

function getDefaultClient() {
	return createClient(envServer.VITE_IEFA_SUPABASE_URL, envServer.IEFA_SUPABASE_SECRET_KEY, {
		auth: { persistSession: false },
	})
}

function getPortalClient() {
	return createClient(envServer.VITE_IEFA_SUPABASE_URL, envServer.IEFA_SUPABASE_SECRET_KEY, {
		db: { schema: "iefa" },
		auth: { persistSession: false },
	})
}

// ─── Pregoeiro Preferences ────────────────────────────────────────────────────

export const getPreferencesFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ userId: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getDefaultClient().from("pregoeiro_preferences").select("*").eq("user_id", data.userId).maybeSingle()
		if (error) throw new Error(error.message)
		return result
	})

export const insertPreferencesFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			userId: z.string(),
			env: z.record(z.unknown()),
			is_open: z.boolean(),
		})
	)
	.handler(async ({ data }) => {
		const { error } = await getDefaultClient().from("pregoeiro_preferences").insert({ user_id: data.userId, env: data.env, is_open: data.is_open })
		if (error) throw new Error(error.message)
	})

export const upsertPreferencesFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			userId: z.string(),
			env: z.record(z.unknown()).optional(),
			is_open: z.boolean().optional(),
			table_settings: z.record(z.unknown()).optional(),
		})
	)
	.handler(async ({ data }) => {
		const payload: Record<string, unknown> = {
			user_id: data.userId,
			updated_at: new Date().toISOString(),
		}
		if (data.env !== undefined) payload.env = data.env
		if (data.is_open !== undefined) payload.is_open = data.is_open
		if (data.table_settings !== undefined) payload.table_settings = data.table_settings

		const { error } = await getDefaultClient().from("pregoeiro_preferences").upsert(payload)
		if (error) throw new Error(error.message)
	})

// ─── Facilities Pregoeiro (frases) ────────────────────────────────────────────

const FacilityPayloadSchema = z.object({
	phase: z.string(),
	title: z.string(),
	content: z.string(),
	tags: z.array(z.string()).nullable(),
	owner_id: z.string().nullable(),
	default: z.boolean().nullable().optional(),
})

export const updateFacilityFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			id: z.string(),
			ownerId: z.string(),
			payload: FacilityPayloadSchema,
		})
	)
	.handler(async ({ data }) => {
		const { error } = await getPortalClient().from("facilities_pregoeiro").update(data.payload).eq("id", data.id).eq("owner_id", data.ownerId)
		if (error) throw new Error(error.message)
	})

export const insertFacilityFn = createServerFn({ method: "POST" })
	.inputValidator(FacilityPayloadSchema)
	.handler(async ({ data }) => {
		const { error } = await getPortalClient().from("facilities_pregoeiro").insert(data)
		if (error) throw new Error(error.message)
	})

// ─── Apps (iefa schema) ───────────────────────────────────────────────────────

export const getAppsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ limit: z.number().optional() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getPortalClient()
			.from("apps")
			.select(
				`title, description, to_path, href, icon_key, external, badges,
				contributors:app_contributors!app_contributors_app_id_fkey(label, url, icon_key)`
			)
			.order("title", { ascending: true })
			.limit(data.limit ?? 50)
		if (error) throw new Error(error.message)
		return result ?? []
	})

export const getFacilitiesFn = createServerFn({ method: "GET" }).handler(async () => {
	const { data: result, error } = await getPortalClient().from("facilities_pregoeiro").select("*")
	if (error) throw new Error(error.message)
	return result ?? []
})
