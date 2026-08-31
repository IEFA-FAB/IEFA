/**
 * @module auth.server
 * Resolve o UserContext autenticado dentro das server functions do sisub.
 * Lança em request sem sessão — a server fn devolve 401.
 *
 * O cache request-scoped do `getUser()` e a sinalização de 401/403 vêm de
 * `@iefa/pbac/start`, compartilhados com portal, rumaer, sucont, forms e
 * assignment-selection. O guard abaixo continua daqui porque o sisub mapeia a
 * negativa pela hierarquia `DomainError` (`handleDomainError`), não pelo 403 cru
 * do pacote.
 */

import { createRequestAuth } from "@iefa/pbac/start"
import { requirePermission } from "@iefa/sisub-domain"
import type { AppModule, PermissionScope, UserContext } from "@iefa/sisub-domain/types"
import { handleDomainError } from "@/lib/domain-errors"
import { getAccessControlClient, getSupabaseAuthClient } from "@/lib/supabase.server"

const auth = createRequestAuth({
	getAuthClient: getSupabaseAuthClient,
	getPermissionsClient: getAccessControlClient,
})

/** Usuário da request, ou `null`. Nunca lança — para caminhos de auth opcional. */
export const { getRequestUser, requireUserId } = auth

/**
 * Usuário autenticado completo (id + email do JWT). Use quando a server fn precisa
 * do email: ele DEVE vir da sessão, nunca do payload — um email vindo do cliente
 * permite reivindicar a identidade de outra conta (ver `upsertUserDataReclaimingEmail`).
 *
 * @throws {Error} "UNAUTHORIZED" se o JWT estiver ausente ou inválido.
 */
export const requireUser = auth.requireUser

/**
 * Valida o JWT do request (cookies SSR) e resolve as permissões PBAC.
 * Chame no início de toda server function que toca dado protegido.
 *
 * @throws {Error} "UNAUTHORIZED" se o JWT estiver ausente ou inválido.
 */
export const requireAuth: () => Promise<UserContext> = auth.requireAuth

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
export async function requireAuthWithPermission(module: AppModule, minLevel: 1 | 2 | 3 = 1, scope?: PermissionScope): Promise<UserContext> {
	const ctx = await requireAuth()
	try {
		requirePermission(ctx, module, minLevel, scope)
	} catch (error) {
		handleDomainError(error)
	}
	return ctx
}
