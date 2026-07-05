import { createServerFn } from "@tanstack/react-start"
import { getRequestUser, resolveAccess } from "@/lib/auth.server"
import { getSupabaseAuthClient } from "@/lib/supabase.server"

/**
 * Sessão do usuário validada no servidor + autorização (PBAC) no painel.
 * Não lança: retorna nulos/`authorized:false` para visitantes anônimos, para que
 * o telão público "/" nunca quebre. O gate de rota é responsabilidade do beforeLoad.
 */
export const getServerSessionFn = createServerFn({ method: "GET" }).handler(async () => {
	const supabase = getSupabaseAuthClient()
	const [user, sessionRes] = await Promise.all([getRequestUser(), supabase.auth.getSession()])
	const access = await resolveAccess(user)
	return { user, session: sessionRes.data.session ?? null, access }
})
