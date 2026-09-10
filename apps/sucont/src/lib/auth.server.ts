/**
 * @module auth.server
 * Gates de autorização das server functions do sucont.
 *
 * O acesso é POR DIVISÃO: os módulos do PBAC são `sucont-1`, `sucont-3` e
 * `sucont-4` (as divisões da SUCONT que o hub reúne) e `sucont-admin` (governança
 * dos acessos). Antes havia um módulo `sucont` único e as divisões se distinguiam
 * só pelo nível — quem entrava para trabalhar na SUCONT-3 abria as ferramentas da
 * SUCONT-4 pelo mesmo grant.
 *
 * Níveis, iguais nas três divisões:
 *   - 1 = abrir as ferramentas DAQUELA divisão (requireDivisionAccess)
 *   - 2 = editar os dados da seção pela divisão (requireDivisionEditor)
 * E, no `sucont-admin`:
 *   - 3 = gerenciar grants do sucont (requireSucontAdmin)
 *
 * O cache request-scoped do `getUser()`, a resolução PBAC e a tradução para 401/403
 * vêm de `@iefa/pbac/start`, compartilhados com os demais apps do ERP. Aqui só
 * amarramos os clients do sucont e damos nome de domínio aos gates.
 */

import type { AppModule, UserContext } from "@iefa/pbac"
import { createRequestAuth } from "@iefa/pbac/start"
import { permissionModuleForDivision, SUCONT_DIVISION_MODULES } from "#/lib/permission-modules"
import { getAccessControlClient, getSucontAuthClient } from "#/lib/supabase.server"
import type { SucontDivision } from "#/lib/types"

const auth = createRequestAuth({
	getAuthClient: getSucontAuthClient,
	getPermissionsClient: getAccessControlClient,
})

export const { getRequestUser, requireUser, requireUserId, requireAuth } = auth

/** Gate de leitura de uma divisão: exige o módulo dela no nível 1. */
export function requireDivisionAccess(division: SucontDivision): Promise<UserContext> {
	return auth.requireLevel(permissionModuleForDivision(division), 1)
}

/** Gate de escrita de uma divisão: exige o módulo dela no nível 2. */
export function requireDivisionEditor(division: SucontDivision): Promise<UserContext> {
	return auth.requireLevel(permissionModuleForDivision(division), 2)
}

/**
 * Gate de uma ferramenta que serve a MAIS DE UMA divisão — o Monitoramento
 * Patrimonial é da SUCONT-3 e da SUCONT-4. Exigir as duas trancaria fora os dois
 * lados; exigir uma escolhida a dedo trancaria o outro.
 */
export function requireEitherDivisionAccess(divisions: readonly SucontDivision[], minLevel: 1 | 2 = 1): Promise<UserContext> {
	return auth.requireAnyLevel(divisions.map(permissionModuleForDivision), minLevel)
}

/**
 * Gate das telas da SEÇÃO — catálogo, área de trabalho, relatórios, avisos.
 *
 * Basta uma divisão qualquer: o checklist mensal e os relatórios não têm coluna de
 * divisão, são da seção inteira. Prendê-los a uma divisão específica esconderia o
 * quadro comum de quem trabalha nas outras.
 */
export function requireSucontAccess(minLevel: 1 | 2 = 1): Promise<UserContext> {
	return auth.requireAnyLevel(SUCONT_DIVISION_MODULES as readonly AppModule[], minLevel)
}

/** Gate de escrita das telas da seção: nível 2 em qualquer divisão. */
export function requireSucontEditor(): Promise<UserContext> {
	return requireSucontAccess(2)
}

/** Gate de administração de grants do SUCONT: exige `sucont-admin` nível 3. */
export function requireSucontAdmin(): Promise<UserContext> {
	return auth.requireLevel("sucont-admin", 3)
}
