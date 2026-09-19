/**
 * @module auth.server
 * Guards das server functions do contrate.
 *
 * `/_serverFn/<id>` é endpoint HTTP cru: o `beforeLoad` protege a navegação, não o
 * endpoint. Toda fn que usa client service-role passa por um guard daqui.
 *
 * Autorização é PBAC (`@iefa/pbac`), a mesma dos demais apps. Os papéis do α
 * (`alpha-requester`, `alpha-procurement`, `alpha-aci`, `alpha-admin`, cada um por OM) são
 * resolvidos pela API do α para o fluxo (fila, triagem, parecer); aqui só o que é do
 * próprio app — Pregoeiro e a tela de acessos (`alpha-admin` 3, escopado por OM).
 */

import { fetchUnitSupportGraph, isEmptyCoverage, needsSupportGraph, resolveModuleUnitCoverage, type UnitCoverage, type UserContext } from "@iefa/pbac"
import { createRequestAuth, forbidden as denyWithStatus, unauthorized as unauthenticatedWithStatus } from "@iefa/pbac/start"
import { getAccessControlClient, getCoreReadClient, getIefaAuthClient } from "./supabase.server"

export function unauthorized(): never {
	return unauthenticatedWithStatus("Não autenticado.")
}

export function forbidden(message = "Você não tem acesso a este recurso."): never {
	return denyWithStatus(message)
}

const auth = createRequestAuth({
	getAuthClient: getIefaAuthClient,
	getPermissionsClient: getAccessControlClient,
	messages: { unauthorized: "Não autenticado." },
})

export const { getRequestUser, requireUserId } = auth

/**
 * Exige que o alvo da operação seja o próprio usuário da sessão.
 *
 * O `userId` no payload é só comparado, nunca decide o alvo. Divergiu da sessão, é
 * IDOR: 403.
 */
export async function requireSelf(claimedUserId: string): Promise<string> {
	const userId = await requireUserId()
	if (claimedUserId !== userId) forbidden("Você só pode acessar os próprios dados.")
	return userId
}

export interface AlphaAdminContext {
	ctx: UserContext
	/**
	 * As OMs que este administrador administra: a do grant e as que ela apoia (hierarquia
	 * de apoio, a MESMA expansão que o α aplica), ou `"all"` para o administrador global.
	 */
	coverage: UnitCoverage
}

/**
 * Gate da gestão de acessos do α: `alpha-admin` nível 3 em ALGUMA OM, com a cobertura
 * resolvida no servidor. É ela — e nunca o que o cliente mandar — que `assertGrantable`
 * confere antes de cada concessão.
 *
 * O grafo de apoio só é lido quando há grant escopado (allow ou deny): o administrador
 * global não paga a leitura. Falha na leitura propaga — cobertura calculada sem o grafo
 * seria cobertura errada.
 */
export async function requireAlphaAdmin(): Promise<AlphaAdminContext> {
	const ctx = await auth.requireLevel("alpha-admin", 3)
	const graph = needsSupportGraph(ctx.permissions, ["alpha-admin"]) ? await fetchUnitSupportGraph(getCoreReadClient()) : null
	const coverage = resolveModuleUnitCoverage(ctx.permissions, "alpha-admin", graph, 3)
	// Allow numa OM recortado por deny na mesma OM: tem o grant, não administra nada.
	if (isEmptyCoverage(coverage)) forbidden("Você não administra acessos em nenhuma OM.")
	return { ctx, coverage }
}
