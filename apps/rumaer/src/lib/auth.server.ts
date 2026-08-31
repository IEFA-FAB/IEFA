/**
 * @module auth.server
 * Gates de autorização das server functions do rumaer, sobre o módulo `rumaer`
 * da tabela compartilhada `access_control.user_permissions`.
 *
 * Níveis do módulo `rumaer` (grant global/unscoped):
 *   - 2 = editar uniformes (requireUniformEditor)
 *   - 3 = gerenciar grants do rumaer (requireRumaerAdmin)
 *
 * O cache request-scoped do `getUser()`, a resolução PBAC e a tradução para
 * 401/403 vêm de `@iefa/pbac/start`, compartilhados com sisub, portal e sucont.
 */

import type { UserContext } from "@iefa/pbac"
import { createRequestAuth } from "@iefa/pbac/start"
import { getAccessControlClient, getRumaerAuthClient } from "@/lib/supabase.server"

const auth = createRequestAuth({
	getAuthClient: getRumaerAuthClient,
	getPermissionsClient: getAccessControlClient,
})

export const { getRequestUser, requireUser, requireUserId, requireAuth } = auth

/** Gate de escrita do RUMAER: exige grant `rumaer` nível 2. 403 se autenticado sem acesso. */
export function requireUniformEditor(): Promise<UserContext> {
	return auth.requireLevel("rumaer", 2)
}

/** Gate de administração de grants do RUMAER: exige grant `rumaer` nível 3. */
export function requireRumaerAdmin(): Promise<UserContext> {
	return auth.requireLevel("rumaer", 3)
}
