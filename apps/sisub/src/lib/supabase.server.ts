"use server"

import { createServerClient } from "@supabase/ssr"
import { getRequest, setCookie } from "@tanstack/react-start/server"
import type { Database } from "@/types/database.types"

/**
 * Cria um cliente Supabase para uso exclusivo no servidor.
 * Usa a secret key — nunca importe esta função em código client-side.
 * Deve ser chamada dentro de handlers de server functions para garantir
 * o contexto de request/cookies correto por requisição.
 */
export function getSupabaseServerClient() {
	return createServerClient<Database>(
		process.env.VITE_SISUB_SUPABASE_URL!,
		process.env.SISUB_SUPABASE_SECRET_KEY!,
		{
			db: { schema: "sisub" },
			cookies: {
				getAll() {
					const request = getRequest()
					const cookieHeader = request?.headers.get("cookie")
					if (!cookieHeader) return []

					return cookieHeader.split(";").map((c) => {
						const [name, ...v] = c.split("=")
						return { name: name.trim(), value: v.join("=") }
					})
				},
				async setAll(cookies) {
					for (const { name, value, options } of cookies) {
						await setCookie(name, value, options)
					}
				},
			},
		}
	)
}
