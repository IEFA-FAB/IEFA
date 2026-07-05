import type { Database } from "@iefa/database"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { getRequest, setCookie } from "@tanstack/react-start/server"
import { envServer } from "@/env.server"

/**
 * Cliente Supabase com service role para o schema `assignment_selection`.
 * Bypass de RLS — use apenas em server functions (*.fn.ts).
 * Nunca importe em código client-side.
 */
export function getAssignmentServerClient() {
	return createClient<Database, "assignment_selection">(envServer.VITE_ASSIGNMENT_SELECTION_SUPABASE_URL, envServer.ASSIGNMENT_SELECTION_SUPABASE_SECRET_KEY, {
		db: { schema: "assignment_selection" },
		auth: { persistSession: false },
	})
}

/**
 * Cliente SSR que lê/escreve os cookies de sessão da request (via TanStack Start).
 * É o cliente usado para validar a sessão do usuário no servidor
 * (`auth.getUser()` / `auth.getSession()`). Diferente do service-role client,
 * respeita a identidade do usuário logado.
 */
export function getSupabaseAuthClient() {
	return createServerClient<Database, "assignment_selection">(
		envServer.VITE_ASSIGNMENT_SELECTION_SUPABASE_URL,
		envServer.ASSIGNMENT_SELECTION_SUPABASE_SECRET_KEY,
		{
			db: { schema: "assignment_selection" },
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
