import { createRequestAuth, forbidden, unauthorized } from "@iefa/pbac/start"
import type { User } from "@supabase/supabase-js"
import { getAssignmentServerClient, getSupabaseAuthClient } from "@/lib/supabase.server"

/** Autorização do usuário no painel: existe concessão ativa? */
export interface AppAccess {
	authorized: boolean
	role: string | null
}

const auth = createRequestAuth({ getAuthClient: getSupabaseAuthClient, messages: { unauthorized: "Não autenticado" } })

/** Usuário autenticado da request (JWT validado no servidor), ou null. */
export const { getRequestUser } = auth

/**
 * Resolve a autorização (PBAC) do usuário: procura uma concessão ativa por e-mail
 * na tabela `assignment_selection.access_grant`. Usa o service-role client (leitura
 * server-only), então nunca depende de RLS/JWT no cliente.
 */
export async function resolveAccess(user: User | null): Promise<AppAccess> {
	const email = user?.email?.toLowerCase()
	if (!email) return { authorized: false, role: null }

	const supabase = getAssignmentServerClient()
	const { data } = await supabase.from("access_grant").select("role").eq("email", email).eq("active", true).maybeSingle()

	return { authorized: !!data, role: data?.role ?? null }
}

/**
 * Exige um usuário autenticado. Responde 401 e lança se não houver sessão.
 * Use no topo de server functions de escrita (que rodam com service role).
 */
export async function requireUserId(): Promise<string> {
	const user = await getRequestUser()
	if (!user?.id) unauthorized("Não autenticado")
	return user.id
}

/**
 * Exige usuário autenticado E autorizado (concessão ativa). Responde 401/403 e
 * lança. Use no topo das server functions de escrita do painel.
 */
export async function requireAccess(): Promise<{ user: User; access: AppAccess }> {
	const user = await getRequestUser()
	if (!user?.id) unauthorized("Não autenticado")
	const access = await resolveAccess(user)
	if (!access.authorized) forbidden("Sem acesso ao painel")
	return { user, access }
}
