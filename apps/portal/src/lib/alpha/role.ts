/**
 * Perfil do usuário no Projeto α.
 *
 * O α lê `app_metadata.role` do JWT (`middleware/auth.ts`); o portal lê o mesmo
 * campo do usuário da sessão para decidir o que mostrar. A regra de acesso
 * mora no α — aqui é só o que a tela precisa para não oferecer botão que vai
 * devolver 403.
 */

export type AlphaRole = "app_requisitante" | "app_licitacoes" | "app_aci"

const ROLES: readonly AlphaRole[] = ["app_requisitante", "app_licitacoes", "app_aci"]

/** Perfis que enxergam o fluxo inteiro — espelha `PERFIS_AMPLOS` do α. */
const BROAD_ROLES: readonly AlphaRole[] = ["app_aci", "app_licitacoes"]

type UserLike = { app_metadata?: Record<string, unknown> | null } | null | undefined

/** `null` para usuário sem perfil ou com valor fora do conjunto — nunca um perfil suposto. */
export function alphaRole(user: UserLike): AlphaRole | null {
	const value = user?.app_metadata?.role
	return typeof value === "string" && (ROLES as readonly string[]).includes(value) ? (value as AlphaRole) : null
}

/** Pode abrir a fila da plataforma (todos os processos). */
export function hasAciAccess(role: AlphaRole | null): boolean {
	return role !== null && BROAD_ROLES.includes(role)
}

/** Pode triar achado e emitir parecer — só o ACI, por desenho do projeto. */
export function canDecide(role: AlphaRole | null): boolean {
	return role === "app_aci"
}

export const ROLE_LABEL: Record<AlphaRole, string> = {
	app_requisitante: "Requisitante",
	app_licitacoes: "Licitações",
	app_aci: "ACI",
}
