import { hasPermission, type UserPermission } from "@iefa/pbac"

/**
 * Perfil do usuário no Projeto α, derivado do PBAC (`@iefa/pbac`) — a mesma engine e a
 * mesma tabela `access_control.user_permissions` do sisub, rumaer e sucont.
 *
 * Os perfis do negócio são aninhados (o ACI faz tudo o que Licitações faz, e mais), por
 * isso cabem em níveis do módulo `alpha`:
 *   0 — sem grant: chat e o próprio documento, como qualquer usuário autenticado
 *   1 — requisitante (explícito; hoje equivale ao 0, existe para a allow-list futura)
 *   2 — licitações: enxerga o fluxo inteiro (fila, processos de todos)
 *   3 — ACI: triagem, parecer e curadoria de regras e fontes
 *
 * A gestão dos grants é outro módulo (`alpha-admin`), como no sucont: decidir parecer e
 * conceder acesso são atribuições diferentes.
 *
 * Antes daqui, o perfil era `auth.users.app_metadata.role`: um texto único, concedido
 * por SQL, sem prazo, sem negação e sem tela.
 */
export type AlphaLevel = 0 | 1 | 2 | 3

export const ALPHA_LEVEL = {
	REQUESTER: 1,
	PROCUREMENT: 2,
	ACI: 3,
} as const satisfies Record<string, AlphaLevel>

export type AlphaAccess = {
	level: AlphaLevel
	/** Pode conceder e revogar grants dos módulos `alpha` e `alpha-admin`. */
	canManageAccess: boolean
}

export function resolveAlphaAccess(permissions: UserPermission[]): AlphaAccess {
	const level = ([3, 2, 1] as const).find((n) => hasPermission(permissions, "alpha", n)) ?? 0
	return { level, canManageAccess: hasPermission(permissions, "alpha-admin", 3) }
}

/**
 * Deny explícito (`level 0`, sem escopo) no módulo `alpha` fecha a API inteira — inclusive
 * o que qualquer autenticado faz. Sem grant nenhum é outra coisa: o usuário recém-cadastrado
 * segue usando o chat e enviando o próprio documento.
 */
export function isAlphaDenied(permissions: UserPermission[]): boolean {
	return permissions.some((p) => p.module === "alpha" && p.level === 0 && p.unit_id === null && p.mess_hall_id === null && p.kitchen_id === null)
}

/** Perfis que enxergam o fluxo inteiro, por definição de negócio: Licitações e ACI. */
export function hasBroadAccess(access: AlphaAccess): boolean {
	return access.level >= ALPHA_LEVEL.PROCUREMENT
}
