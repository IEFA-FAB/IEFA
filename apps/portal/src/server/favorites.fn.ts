/**
 * @module favorites.fn
 * Server functions para iefa.user_app_favorites — apps favoritados por usuário.
 * Acesso via service role (schema iefa). Fallback anônimo é feito no cliente
 * (localStorage) pelo hook useAppFavorites.
 */

import { createClient } from "@supabase/supabase-js"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireSelf } from "@/lib/auth.server"
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
		// Self-only: a lista de favoritos é do usuário da sessão, não de um uuid do payload.
		const userId = await requireSelf(data.userId)
		const { data: row, error } = await getPortalClient().from("user_app_favorites").select("app_ids").eq("user_id", userId).maybeSingle()
		if (error) throw new Error(error.message)
		return ((row?.app_ids as string[] | undefined) ?? []) as string[]
	})

export const setFavoritesFn = createServerFn({ method: "POST" })
	.validator(z.object({ userId: z.string().uuid(), appIds: z.array(z.string().uuid()) }))
	.handler(async ({ data }) => {
		const userId = await requireSelf(data.userId)
		const { error } = await getPortalClient().from("user_app_favorites").upsert({ user_id: userId, app_ids: data.appIds, updated_at: new Date().toISOString() })
		if (error) throw new Error(error.message)
	})
