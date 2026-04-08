import type { Database } from "@iefa/database"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { getRequest, setCookie } from "@tanstack/react-start/server"

import { envServer } from "@/lib/env.server"

/**
 * Cliente Supabase com service role para operações de dados no servidor.
 * Usa createClient (não SSR) — NÃO lê cookies de sessão do usuário, portanto
 * a Authorization header sempre carrega a service role key, garantindo bypass
 * de RLS em todas as queries.
 *
 * Use este cliente em todas as server functions de dados (*.fn.ts).
 * Nunca importe em código client-side.
 */
export function getSupabaseServerClient() {
	return createClient<Database, "sisub">(envServer.VITE_SISUB_SUPABASE_URL, envServer.SISUB_SUPABASE_SECRET_KEY, {
		db: { schema: "sisub" },
		auth: { persistSession: false },
	})
}

/**
 * Cliente Supabase SSR para operações de autenticação.
 * Lê e escreve cookies de sessão do usuário — necessário para
 * auth.getUser() / auth.getSession() funcionar corretamente no servidor.
 *
 * Use APENAS em auth.fn.ts. Para queries de dados, use getSupabaseServerClient().
 */
export function getSupabaseAuthClient() {
	return createServerClient<Database, "sisub">(envServer.VITE_SISUB_SUPABASE_URL, envServer.SISUB_SUPABASE_SECRET_KEY, {
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
	})
}
