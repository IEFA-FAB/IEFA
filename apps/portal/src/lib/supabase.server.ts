import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { getRequest, setCookie } from "@tanstack/react-start/server"
import { envServer } from "./env.server"

/**
 * Cliente Supabase com service role para operações de dados no servidor.
 * Bypass de RLS — use apenas em server functions (*.fn.ts).
 * Nunca importe em código client-side.
 *
 * Usa o schema "journal" por padrão.
 */
export function getJournalServerClient() {
	return createClient(envServer.VITE_IEFA_SUPABASE_URL, envServer.IEFA_SUPABASE_SECRET_KEY, {
		db: { schema: "journal" },
		auth: { persistSession: false },
	})
}

/**
 * Cliente Supabase SSR para operações de autenticação.
 * Lê e escreve cookies de sessão do usuário — necessário para
 * auth.getUser() / auth.getSession() funcionar corretamente no servidor.
 *
 * Use APENAS em auth.fn.ts. Para queries de dados, use getJournalServerClient().
 */
export function getIefaAuthClient() {
	return createServerClient(envServer.VITE_IEFA_SUPABASE_URL, envServer.IEFA_SUPABASE_SECRET_KEY, {
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
