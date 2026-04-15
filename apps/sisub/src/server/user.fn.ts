/**
 * @module user.fn
 * User profile and military data sync in the sisub schema.
 * CLIENT: getSupabaseServerClient (service role) — all functions. Uses explicit .schema("sisub") on user_data.
 * TABLES: user_data (schema sisub), user_military_data.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"

/**
 * Fetches a user's sisub profile row including email, nrOrdem and default_mess_hall_id. Returns null if not found.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchUserDataFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ userId: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.schema("sisub")
			.from("user_data")
			.select("id,email,nrOrdem,created_at,default_mess_hall_id")
			.eq("id", data.userId)
			.maybeSingle()

		if (error) throw new Error(error.message)
		return result
	})

/**
 * Fetches the most recent military record for a nrOrdem from user_military_data. Returns null if none found.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchMilitaryDataFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ nrOrdem: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("user_military_data")
			.select("nrOrdem, nrCpf, nmGuerra, nmPessoa, sgPosto, sgOrg, dataAtualizacao")
			.eq("nrOrdem", data.nrOrdem)
			.order("dataAtualizacao", { ascending: false, nullsFirst: false })
			.limit(1)
			.maybeSingle()

		if (error) throw new Error(error.message)
		return result ?? null
	})

/**
 * Returns the nrOrdem for a user as a trimmed non-empty string, or null if absent or blank.
 *
 * @remarks
 * Normalises: coerces number type to string, trims whitespace, returns null for empty string.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchUserNrOrdemFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ userId: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient().schema("sisub").from("user_data").select("nrOrdem").eq("id", data.userId).maybeSingle()

		if (error) throw new Error(error.message)

		const value = result?.nrOrdem as string | number | null | undefined
		const asString = value != null ? String(value) : null
		return asString && asString.trim().length > 0 ? asString : null
	})

/**
 * Upserts user_data with userId, email and nrOrdem (conflict on id).
 *
 * @remarks
 * SIDE EFFECTS: creates or updates sisub.user_data row.
 *
 * @throws {Error} on Supabase upsert failure.
 */
export const syncUserNrOrdemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ userId: z.string(), email: z.string(), nrOrdem: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient()
			.schema("sisub")
			.from("user_data")
			.upsert({ id: data.userId, email: data.email, nrOrdem: data.nrOrdem }, { onConflict: "id" })

		if (error) throw new Error(error.message)
	})

/**
 * Upserts user_data with userId and email (conflict on id). Sets email to "" if undefined. Does NOT touch nrOrdem.
 *
 * @remarks
 * SIDE EFFECTS: creates or updates sisub.user_data row.
 *
 * @throws {Error} on Supabase upsert failure.
 */
export const syncUserEmailFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ userId: z.string(), email: z.string().optional() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient()
			.schema("sisub")
			.from("user_data")
			.upsert({ id: data.userId, email: data.email ?? "" }, { onConflict: "id" })

		if (error) throw new Error(error.message)
	})
