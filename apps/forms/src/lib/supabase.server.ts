import { createServiceRoleClient } from "@iefa/supabase-kit"
import { createSsrAuthClient } from "@iefa/supabase-kit/start"
import { envServer } from "./env.server"

/**
 * Cliente Supabase com service role para o schema `forms`.
 * Bypass de RLS — use apenas em server functions (*.fn.ts).
 */
export function getFormsServerClient() {
	return createServiceRoleClient({
		url: envServer.VITE_IEFA_SUPABASE_URL,
		secretKey: envServer.IEFA_SUPABASE_SECRET_KEY,
		schema: "forms",
	})
}

/**
 * Cliente Supabase SSR para operações de autenticação.
 * Lê e escreve cookies de sessão — necessário para auth.getUser() no servidor.
 */
export function getIefaAuthClient() {
	// Publishable/anon key — NUNCA a service key: getUser() valida o JWT do cookie
	// de qualquer forma, e a service role faria uma query acidental por este client
	// burlar a RLS. Guard: opengrep `auth-client-secret-key`.
	return createSsrAuthClient({
		url: envServer.VITE_IEFA_SUPABASE_URL,
		key: envServer.VITE_IEFA_SUPABASE_PUBLISHABLE_KEY,
	})
}
