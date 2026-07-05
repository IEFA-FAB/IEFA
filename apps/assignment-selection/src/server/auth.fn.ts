import { createServerFn } from "@tanstack/react-start"
import { getRequestUser, resolveAccess } from "@/lib/auth.server"

/**
 * Usuário validado no servidor (via `getUser`) + autorização (PBAC) no painel.
 * Não lança: retorna `null`/`authorized:false` para visitantes anônimos, para que
 * o telão público "/" nunca quebre. O gate de rota é responsabilidade do beforeLoad.
 * `session` é sempre null: no servidor só confiamos no `user` validado — `getSession`
 * apenas lê o cookie sem verificar o JWT, então não o expomos.
 */
export const getServerSessionFn = createServerFn({ method: "GET" }).handler(async () => {
	const user = await getRequestUser()
	const access = await resolveAccess(user)
	return { user, session: null, access }
})
