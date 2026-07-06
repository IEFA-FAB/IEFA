/**
 * @module auth.server
 * Resolve o UserContext autenticado dentro de server functions do sucont e aplica
 * os gates de autorização PBAC do módulo `sucont` (tabela compartilhada
 * access_control.user_permissions do ERP).
 *
 * Níveis do módulo `sucont` (grant global/unscoped):
 *   - 1 = acessar o hub e ferramentas (requireSucontAccess)
 *   - 2 = editar dados da seção: área de trabalho, relatórios, mensagens (requireSucontEditor)
 *   - 3 = gerenciar grants do sucont (requireSucontAdmin)
 *
 * A engine (hasPermission/resolveUserPermissions) e o guard vêm de @iefa/pbac —
 * compartilhados com sisub/rumaer. Aqui apenas mapeamos os erros para status HTTP.
 */

import { PermissionDeniedError, requirePermission, resolveUserPermissions, type UserContext } from "@iefa/pbac"
import type { User } from "@supabase/supabase-js"
import { getRequest, setResponseStatus } from "@tanstack/react-start/server"
import { getAccessControlClient, getSucontAuthClient } from "#/lib/supabase.server"

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
 * concorrentes. Mesmo padrão do sisub/rumaer.
 */
const userByRequest = new WeakMap<Request, Promise<User | null>>()

export function getRequestUser(): Promise<User | null> {
	const resolve = () =>
		getSucontAuthClient()
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
 * @throws "UNAUTHORIZED" (401) se o JWT estiver ausente/inválido.
 */
export async function requireAuth(): Promise<UserContext> {
	const user = await getRequestUser()
	if (!user) unauthorized()

	const permissions = await resolveUserPermissions(user.id, getAccessControlClient())
	return { userId: user.id, permissions }
}

/** Gate de acesso ao hub: exige grant `sucont` nível 1. 403 se autenticado sem acesso. */
export async function requireSucontAccess(): Promise<UserContext> {
	return requireSucontLevel(1)
}

/** Gate de escrita da seção: exige grant `sucont` nível 2. */
export async function requireSucontEditor(): Promise<UserContext> {
	return requireSucontLevel(2)
}

/** Gate de administração de grants do SUCONT: exige grant `sucont` nível 3. */
export async function requireSucontAdmin(): Promise<UserContext> {
	return requireSucontLevel(3)
}

async function requireSucontLevel(minLevel: 1 | 2 | 3): Promise<UserContext> {
	const ctx = await requireAuth()
	try {
		requirePermission(ctx, "sucont", minLevel)
	} catch (e) {
		if (e instanceof PermissionDeniedError) forbidden("sucont")
		throw e
	}
	return ctx
}
