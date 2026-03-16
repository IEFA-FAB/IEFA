import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"

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

export const fetchUserNrOrdemFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ userId: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient().schema("sisub").from("user_data").select("nrOrdem").eq("id", data.userId).maybeSingle()

		if (error) throw new Error(error.message)

		const value = result?.nrOrdem as string | number | null | undefined
		const asString = value != null ? String(value) : null
		return asString && asString.trim().length > 0 ? asString : null
	})

export const syncUserNrOrdemFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ userId: z.string(), email: z.string(), nrOrdem: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient()
			.schema("sisub")
			.from("user_data")
			.upsert({ id: data.userId, email: data.email, nrOrdem: data.nrOrdem }, { onConflict: "id" })

		if (error) throw new Error(error.message)
	})

export const syncUserEmailFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ userId: z.string(), email: z.string().optional() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient()
			.schema("sisub")
			.from("user_data")
			.upsert({ id: data.userId, email: data.email ?? "" }, { onConflict: "id" })

		if (error) throw new Error(error.message)
	})
