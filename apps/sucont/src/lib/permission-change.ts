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

import { type AppModule, assertGrantable, type ChangeModulePermissionInput } from "@iefa/pbac"
import { SUCONT_ADMIN_MODULE } from "./permission-modules"

/** Prefixo das operações no log de auditoria: `sucont.permission.grant|revoke`. */
export const SUCONT_AUDIT_APP = "sucont"

/** Par (módulo, nível) concedível — validado junto pelo schema da server function. */
export type SucontGrantChange = { userId: string; module: AppModule; level: number }

/** A revogação tranca o ator fora da tela? Só revogar o PRÓPRIO `sucont-admin`. */
export function isSelfAdminRevoke(actorId: string, target: { userId: string; module: AppModule }): boolean {
	return actorId === target.userId && target.module === SUCONT_ADMIN_MODULE
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

/**
 * Revogação do acesso INLINE de um módulo, na chave global — allow e deny, como a tela
 * sempre fez ("retirar o acesso ao SUCONT-3"). Acesso emprestado por política não é linha
 * desta tabela: sem linha, a função responde "não há acesso concedido" e nada é registrado.
 */
export function buildSucontRevoke(actorId: string, data: { userId: string; module: AppModule }): ChangeModulePermissionInput {
	assertGrantable({ actorId, coverage: "all" }, { userId: data.userId, unitId: null, revokesAdministration: data.module === SUCONT_ADMIN_MODULE })
	return {
		actorId,
		app: SUCONT_AUDIT_APP,
		action: "revoke",
		targetUserId: data.userId,
		module: data.module,
		unitId: null,
		partition: "all",
	}
}
