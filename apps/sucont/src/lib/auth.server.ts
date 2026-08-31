/**
 * @module auth.server
 * Gates de autorização das server functions do sucont.
 *
 * Níveis do módulo `sucont` (grant global/unscoped):
 *   - 1 = acessar o hub e ferramentas (requireSucontAccess)
 *   - 2 = editar dados da seção: área de trabalho, relatórios, mensagens (requireSucontEditor)
 *   - 3 = gerenciar grants do sucont (requireSucontAdmin)
 *
 * O cache request-scoped do `getUser()`, a resolução PBAC e a tradução para 401/403
 * vêm de `@iefa/pbac/start`, compartilhados com os demais apps do ERP. Aqui só
 * amarramos os clients do sucont e damos nome de domínio aos três níveis.
 */

import type { UserContext } from "@iefa/pbac"
import { createRequestAuth } from "@iefa/pbac/start"
import { getAccessControlClient, getSucontAuthClient } from "#/lib/supabase.server"

const auth = createRequestAuth({
	getAuthClient: getSucontAuthClient,
	getPermissionsClient: getAccessControlClient,
})

export const { getRequestUser, requireUser, requireUserId, requireAuth } = auth

/** Gate de acesso ao hub: exige grant `sucont` nível 1. 403 se autenticado sem acesso. */
export function requireSucontAccess(): Promise<UserContext> {
	return auth.requireLevel("sucont", 1)
}

/** Gate de escrita da seção: exige grant `sucont` nível 2. */
export function requireSucontEditor(): Promise<UserContext> {
	return auth.requireLevel("sucont", 2)
}

/** Gate de administração de grants do SUCONT: exige grant `sucont` nível 3. */
export function requireSucontAdmin(): Promise<UserContext> {
	return auth.requireLevel("sucont", 3)
}
