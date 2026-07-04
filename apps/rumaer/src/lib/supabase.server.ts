import type { Database } from "@iefa/database"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { getRequest, setCookie } from "@tanstack/react-start/server"
import { envServer } from "./env.server"

/**
 * Cliente Supabase com service role para operações de dados no schema rumaer.
 * Bypass de RLS — use apenas em server functions (*.fn.ts).
 * Nunca importe em código client-side.
 */
export function getRumaerServerClient() {
	return createClient<Database, "rumaer">(envServer.VITE_RUMAER_SUPABASE_URL, envServer.RUMAER_SUPABASE_SECRET_KEY, {
		db: { schema: "rumaer" },
		auth: { persistSession: false },
	})
}

/**
 * Cliente service role apontando para o schema `access_control` — tabela
 * `user_permissions` compartilhada entre os apps do ERP (sisub, rumaer).
 * Bypass de RLS; use apenas em server functions. A autorização por módulo/nível
 * é aplicada na camada de app (@iefa/pbac), não por RLS.
 */
export function getAccessControlClient() {
	return createClient<Database, "access_control">(envServer.VITE_RUMAER_SUPABASE_URL, envServer.RUMAER_SUPABASE_SECRET_KEY, {
		db: { schema: "access_control" },
		auth: { persistSession: false },
	})
}

/**
 * Cliente service role apontando para o schema `core` — usado apenas para LER
 * o perfil militar do usuário (user_data / user_military_data, movidos de sisub
 * para core no split de schemas por domínio). Read-only.
 */
export function getCoreReadClient() {
	return createClient<Database, "core">(envServer.VITE_RUMAER_SUPABASE_URL, envServer.RUMAER_SUPABASE_SECRET_KEY, {
		db: { schema: "core" },
		auth: { persistSession: false },
	})
}

/**
 * Cliente Supabase SSR para operações de autenticação.
 * Lê e escreve cookies de sessão — necessário para auth.getUser() no servidor.
 * Use APENAS em auth.fn.ts. Para queries de dados, use getRumaerServerClient().
 */
export function getRumaerAuthClient() {
	return createServerClient(envServer.VITE_RUMAER_SUPABASE_URL, envServer.RUMAER_SUPABASE_SECRET_KEY, {
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
