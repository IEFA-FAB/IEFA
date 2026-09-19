/**
 * Regras PURAS da tela de acessos do α — o que se concede, em que OM, e como a alteração
 * chega ao banco. As server functions (`server/access.fn.ts`) só leem, autorizam e chamam;
 * a decisão fica aqui para ser testável sem servidor.
 */

import type { UnitOption } from "@iefa/alpha-client/access"
import { assertGrantable, type ChangeModulePermissionInput, touchesDenyPartition, type UnitCoverage } from "@iefa/pbac"
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

/**
 * Os dois lados de uma chave: o acesso (`allow`, `level > 0`) e o bloqueio (`deny`,
 * `level <= 0`). Coexistem na mesma chave, e o bloqueio vence.
 */
export const GRANT_EFFECTS = ["allow", "deny"] as const
export type GrantEffect = (typeof GRANT_EFFECTS)[number]

/**
 * `effect` é OBRIGATÓRIO na revogação: revogar o acesso nunca leva junto o bloqueio da
 * mesma chave, e retirar o bloqueio nunca leva o acesso. Não há "a chave inteira" por aqui.
 */
export const RevokeAlphaRoleSchema = z.object({
	userId: z.uuid(),
	module: z.enum(ALPHA_ADMIN_MODULES),
	unitId: z.number().int().nonnegative().nullable(),
	effect: z.enum(GRANT_EFFECTS),
})
export type RevokeAlphaRoleInput = z.infer<typeof RevokeAlphaRoleSchema>

/** Prefixo das operações no log de auditoria: `contrate.permission.grant|revoke`. */
export const AUDIT_APP = "contrate"

/**
 * A alteração a gravar, depois da política de administração escopada (`assertGrantable`):
 * OM dentro da cobertura, global só pelo administrador global; sobre si mesmo, só o
 * global — e ninguém revoga o próprio `alpha-admin` (trancaria o ator para fora da tela).
 * Retirar um bloqueio (deny) é só do global; esta tela não cria bloqueio (o grant é sempre
 * o nível positivo do papel). A alteração sobre si mesmo é auditada como qualquer outra:
 * ator e alvo iguais no log.
 *
 * O ator é `actorId` — o `userId` do guard, passado pela server function. O `data` nunca o
 * fornece, nem se trouxer um campo com esse nome.
 */
export function buildAlphaPermissionChange(
	admin: { actorId: string; coverage: UnitCoverage },
	data: GrantAlphaRoleInput | RevokeAlphaRoleInput
): ChangeModulePermissionInput {
	const change: ChangeModulePermissionInput =
		"role" in data
			? {
					actorId: admin.actorId,
					app: AUDIT_APP,
					action: "grant",
					targetUserId: data.userId,
					module: ALPHA_ROLE_GRANTS[data.role].module,
					level: ALPHA_ROLE_GRANTS[data.role].level,
					unitId: data.unitId,
					// Conceder é acesso vivo, sem prazo — reaplicar reativa uma linha vencida.
					expiresAt: null,
				}
			: {
					actorId: admin.actorId,
					app: AUDIT_APP,
					action: "revoke",
					targetUserId: data.userId,
					module: data.module,
					unitId: data.unitId,
					// Só o lado pedido sai: o outro lado da chave fica.
					partition: data.effect,
				}

	assertGrantable(admin, {
		userId: data.userId,
		unitId: data.unitId,
		// Trancar-se para fora é revogar o próprio ACESSO de administração; retirar o próprio
		// bloqueio não tranca ninguém.
		revokesAdministration: change.action === "revoke" && change.module === ALPHA_ROLE_GRANTS.admin.module && change.partition !== "deny",
		touchesDeny: touchesDenyPartition(change),
	})
	return change
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

/** O que a lista de acessos precisa de uma linha para decidir chave, lado e bloqueio. */
export interface GrantRowLike {
	source: "inline" | "policy"
	effect: GrantEffect
	userId: string
	module: AlphaAdminModule
	unitId: number | null
	policyName?: string
	expiresAt: string | null
}

/**
 * Chave de React de uma linha. OM e nome da política entram porque a mesma pessoa pode ter
 * o mesmo papel em duas OMs, e duas políticas podem emprestar o MESMO papel; o lado
 * (`effect`) entra porque acesso e bloqueio coexistem na MESMA chave do banco — sem ele as
 * duas linhas nasceriam com a mesma chave e uma sumiria da lista.
 */
export function grantRowKey(grant: GrantRowLike): string {
	return `${grant.source}:${grant.effect}:${grant.userId}:${grant.module}:${grant.unitId ?? "global"}:${grant.policyName ?? ""}`
}

/** Vencido é ausência — de acesso ou de bloqueio (`NOT_EXPIRED`). */
export function isExpiredGrant(grant: Pick<GrantRowLike, "expiresAt">, now: number = Date.now()): boolean {
	return grant.expiresAt !== null && new Date(grant.expiresAt).getTime() <= now
}

/** Separa acessos de bloqueios: a tela nunca mostra um bloqueio como papel concedido. */
export function splitGrantsByEffect<T extends GrantRowLike>(grants: readonly T[]): { allows: T[]; denies: T[] } {
	return { allows: grants.filter((grant) => grant.effect === "allow"), denies: grants.filter((grant) => grant.effect === "deny") }
}

/**
 * Um bloqueio VIVO desta lista anula o acesso? O da mesma chave (pessoa, papel, OM) e o
 * global do papel (deny sem OM derruba o papel inteiro). Só o que está na lista: um
 * bloqueio fora dela (global, na lista de uma OM só) não aparece aqui.
 */
export function isAllowBlockedByDeny(allow: GrantRowLike, denies: readonly GrantRowLike[], now: number = Date.now()): boolean {
	return denies.some(
		(deny) =>
			deny.effect === "deny" &&
			deny.userId === allow.userId &&
			deny.module === allow.module &&
			(deny.unitId === null || deny.unitId === allow.unitId) &&
			!isExpiredGrant(deny, now)
	)
}
