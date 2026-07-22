/**
 * @module auth.server
 * Resolve authenticated UserContext inside server functions.
 * Throws on unauthenticated requests — server fn returns 401.
 */

import { resolveUserPermissions } from "@iefa/pbac"
import { requirePermission } from "@iefa/sisub-domain"
import type { AppModule, PermissionScope, UserContext } from "@iefa/sisub-domain/types"
import type { User } from "@supabase/supabase-js"
import { getRequest, setResponseStatus } from "@tanstack/react-start/server"
import { handleDomainError } from "@/lib/domain-errors"
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
 * Usuário autenticado completo (id + email do JWT). Use quando a server fn precisa
 * do email: ele DEVE vir da sessão, nunca do payload — um email vindo do cliente
 * permite reivindicar a identidade de outra conta (ver `upsertUserDataReclaimingEmail`).
 *
 * @throws {Error} "UNAUTHORIZED" se o JWT estiver ausente ou inválido.
 */
export async function requireUser(): Promise<User> {
	const user = await getRequestUser()
	if (!user) unauthorized()
	return user
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

/**
 * `requireAuth` + guard PBAC no próprio server fn, para endpoints que NÃO delegam a
 * uma domain operation (proxies para a API, lookups externos). Nesses casos o guard
 * de rota (`beforeLoad`) é a única barreira — e ele não protege nada: o endpoint
 * `/_serverFn/...` é chamável direto, sem passar pelo router.
 *
 * Espelhe aqui o mesmo módulo/nível exigido pela rota que consome o fn.
 *
 * @throws {Error} "UNAUTHORIZED" (401) sem sessão; "Requires {module} level {n}" (403) sem permissão.
 */
export async function requireAuthWithPermission(module: AppModule, minLevel: 1 | 2 = 1, scope?: PermissionScope): Promise<UserContext> {
	const ctx = await requireAuth()
	try {
		requirePermission(ctx, module, minLevel, scope)
	} catch (error) {
		handleDomainError(error)
	}
	return ctx
}
