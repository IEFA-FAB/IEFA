/**
 * Regras PURAS da concessão e revogação de acesso do SUCONT — o que as server functions
 * mandam para `changeModulePermission` (@iefa/pbac), que grava o grant e a linha de auditoria
 * numa transação só. Separadas para serem testáveis sem servidor (e importáveis pela tela,
 * que desabilita o botão com a MESMA regra que o servidor aplica).
 *
 * ## Quem pode mexer em quê
 *
 * Os grants do sucont são globais (sem OM), e a administração também: todo `sucont-admin` é
 * administrador GLOBAL do app. Pela regra do mantenedor (`assertGrantable`, @iefa/pbac), que
 * substitui o antigo "ninguém altera o próprio acesso":
 *   - administrador global PODE conceder a si mesmo (uma divisão, por exemplo) — o log registra
 *     ator e alvo iguais;
 *   - NINGUÉM revoga o próprio `sucont-admin`: trancaria o ator fora da tela — e, sendo o
 *     último, todo mundo, com conserto só por SQL.
 */

import { type AppModule, assertGrantable, type ChangeModulePermissionInput, partitionOfLevel } from "@iefa/pbac"
import { SUCONT_ADMIN_MODULE } from "./permission-modules"

/** Prefixo das operações no log de auditoria: `sucont.permission.grant|revoke`. */
export const SUCONT_AUDIT_APP = "sucont"

/** Par (módulo, nível) concedível — validado junto pelo schema da server function. */
export type SucontGrantChange = { userId: string; module: AppModule; level: number }

/**
 * A revogação desta linha tranca o ator fora da tela? Só revogar o PRÓPRIO acesso (allow) de
 * `sucont-admin`. Retirar um bloqueio próprio não tranca ninguém.
 */
export function isSelfAdminRevoke(actorId: string, target: { userId: string; module: AppModule; level: number }): boolean {
	return actorId === target.userId && target.module === SUCONT_ADMIN_MODULE && target.level > 0
}

/** Concessão (idempotente: reconceder substitui o nível e zera o prazo). */
export function buildSucontGrant(actorId: string, data: SucontGrantChange): ChangeModulePermissionInput {
	assertGrantable({ actorId, coverage: "all" }, { userId: data.userId, unitId: null })
	return {
		actorId,
		app: SUCONT_AUDIT_APP,
		action: "grant",
		targetUserId: data.userId,
		module: data.module,
		level: data.level,
		unitId: null,
		expiresAt: null,
	}
}

/** A linha de `user_permissions` que a tela mostrou, lida pelo `permissionId` no servidor. */
export type SucontPermissionRow = {
	id: string
	user_id: string
	module: AppModule
	level: number
	unit_id: number | null
	kitchen_id: number | null
	mess_hall_id: number | null
}

/**
 * Revogação da LINHA que a tela mostrou — a chave inteira dela (usuário, módulo e escopo) e o
 * lado dela (allow ou deny). O alvo sai da linha, lida no servidor pelo `permissionId`; nada
 * disso vem do cliente. Antes a revogação apagava TODAS as linhas de (usuário, módulo); passar
 * a apagar só a chave global faria o "Revogar" de uma linha escopada responder "não há acesso"
 * com o acesso de pé. Pela linha, cada uma sai sozinha — e o outro lado da chave fica.
 */
export function buildSucontRevoke(actorId: string, row: SucontPermissionRow): ChangeModulePermissionInput {
	assertGrantable(
		{ actorId, coverage: "all" },
		{
			userId: row.user_id,
			unitId: row.unit_id,
			revokesAdministration: isSelfAdminRevoke(actorId, { userId: row.user_id, module: row.module, level: row.level }),
		}
	)
	return {
		actorId,
		app: SUCONT_AUDIT_APP,
		action: "revoke",
		targetUserId: row.user_id,
		module: row.module,
		unitId: row.unit_id,
		kitchenId: row.kitchen_id,
		messHallId: row.mess_hall_id,
		partition: partitionOfLevel(row.level),
	}
}
