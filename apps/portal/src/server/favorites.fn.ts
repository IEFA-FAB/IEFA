/**
 * @module favorites.fn
 * Server functions para iefa.user_app_favorites — apps favoritados por usuário.
 * Acesso via service role (schema iefa). Fallback anônimo é feito no cliente
 * (localStorage) pelo hook useAppFavorites.
 */

import { createClient } from "@supabase/supabase-js"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { envServer } from "@/lib/env.server"

function getPortalClient() {
	return createClient(envServer.VITE_IEFA_SUPABASE_URL, envServer.IEFA_SUPABASE_SECRET_KEY, {
		db: { schema: "iefa" },
		auth: { persistSession: false },
	})
}

export const getFavoritesFn = createServerFn({ method: "GET" })
	.validator(z.object({ userId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { data: row, error } = await getPortalClient().from("user_app_favorites").select("app_ids").eq("user_id", data.userId).maybeSingle()
		if (error) throw new Error(error.message)
		return ((row?.app_ids as string[] | undefined) ?? []) as string[]
	})

export const setFavoritesFn = createServerFn({ method: "POST" })
	.validator(z.object({ userId: z.string().uuid(), appIds: z.array(z.string().uuid()) }))
	.handler(async ({ data }) => {
		const { error } = await getPortalClient()
			.from("user_app_favorites")
			.upsert({ user_id: data.userId, app_ids: data.appIds, updated_at: new Date().toISOString() })
		if (error) throw new Error(error.message)
	})
