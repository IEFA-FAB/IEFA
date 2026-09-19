/**
 * Regras PURAS da concessão e revogação do acesso `rumaer` — o que a server function manda
 * para `changeModulePermission` (@iefa/pbac), que grava o grant e a linha de auditoria numa
 * transação só. Separadas das server functions para serem testáveis sem servidor.
 *
 * ## Quem pode mexer em quê
 *
 * O grant `rumaer` é sempre global (sem OM), e a administração também: todo administrador do
 * rumaer é administrador GLOBAL do app. Pela regra do mantenedor (`assertGrantable`):
 *   - administrador global PODE conceder a si mesmo — o log registra ator e alvo iguais;
 *   - NINGUÉM retira a própria administração: revogar o próprio nível 3, ou rebaixá-lo a 2
 *     (conceder de novo substitui o nível), trancaria o ator fora da tela — e, sendo o último,
 *     todo mundo, com conserto só por SQL.
 *
 * O ator sai SEMPRE da sessão (`ctx.userId` do guard); as entradas nem têm campo de ator.
 */

import { assertGrantable, type ChangeModulePermissionInput, partitionOfLevel } from "@iefa/pbac"

export const RUMAER_MODULE = "rumaer" as const
/** Nível que administra os grants do rumaer (`requireRumaerAdmin`). */
export const RUMAER_ADMIN_LEVEL = 3
/** Prefixo das operações no log de auditoria: `rumaer.permission.grant|revoke`. */
export const RUMAER_AUDIT_APP = "rumaer"

/** A linha de `user_permissions` que a revogação apaga, lida pelo `permissionId`. */
export type RumaerPermissionRow = {
	id: string
	user_id: string
	module: string
	level: number
	unit_id: number | null
	kitchen_id: number | null
	mess_hall_id: number | null
}

/** Concessão (idempotente: reconceder substitui o nível e zera o prazo). */
export function buildRumaerGrant(actorId: string, data: { userId: string; level: 2 | 3 }): ChangeModulePermissionInput {
	assertGrantable({ actorId, coverage: "all" }, { userId: data.userId, unitId: null, revokesAdministration: data.level < RUMAER_ADMIN_LEVEL })
	return {
		actorId,
		app: RUMAER_AUDIT_APP,
		action: "grant",
		targetUserId: data.userId,
		module: RUMAER_MODULE,
		level: data.level,
		unitId: null,
		expiresAt: null,
	}
}

/**
 * Revogação da LINHA que a tela mostrou. O alvo sai da linha, e não do cliente: a entrada
 * é só o `permissionId`, e antes a revogação nem sabia de quem era o acesso — não havia como
 * recusar a auto-revogação nem registrar o alvo.
 */
export function buildRumaerRevoke(actorId: string, row: RumaerPermissionRow): ChangeModulePermissionInput {
	if (row.module !== RUMAER_MODULE) throw new Error("A linha não é um acesso do RUMAER.")
	const partition = partitionOfLevel(row.level)
	assertGrantable(
		{ actorId, coverage: "all" },
		{ userId: row.user_id, unitId: row.unit_id, revokesAdministration: partition === "allow" && row.level >= RUMAER_ADMIN_LEVEL }
	)
	return {
		actorId,
		app: RUMAER_AUDIT_APP,
		action: "revoke",
		targetUserId: row.user_id,
		module: RUMAER_MODULE,
		unitId: row.unit_id,
		kitchenId: row.kitchen_id,
		messHallId: row.mess_hall_id,
		// Só o lado da linha mostrada: revogar o acesso não leva junto um bloqueio da mesma chave.
		partition,
	}
}
