import { createServiceRoleClient } from "@iefa/supabase-kit"
import { createSsrAuthClient } from "@iefa/supabase-kit/start"
import { envServer } from "@/env.server"

/**
 * Cliente Supabase com service role para o schema `assignment_selection`.
 * Bypass de RLS — use apenas em server functions (*.fn.ts).
 * Nunca importe em código client-side.
 */
export function getAssignmentServerClient() {
	return createServiceRoleClient({
		url: envServer.VITE_ASSIGNMENT_SELECTION_SUPABASE_URL,
		secretKey: envServer.ASSIGNMENT_SELECTION_SUPABASE_SECRET_KEY,
		schema: "assignment_selection",
	})
}

/**
 * Cliente SSR que lê/escreve os cookies de sessão da request (via TanStack Start).
 * É o cliente usado para validar a sessão do usuário no servidor
 * (`auth.getUser()` / `auth.getSession()`). Diferente do service-role client,
 * respeita a identidade do usuário logado.
 */
export function getSupabaseAuthClient() {
	return createSsrAuthClient({
		url: envServer.VITE_ASSIGNMENT_SELECTION_SUPABASE_URL,
		key: envServer.VITE_ASSIGNMENT_SELECTION_SUPABASE_PUBLISHABLE_KEY,
		schema: "assignment_selection",
	})
}
