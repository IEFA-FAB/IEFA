/**
 * @module pregoeiro.fn
 * Server functions das Facilidades do Pregoeiro: `pregoeiro_preferences` e
 * `facilities_pregoeiro`, as duas no schema `iefa`.
 *
 * No portal as preferências eram lidas por um `createClient` sem schema, que resolvia
 * em `public` — onde a tabela não existe. Aqui as duas passam pelo client do kit.
 */

import type { Json, TablesInsert } from "@iefa/database/generated"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { forbidden, requireSelf, requireUserId } from "@/lib/auth.server"
import { FacilityPayloadSchema, FacilityUpdateSchema } from "@/lib/pregoeiro-facility"
import { getIefaServerClient } from "@/lib/supabase.server"

// ─── Pregoeiro Preferences ────────────────────────────────────────────────────

export const getPreferencesFn = createServerFn({ method: "GET" })
	.validator(z.object({ userId: z.string() }))
	.handler(async ({ data }) => {
		const userId = await requireSelf(data.userId)
		const { data: result, error } = await getIefaServerClient().from("pregoeiro_preferences").select("*").eq("user_id", userId).maybeSingle()
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
		const { error } = await getIefaServerClient()
			.from("pregoeiro_preferences")
			.insert({ user_id: userId, env: data.env as Json, is_open: data.is_open })
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
		const payload: TablesInsert<{ schema: "iefa" }, "pregoeiro_preferences"> = {
			user_id: userId,
			updated_at: new Date().toISOString(),
		}
		if (data.env !== undefined) payload.env = data.env as Json
		if (data.is_open !== undefined) payload.is_open = data.is_open
		if (data.table_settings !== undefined) payload.table_settings = data.table_settings as Json

		const { error } = await getIefaServerClient().from("pregoeiro_preferences").upsert(payload)
		if (error) throw new Error(error.message)
	})

// ─── Facilities Pregoeiro (frases) ────────────────────────────────────────────

export const updateFacilityFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			id: z.string(),
			ownerId: z.string(),
			// Só o conteúdo: `owner_id` e `default` não são editáveis por aqui (ver o schema).
			payload: FacilityUpdateSchema,
		})
	)
	.handler(async ({ data }) => {
		// O `eq("owner_id")` é a autorização da linha — por isso ele tem de vir da sessão,
		// não do payload (senão basta informar o owner alheio para editar a frase dele).
		const userId = await requireSelf(data.ownerId)
		// Colunas nomeadas uma a uma, e não o payload espalhado: coluna nova no schema não
		// vira campo gravável pela edição sem alguém decidir isso aqui.
		const { phase, title, content, tags } = data.payload
		const { error } = await getIefaServerClient().from("facilities_pregoeiro").update({ phase, title, content, tags }).eq("id", data.id).eq("owner_id", userId)
		if (error) throw new Error(error.message)
	})

export const insertFacilityFn = createServerFn({ method: "POST" })
	.validator(FacilityPayloadSchema)
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		// `default: true` marca a frase como padrão do sistema para todo mundo — não é
		// algo que um usuário comum publica pela API.
		if (data.default) forbidden("Frase padrão só pode ser criada pela administração.")
		const { error } = await getIefaServerClient()
			.from("facilities_pregoeiro")
			.insert({ ...data, owner_id: userId })
		if (error) throw new Error(error.message)
	})

/**
 * Biblioteca de frases do pregoeiro, lida na ferramenta pública (`/pregoeiro`)
 * antes de qualquer login. Mantido público para não quebrar a ferramenta — mas note que
 * isso expõe TODAS as frases, inclusive as de `owner_id` de outros usuários. Se a
 * intenção era biblioteca compartilhada, ok; se não, o filtro por dono é um follow-up
 * de produto, não de segurança.
 */
// nosemgrep: server-fn-missing-auth-guard
export const getFacilitiesFn = createServerFn({ method: "GET" }).handler(async () => {
	const { data: result, error } = await getIefaServerClient().from("facilities_pregoeiro").select("*")
	if (error) throw new Error(error.message)
	return result ?? []
})
