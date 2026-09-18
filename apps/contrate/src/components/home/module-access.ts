import type { UserPermission } from "@iefa/pbac"
import { type ContrateModule, canAccessModule } from "@/lib/modules"

/**
 * Como o cartão de um módulo se comporta para quem está vendo a home.
 * - `open`: o visitante alcança o módulo — o cartão é link para a entrada.
 * - `sign-in`: exige sessão e não há — o cartão leva ao login, voltando ao módulo.
 * - `denied`: há sessão, mas não o perfil — sem link, só a indicação de pedir acesso.
 * - `checking`: há sessão e os grants ainda não chegaram — nada é prometido.
 * - `unverified`: a consulta dos grants falhou — dizer "sem perfil" seria mentir.
 */
export type ModuleAccess = "open" | "sign-in" | "denied" | "checking" | "unverified"

/**
 * `permissions === undefined` é "ainda carregando", não "sem perfil": tratar os dois
 * igual faria o cartão piscar "Solicite acesso" para quem tem o grant.
 * É conveniência de tela — quem decide o acesso é o servidor.
 */
export function resolveModuleAccess(
	module: ContrateModule,
	isAuthenticated: boolean,
	permissions: readonly UserPermission[] | undefined,
	permissionsFailed = false
): ModuleAccess {
	if (module.requires === null) return "open"
	if (!isAuthenticated) return "sign-in"
	if (permissions === undefined) return permissionsFailed ? "unverified" : "checking"
	return canAccessModule(module, permissions) ? "open" : "denied"
}
