import type { Database } from "@iefa/database"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { getRequest, setCookie } from "@tanstack/react-start/server"
import { envServer } from "#/lib/env.server"

/**
 * Cliente Supabase com service role para operações de dados no schema `sucont`.
 * Bypass de RLS — use apenas em server functions (*.fn.ts). A autorização é
 * aplicada na camada de app (@iefa/pbac), não por RLS. Nunca importe no cliente.
 */
export function getSucontServerClient() {
	return createClient<Database, "sucont">(envServer.VITE_SUCONT_SUPABASE_URL, envServer.SUCONT_SUPABASE_SECRET_KEY, {
		db: { schema: "sucont" },
		auth: { persistSession: false },
	})
}

/**
 * Cliente service role apontando para o schema `access_control` — tabela
 * `user_permissions` compartilhada entre os apps do ERP (sisub, rumaer, sucont).
 * Bypass de RLS; use apenas em server functions.
 */
export function getAccessControlClient() {
	return createClient<Database, "access_control">(envServer.VITE_SUCONT_SUPABASE_URL, envServer.SUCONT_SUPABASE_SECRET_KEY, {
		db: { schema: "access_control" },
		auth: { persistSession: false },
	})
}

/**
 * Cliente service role apontando para o schema `core` — usado apenas para LER
 * o perfil do usuário (user_data) na busca por e-mail da gestão de acessos.
 */
export function getCoreReadClient() {
	return createClient<Database, "core">(envServer.VITE_SUCONT_SUPABASE_URL, envServer.SUCONT_SUPABASE_SECRET_KEY, {
		db: { schema: "core" },
		auth: { persistSession: false },
	})
}

/**
 * Cliente Supabase SSR para operações de autenticação.
 * Lê e escreve cookies de sessão — necessário para auth.getUser() no servidor.
 * Use APENAS em auth.fn.ts / auth.server.ts. Para dados, use getSucontServerClient().
 */
export function getSucontAuthClient() {
	return createServerClient(envServer.VITE_SUCONT_SUPABASE_URL, envServer.SUCONT_SUPABASE_SECRET_KEY, {
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
