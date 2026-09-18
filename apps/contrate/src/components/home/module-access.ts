import type { MeAccess } from "@iefa/alpha-client/access"
import { type ContrateModule, canAccessModule, moduleScopeOptions } from "@/lib/modules"
import { describeScope } from "@/lib/scope"

/**
 * Como o cartão de um módulo se comporta para quem está vendo a home.
 * - `open`: o visitante alcança o módulo — o cartão é link para a entrada.
 * - `sign-in`: exige sessão e não há — o cartão leva ao login, voltando ao módulo.
 * - `denied`: há sessão, mas não o papel — sem link, só a indicação de pedir acesso.
 * - `checking`: há sessão e o perfil do α ainda não chegou — nada é prometido.
 * - `unverified`: a consulta do perfil falhou — dizer "sem papel" seria mentir.
 */
export type ModuleAccess = "open" | "sign-in" | "denied" | "checking" | "unverified"

/**
 * `access === undefined` é "ainda carregando", não "sem papel": tratar os dois igual faria
 * o cartão piscar "Solicite acesso" para quem tem o grant. Módulo que só exige sessão (o
 * Requisitante) não espera o perfil. É conveniência de tela — quem decide é o servidor.
 */
export function resolveModuleAccess(module: ContrateModule, isAuthenticated: boolean, access: MeAccess | undefined, accessFailed = false): ModuleAccess {
	if (module.gate.kind === "public") return "open"
	if (!isAuthenticated) return "sign-in"
	if (module.gate.kind === "authenticated") return "open"
	if (access === undefined) return accessFailed ? "unverified" : "checking"
	return canAccessModule(module, { isAuthenticated, access }) ? "open" : "denied"
}

/**
 * O escopo do módulo para o cartão: "GAP-SJ", "3 OMs", "Todas as OMs", "Minhas submissões".
 * `null` em módulo sem OM, sem perfil em mãos, ou quando o cartão não abre.
 */
export function describeModuleScope(module: ContrateModule, access: MeAccess | undefined, moduleAccess: ModuleAccess): string | null {
	if (!module.scope || !access || moduleAccess !== "open") return null
	return describeScope(moduleScopeOptions(module, access))
}
