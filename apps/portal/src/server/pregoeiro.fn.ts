/**
 * @module pregoeiro.fn
 * Server functions para pregoeiro_preferences (schema default) e
 * facilities_pregoeiro (schema iefa).
 */

import { createClient } from "@supabase/supabase-js"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { forbidden, requireSelf, requireUserId } from "@/lib/auth.server"
import { envServer } from "@/lib/env.server"

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
	.validator(z.object({ userId: z.string() }))
	.handler(async ({ data }) => {
		const userId = await requireSelf(data.userId)
		const { data: result, error } = await getDefaultClient().from("pregoeiro_preferences").select("*").eq("user_id", userId).maybeSingle()
		if (error) throw new Error(error.message)
		return result
	})

export const insertPreferencesFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			userId: z.string(),
			env: z.record(z.string(), z.unknown()),
			is_open: z.boolean(),
		})
	)
	.handler(async ({ data }) => {
		const userId = await requireSelf(data.userId)
		const { error } = await getDefaultClient().from("pregoeiro_preferences").insert({ user_id: userId, env: data.env, is_open: data.is_open })
		if (error) throw new Error(error.message)
	})

export const upsertPreferencesFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			userId: z.string(),
			env: z.record(z.string(), z.unknown()).optional(),
			is_open: z.boolean().optional(),
			table_settings: z.record(z.string(), z.unknown()).optional(),
		})
	)
	.handler(async ({ data }) => {
		const userId = await requireSelf(data.userId)
		const payload: Record<string, unknown> = {
			user_id: userId,
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
	.validator(
		z.object({
			id: z.string(),
			ownerId: z.string(),
			payload: FacilityPayloadSchema,
		})
	)
	.handler(async ({ data }) => {
		// O `eq("owner_id")` é a autorização da linha — por isso ele tem de vir da sessão,
		// não do payload (senão basta informar o owner alheio para editar a frase dele).
		const userId = await requireSelf(data.ownerId)
		const { error } = await getPortalClient().from("facilities_pregoeiro").update(data.payload).eq("id", data.id).eq("owner_id", userId)
		if (error) throw new Error(error.message)
	})

export const insertFacilityFn = createServerFn({ method: "POST" })
	.validator(FacilityPayloadSchema)
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		// `default: true` marca a frase como padrão do sistema para todo mundo — não é
		// algo que um usuário comum publica pela API.
		if (data.default) forbidden("Frase padrão só pode ser criada pela administração.")
		const { error } = await getPortalClient()
			.from("facilities_pregoeiro")
			.insert({ ...data, owner_id: userId })
		if (error) throw new Error(error.message)
	})

// ─── Apps (iefa schema) ───────────────────────────────────────────────────────

/**
 * Catálogo de apps renderizado na home pública (`_public/index.tsx`) — exigir sessão
 * aqui apagaria a vitrine do portal para visitante anônimo.
 */
// nosemgrep: server-fn-missing-auth-guard
export const getAppsFn = createServerFn({ method: "GET" })
	.validator(z.object({ limit: z.number().optional() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getPortalClient()
			.from("apps")
			.select(
				`id, title, description, to_path, href, icon_key, external, badges,
				contributors:app_contributors!app_contributors_app_id_fkey(label, url, icon_key)`
			)
			.order("title", { ascending: true })
			.limit(data.limit ?? 50)
		if (error) throw new Error(error.message)
		return result ?? []
	})

/**
 * Biblioteca de frases do pregoeiro, lida na ferramenta pública (`_public/.../pregoeiro`)
 * antes de qualquer login. Mantido público para não quebrar a ferramenta — mas note que
 * isso expõe TODAS as frases, inclusive as de `owner_id` de outros usuários. Se a
 * intenção era biblioteca compartilhada, ok; se não, o filtro por dono é um follow-up
 * de produto, não de segurança.
 */
// nosemgrep: server-fn-missing-auth-guard
export const getFacilitiesFn = createServerFn({ method: "GET" }).handler(async () => {
	const { data: result, error } = await getPortalClient().from("facilities_pregoeiro").select("*")
	if (error) throw new Error(error.message)
	return result ?? []
})
