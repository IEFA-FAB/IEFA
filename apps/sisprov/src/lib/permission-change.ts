/**
 * Regras PURAS da concessão e revogação de acesso do SISPROV: o que as server functions mandam
 * para `changeModulePermission` (@iefa/pbac), que grava o grant e a linha de auditoria numa
 * transação só. Separadas para serem testáveis sem servidor e importáveis pela tela.
 *
 * ## Quem pode mexer em quê
 *
 * Quem administra é `sisprov-admin` nível 3. Pela regra do mantenedor (`assertGrantable`):
 *   - o administrador GLOBAL concede em qualquer OM, inclusive a si mesmo (o log registra ator
 *     e alvo iguais);
 *   - o administrador ESCOPADO por OM concede só nessa OM e nas que ela apoia (`coverage`), nunca
 *     global;
 *   - NINGUÉM revoga a própria administração (nível 3 de `sisprov-admin`): trancaria o ator fora
 *     da tela e, sendo o último, todo mundo, com conserto só por SQL.
 *
 * O ator sai SEMPRE da sessão (`ctx.userId` do guard); as entradas nem têm campo de ator.
 */

import { assertGrantable, type ChangeModulePermissionInput, partitionOfLevel, type UnitCoverage } from "@iefa/pbac"
import { isSisprovModule, SISPROV_ADMIN_MODULE, SISPROV_AUDIT_APP, SISPROV_GRANT_ADMIN_LEVEL, type SisprovGrantTarget } from "@iefa/sisprov-domain/modules"

/** Concessão pedida pela tela: o par (módulo, nível) já validado pelo schema, e a OM (nula = global). */
export type SisprovGrantChange = SisprovGrantTarget & { userId: string; unitId: number | null }

/** A linha de `user_permissions` que a tela mostrou, lida pelo `permissionId` no servidor. */
export type SisprovPermissionRow = {
	id: string
	user_id: string
	module: string
	level: number
	unit_id: number | null
	kitchen_id: number | null
	mess_hall_id: number | null
}

/**
 * A revogação desta linha tranca o ator fora da tela? Só revogar o PRÓPRIO allow de
 * `sisprov-admin` no nível de administração. Retirar um bloqueio próprio não tranca ninguém.
 */
export function isSelfAdminRevoke(actorId: string, row: Pick<SisprovPermissionRow, "user_id" | "module" | "level">): boolean {
	return actorId === row.user_id && row.module === SISPROV_ADMIN_MODULE && row.level >= SISPROV_GRANT_ADMIN_LEVEL
}

/** Concessão (idempotente: reconceder substitui o nível e zera o prazo). */
export function buildSisprovGrant(actor: { actorId: string; coverage: UnitCoverage }, data: SisprovGrantChange): ChangeModulePermissionInput {
	// Rebaixar a própria administração (3 → 2) também tranca o ator fora da tela de grants.
	const revokesAdministration = actor.actorId === data.userId && data.module === SISPROV_ADMIN_MODULE && data.level < SISPROV_GRANT_ADMIN_LEVEL
	assertGrantable(actor, { userId: data.userId, unitId: data.unitId, revokesAdministration })
	return {
		actorId: actor.actorId,
		app: SISPROV_AUDIT_APP,
		action: "grant",
		targetUserId: data.userId,
		module: data.module,
		level: data.level,
		unitId: data.unitId,
		expiresAt: null,
	}
}

/**
 * O grant existe e é do SISPROV, mas é gerido por outra tela: o `storage` escopado por cozinha (ou
 * refeitório) é concedido e revogado no sisub, que é a lente da cozinha (design D3).
 */
export class GrantManagedElsewhereError extends Error {
	readonly code = "GRANT_MANAGED_ELSEWHERE" as const

	constructor() {
		super("Este acesso é da cozinha e é gerido na tela de permissões do SISUB.")
		this.name = "GrantManagedElsewhereError"
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

/**
 * Revogação da LINHA que a tela mostrou: a chave inteira (usuário, módulo, escopo) e o lado dela
 * (allow ou deny). O alvo sai da linha lida no servidor, não do cliente.
 */
export function buildSisprovRevoke(actor: { actorId: string; coverage: UnitCoverage }, row: SisprovPermissionRow): ChangeModulePermissionInput {
	if (!isSisprovModule(row.module)) throw new Error("A linha não é um acesso do SISPROV.")
	if (row.kitchen_id !== null || row.mess_hall_id !== null) throw new GrantManagedElsewhereError()
	const partition = partitionOfLevel(row.level)
	assertGrantable(actor, {
		userId: row.user_id,
		unitId: row.unit_id,
		revokesAdministration: partition === "allow" && isSelfAdminRevoke(actor.actorId, row),
	})
	return {
		actorId: actor.actorId,
		app: SISPROV_AUDIT_APP,
		action: "revoke",
		targetUserId: row.user_id,
		module: row.module,
		unitId: row.unit_id,
		kitchenId: row.kitchen_id,
		messHallId: row.mess_hall_id,
		// Só o lado da linha mostrada: revogar o acesso não leva junto um bloqueio da mesma chave.
		partition,
	}
}
