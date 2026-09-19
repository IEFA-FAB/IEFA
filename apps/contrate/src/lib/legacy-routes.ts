/**
 * Para onde vão as URLs de processo de antes do escopo por OM (`/aci/processos/$id`,
 * `/aci/relatorio/$runId`) — links em e-mail, em despacho, no histórico do navegador.
 *
 * A OM do processo decide: a Plataforma ACI na OM dele, se a pessoa a cobre como
 * licitações/ACI; senão o módulo Requisitante (quem enviou, ou o requisitante da OM). É PURO:
 * a OM vem do α (`unit_id` do processo) e o perfil também.
 */

import type { MeAccess } from "@iefa/alpha-client/access"
import { getModule, moduleScopeOptions, scopedPath } from "./modules"
import { pickScopeForUnit } from "./scope"

export type ProcessPage = "processos" | "relatorio"

/**
 * O caminho novo de um processo (ou relatório) da OM `unitId`. Sem escopo que sirva, o hub do
 * Requisitante — que nunca é vazio (quem não tem papel lá tem `minhas`).
 */
export function resolveLegacyProcessPath(access: MeAccess, unitId: number, page: ProcessPage, id: string): string {
	for (const moduleId of ["aci", "requisitante"] as const) {
		const module = getModule(moduleId)
		const scope = pickScopeForUnit(moduleScopeOptions(module, access), unitId)
		if (scope && module.scope) return `${scopedPath(module.scope.index, scope.id)}/${page}/${encodeURIComponent(id)}`
	}
	return getModule("requisitante").home
}
