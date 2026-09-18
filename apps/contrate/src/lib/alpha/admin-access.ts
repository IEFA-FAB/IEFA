/**
 * Regras PURAS da tela de acessos do α — o que se concede, em que OM, e como a alteração
 * chega ao banco. As server functions (`server/access.fn.ts`) só leem, autorizam e chamam;
 * a decisão fica aqui para ser testável sem servidor.
 */

import type { UnitOption } from "@iefa/alpha-client/access"
import { assertGrantable, type ChangeModulePermissionInput, type UnitCoverage } from "@iefa/pbac"
import { z } from "zod"

/** Os papéis do α e o grant de cada um: módulo PBAC e o ÚNICO nível que ele usa. */
export const ALPHA_ROLE_GRANTS = {
	requester: { module: "alpha-requester", level: 1 },
	procurement: { module: "alpha-procurement", level: 1 },
	aci: { module: "alpha-aci", level: 1 },
	admin: { module: "alpha-admin", level: 3 },
} as const

export type AlphaGrantRole = keyof typeof ALPHA_ROLE_GRANTS
export const ALPHA_GRANT_ROLES = Object.keys(ALPHA_ROLE_GRANTS) as AlphaGrantRole[]

/**
 * Os módulos que esta tela administra. O módulo pedido é validado contra esta lista — sem
 * isso, um administrador do α concederia `global` do sisub pela mesma chamada. O `alpha`
 * antigo (nível único) não é mais concedido nem listado: nada o lê, e as linhas dele ficam
 * só para o rollback até o PR de limpeza.
 */
export const ALPHA_ADMIN_MODULES = ["alpha-requester", "alpha-procurement", "alpha-aci", "alpha-admin"] as const
export type AlphaAdminModule = (typeof ALPHA_ADMIN_MODULES)[number]

export function roleOfModule(module: AlphaAdminModule): AlphaGrantRole {
	const role = ALPHA_GRANT_ROLES.find((candidate) => ALPHA_ROLE_GRANTS[candidate].module === module)
	if (!role) throw new Error(`módulo fora do α: ${module}`)
	return role
}

/**
 * Entradas das server functions de concessão e revogação. NÃO há campo de ator: quem age é
 * a sessão, resolvida pelo guard (`requireAlphaAdmin`). Um `actorId` que o cliente mandasse
 * seria descartado pelo `z.object` (chave desconhecida sai) — e o teste de contrato fixa
 * que nenhum campo desses entre aqui por descuido.
 *
 * `unitId: null` é o grant GLOBAL; o nível não vem do cliente, sai do papel.
 */
export const GrantAlphaRoleSchema = z.object({
	userId: z.uuid(),
	role: z.enum(ALPHA_GRANT_ROLES as [AlphaGrantRole, ...AlphaGrantRole[]]),
	unitId: z.number().int().nonnegative().nullable(),
})
export type GrantAlphaRoleInput = z.infer<typeof GrantAlphaRoleSchema>

export const RevokeAlphaRoleSchema = z.object({
	userId: z.uuid(),
	module: z.enum(ALPHA_ADMIN_MODULES),
	unitId: z.number().int().nonnegative().nullable(),
})
export type RevokeAlphaRoleInput = z.infer<typeof RevokeAlphaRoleSchema>

/** Prefixo das operações no log de auditoria: `contrate.permission.grant|revoke`. */
export const AUDIT_APP = "contrate"

/**
 * A alteração a gravar, depois da política de administração escopada (`assertGrantable`):
 * OM dentro da cobertura, global só pelo administrador global; sobre si mesmo, só o
 * global — e ninguém revoga o próprio `alpha-admin` (trancaria o ator para fora da tela).
 * A alteração sobre si mesmo é auditada como qualquer outra: ator e alvo iguais no log.
 *
 * O ator é `actorId` — o `userId` do guard, passado pela server function. O `data` nunca o
 * fornece, nem se trouxer um campo com esse nome.
 */
export function buildAlphaPermissionChange(
	admin: { actorId: string; coverage: UnitCoverage },
	data: GrantAlphaRoleInput | RevokeAlphaRoleInput
): ChangeModulePermissionInput {
	assertGrantable(admin, {
		userId: data.userId,
		unitId: data.unitId,
		revokesAdministration: "module" in data && data.module === ALPHA_ROLE_GRANTS.admin.module,
	})

	if ("role" in data) {
		const grant = ALPHA_ROLE_GRANTS[data.role]
		return {
			actorId: admin.actorId,
			app: AUDIT_APP,
			action: "grant",
			targetUserId: data.userId,
			module: grant.module,
			level: grant.level,
			unitId: data.unitId,
			// Conceder é acesso vivo, sem prazo — reaplicar reativa uma linha vencida.
			expiresAt: null,
		}
	}
	return { actorId: admin.actorId, app: AUDIT_APP, action: "revoke", targetUserId: data.userId, module: data.module, unitId: data.unitId }
}

/**
 * As OMs que o seletor de concessão oferece: as da cobertura do administrador, e "Global"
 * só para o administrador global. O servidor reconfere tudo (`assertGrantable`); isto é
 * para a tela não oferecer o que vai ser recusado.
 */
export function adminUnitChoices(coverage: UnitCoverage, units: readonly UnitOption[]): { allowGlobal: boolean; units: UnitOption[] } {
	if (coverage === "all") return { allowGlobal: true, units: [...units] }
	const covered = new Set(coverage)
	return { allowGlobal: false, units: units.filter((unit) => covered.has(unit.id)) }
}

/**
 * O administrador pode mexer neste acesso SEU? Só o global, e nunca revogando o próprio
 * `alpha-admin`. Para a tela desabilitar o botão; o servidor decide de novo.
 */
export function canChangeOwnAccess(isGlobalAdmin: boolean, change: { action: "grant" | "revoke"; module?: AlphaAdminModule }): boolean {
	if (!isGlobalAdmin) return false
	return !(change.action === "revoke" && change.module === ALPHA_ROLE_GRANTS.admin.module)
}

/**
 * A lista pedida está dentro da administração? Uma OM da cobertura, ou `null` ("todas as
 * OMs", inclusive os grants globais) só para o administrador global.
 */
export function canListGrants(coverage: UnitCoverage, unitId: number | null): boolean {
	if (coverage === "all") return true
	return unitId !== null && coverage.includes(unitId)
}
