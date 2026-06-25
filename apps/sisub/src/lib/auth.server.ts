/**
 * @module auth.server
 * Resolve authenticated UserContext inside server functions.
 * Throws on unauthenticated requests — server fn returns 401.
 */

import { resolveUserPermissions } from "@iefa/pbac"
import type { UserContext } from "@iefa/sisub-domain/types"
import type { User } from "@supabase/supabase-js"
import { getRequest, setResponseStatus } from "@tanstack/react-start/server"
import { getAccessControlClient, getSupabaseAuthClient } from "@/lib/supabase.server"

/** Sinaliza 401 no HTTP antes de lançar — senão o erro sai como 500 (default do framework). */
function unauthorized(): never {
	setResponseStatus(401)
	throw new Error("UNAUTHORIZED")
}

/**
 * Cache request-scoped do `auth.getUser()`. `getUser()` valida o JWT no servidor
 * Supabase (round-trip de rede), e num único SSR ele é chamado várias vezes:
 * `getServerSessionFn` no __root, depois `requireUserId`/`requireAuth` nas server
 * functions filhas (permissions, syncs). Sem cache, cada chamada paga a rede de novo
 * — somava ~1 round-trip GoTrue inteiro ao TTFB de toda navegação protegida.
 *
 * Chaveado pelo objeto `Request` (estável dentro de um request via AsyncLocalStorage
 * do TanStack Start; instância nova por request HTTP do cliente). O WeakMap libera a
 * entrada quando o request é coletado. Cacheamos a Promise (não o valor resolvido)
 * para coalescer chamadas concorrentes — duas getUser() simultâneas dividem 1 round-trip.
 */
const userByRequest = new WeakMap<Request, Promise<User | null>>()

export function getRequestUser(): Promise<User | null> {
	const resolve = () =>
		getSupabaseAuthClient()
			.auth.getUser()
			.then(({ data }) => data.user ?? null)

	const request = getRequest()
	// Fora de um contexto de request (improvável em server fn) cai no caminho sem cache.
	if (!request) return resolve()

	let cached = userByRequest.get(request)
	if (!cached) {
		cached = resolve()
		userByRequest.set(request, cached)
	}
	return cached
}

export async function requireUserId(): Promise<string> {
	const user = await getRequestUser()
	if (!user) unauthorized()
	return user.id
}

/**
 * Validates the request's JWT (via SSR cookies) and resolves PBAC permissions.
 * Call at the start of every server function that touches protected data.
 *
 * @throws {Error} "UNAUTHORIZED" if JWT is missing or invalid.
 */
export async function requireAuth(): Promise<UserContext> {
	const user = await getRequestUser()

	if (!user) {
		unauthorized()
	}

	// user_permissions vive em access_control (split de schemas por domínio).
	const dataClient = getAccessControlClient()
	const permissions = await resolveUserPermissions(user.id, dataClient)
	return { userId: user.id, permissions }
}
