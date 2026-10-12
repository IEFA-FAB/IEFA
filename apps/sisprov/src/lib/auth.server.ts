/**
 * @module auth.server
 * Gates de autorização das server functions do SISPROV, sobre os três módulos do app na
 * tabela compartilhada `access_control.user_permissions`.
 *
 * O acesso é POR PAPEL, escopado por OM (`unit_id`; nulo = global):
 *   sisprov-planning  1 consulta / 2 informa e ajusta a previsão da OM   (requirePlanning)
 *   sisprov-supply    1 consulta / 2 recebe OF, distribui                 (requireSupply)
 *   sisprov-admin     2 gestão sistêmica (SDAB) / 3 gerencia grants       (requireSisprovAdmin)
 *
 * O cache request-scoped do `getUser()`, a resolução PBAC e a tradução para 401/403 vêm de
 * `@iefa/pbac/start`, compartilhados com os demais apps do ERP. Aqui só amarramos os clients do
 * sisprov e damos nome de domínio aos gates.
 *
 * Gate de OM: `requireLevel` com `scope` aceita o grant global ou o escopado NA OM. A cobertura
 * pela hierarquia de apoio (grant na apoiadora vale para as apoiadas) mora no domínio
 * (`@iefa/sisprov-domain`, `requireSupply(ctx, 2, { unitId, supportGraph })`): a server function
 * que opera numa OM delega à operation, que recebe o `ctx` daqui e o grafo de apoio.
 */

import type { AppModule, UserContext } from "@iefa/pbac"
import { createRequestAuth } from "@iefa/pbac/start"
import { SISPROV_ADMIN_MODULE, SISPROV_MODULES, SISPROV_PLANNING_MODULE, SISPROV_SUPPLY_MODULE } from "@iefa/sisprov-domain/modules"
import { getAccessControlClient, getSisprovAuthClient } from "@/lib/supabase.server"

const auth = createRequestAuth({
	getAuthClient: getSisprovAuthClient,
	getPermissionsClient: getAccessControlClient,
})

export const { getRequestUser, requireUser, requireUserId, requireAuth } = auth

function unitScope(unitId?: number) {
	return unitId === undefined ? undefined : ({ type: "unit", id: unitId } as const)
}

/** Elo SISPROV na OM. Sem `unitId`, basta o módulo em algum escopo (gate de "pode entrar"). */
export function requirePlanning(minLevel: 1 | 2 = 1, unitId?: number): Promise<UserContext> {
	return auth.requireLevel(SISPROV_PLANNING_MODULE, minLevel, unitScope(unitId))
}

/** Almoxarifado da OM. */
export function requireSupply(minLevel: 1 | 2 = 1, unitId?: number): Promise<UserContext> {
	return auth.requireLevel(SISPROV_SUPPLY_MODULE, minLevel, unitScope(unitId))
}

/**
 * SDAB: 2 = gestão sistêmica, 3 = gerenciar grants dos três módulos.
 *
 * Sem escopo, `requireLevel` aceita também o grant ESCOPADO por OM. Para a administração de
 * grants isso é correto: a cobertura (`resolveModuleUnitCoverage`) decide em que OMs o ator
 * concede. Para dado que agrega a rede inteira (curva global, grupos da SDAB), a server function
 * delega à operation, que exige o grant global por `requireSisprovAdmin(ctx, 2)` do domínio
 * (`requireUnscopedPermission`). Não usar este gate sozinho para listagens sistêmicas.
 */
export function requireSisprovAdmin(minLevel: 2 | 3 = 2): Promise<UserContext> {
	return auth.requireLevel(SISPROV_ADMIN_MODULE, minLevel)
}

/**
 * Gate do que é do APP e não de um papel: perfil, hub, leitura de referência. Qualquer módulo
 * do SISPROV no nível 1 basta. É a contrapartida de `canUseApp` no cliente.
 */
export function requireSisprovApp(): Promise<UserContext> {
	return auth.requireAnyLevel(SISPROV_MODULES as readonly AppModule[], 1)
}
