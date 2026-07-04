/**
 * @module auth.server
 * Resolve o UserContext autenticado dentro de server functions do rumaer e aplica
 * os gates de autorização PBAC do módulo `rumaer` (tabela compartilhada
 * access_control.user_permissions do ERP).
 *
 * Níveis do módulo `rumaer` (grant global/unscoped):
 *   - 2 = editar uniformes (requireUniformEditor)
 *   - 3 = gerenciar grants do rumaer (requireRumaerAdmin)
 *
 * A engine (hasPermission/resolveUserPermissions) e o guard vêm de @iefa/pbac —
 * compartilhados com o sisub. Aqui apenas mapeamos os erros para status HTTP.
 */

import { PermissionDeniedError, requirePermission, resolveUserPermissions, type UserContext } from "@iefa/pbac"
import type { User } from "@supabase/supabase-js"
import { getRequest, setResponseStatus } from "@tanstack/react-start/server"
import { getAccessControlClient, getRumaerAuthClient } from "@/lib/supabase.server"

/** Sinaliza 401 no HTTP antes de lançar — senão o erro sai como 500 (default do framework). */
function unauthorized(): never {
	setResponseStatus(401)
	throw new Error("UNAUTHORIZED")
}

/** Sinaliza 403 e lança — negação de permissão (autenticado, sem acesso). */
function forbidden(module: string): never {
	setResponseStatus(403)
	throw new Error(`FORBIDDEN: ${module}`)
}

/**
 * Cache request-scoped do `auth.getUser()` — valida o JWT no servidor Supabase
 * (round-trip de rede) e é chamado várias vezes por request (session no __root +
 * gates das server functions filhas). Chaveado pelo `Request`; o WeakMap libera
 * a entrada quando o request é coletado. Cacheia a Promise para coalescer chamadas
 * concorrentes. Mesmo padrão do sisub (apps/sisub/src/lib/auth.server.ts).
 */
const userByRequest = new WeakMap<Request, Promise<User | null>>()

export function getRequestUser(): Promise<User | null> {
	const resolve = () =>
		getRumaerAuthClient()
			.auth.getUser()
			.then(({ data }) => data.user ?? null)

	const request = getRequest()
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
 * Valida o JWT do request e resolve as permissões PBAC (tabela access_control).
 * @throws "UNAUTHORIZED" (401) se o JWT estiver ausente/ inválido.
 */
export async function requireAuth(): Promise<UserContext> {
	const user = await getRequestUser()
	if (!user) unauthorized()

	const permissions = await resolveUserPermissions(user.id, getAccessControlClient())
	return { userId: user.id, permissions }
}

/** Gate de escrita do RUMAER: exige grant `rumaer` nível 2. 403 se autenticado sem acesso. */
export async function requireUniformEditor(): Promise<UserContext> {
	return requireRumaerLevel(2)
}

/** Gate de administração de grants do RUMAER: exige grant `rumaer` nível 3. */
export async function requireRumaerAdmin(): Promise<UserContext> {
	return requireRumaerLevel(3)
}

async function requireRumaerLevel(minLevel: 2 | 3): Promise<UserContext> {
	const ctx = await requireAuth()
	try {
		requirePermission(ctx, "rumaer", minLevel)
	} catch (e) {
		if (e instanceof PermissionDeniedError) forbidden("rumaer")
		throw e
	}
	return ctx
}
