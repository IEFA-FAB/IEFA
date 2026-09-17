/**
 * @module apps.fn
 * Catálogo de apps da suíte (`iefa.apps`), mostrado na home e na busca do portal.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getPortalServerClient } from "@/lib/supabase.server"

/**
 * Catálogo de apps renderizado na home pública (`_public/index.tsx`) — exigir sessão
 * aqui apagaria a vitrine do portal para visitante anônimo.
 */
// nosemgrep: server-fn-missing-auth-guard
export const getAppsFn = createServerFn({ method: "GET" })
	.validator(z.object({ limit: z.number().optional() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getPortalServerClient()
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
