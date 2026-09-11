/**
 * Registro das operações sensíveis (`access_control.sensitive_operation_log`).
 *
 * ## Apenas-inserção, e isso é o contrato
 *
 * Este arquivo expõe UMA função, e ela insere. Não há `updateSensitiveOperation`
 * nem `deleteSensitiveOperation`, e não deve haver: a especificação exige que não
 * exista caminho de aplicação que altere ou remova linha do log. Uma trilha de
 * auditoria que o próprio sistema consegue editar não prova nada — quem alcança a
 * operação de escrita alcança a reescrita da própria história. O banco sustenta a
 * outra metade: `actor_id` é `on delete restrict`, então apagar o usuário não
 * apaga o que ele fez.
 *
 * ## O ator sai da sessão, nunca do input
 *
 * `ctx.userId` entra direto no `values`. `RecordSensitiveOperation` não tem campo
 * de ator justamente para que não exista assinatura falsificável: aceitar o id do
 * chamador deixaria qualquer operação registrar-se em nome de terceiro.
 *
 * ## Onde chamar
 *
 * No mesmo ponto em que a exigência de garantia é avaliada, DEPOIS de a operação
 * concluir com sucesso. Chamar antes registraria como feito o que o gate de
 * permissão ainda vai rejeitar, e um log que mistura tentativa com execução não
 * responde "o que foi feito".
 */

import { type SisubDb, sensitiveOperationLogInAccessControl } from "@iefa/database/drizzle/sisub"
import type { RecordSensitiveOperation } from "../schemas/audit.ts"
import type { UserContext } from "../types/context.ts"
import { insertOneOrFail } from "../utils/index.ts"

/** Projeção do registro gravado — o que a tela de auditoria consome. */
export type SensitiveOperationLogRow = {
	id: string
	actor_id: string
	operation: string
	assurance: string
	target: unknown
	created_at: string
}

const SENSITIVE_OPERATION_LOG_COLS = {
	id: sensitiveOperationLogInAccessControl.id,
	actor_id: sensitiveOperationLogInAccessControl.actorId,
	operation: sensitiveOperationLogInAccessControl.operation,
	assurance: sensitiveOperationLogInAccessControl.assurance,
	target: sensitiveOperationLogInAccessControl.target,
	created_at: sensitiveOperationLogInAccessControl.createdAt,
} as const

/**
 * Grava uma linha no registro de operações sensíveis e devolve o que ficou
 * gravado.
 *
 * Falha de inserção vira `DomainError("AUDIT_INSERT_FAILED")` e PROPAGA — o
 * chamador não deve engolir. Operação sensível que conclui sem deixar rastro é
 * pior do que operação que falha: a falha é visível, a lacuna não.
 */
export async function recordSensitiveOperation(db: SisubDb, ctx: UserContext, input: RecordSensitiveOperation): Promise<SensitiveOperationLogRow> {
	return insertOneOrFail("AUDIT_INSERT_FAILED", "no row returned", () =>
		db
			.insert(sensitiveOperationLogInAccessControl)
			.values({
				// Ator = sessão. Nunca um id vindo do input.
				actorId: ctx.userId,
				operation: input.operation,
				assurance: input.assurance,
				// `undefined` deixa a coluna nula, que é o que "sem alvo além do ator" significa.
				target: input.target,
			})
			.returning(SENSITIVE_OPERATION_LOG_COLS)
	)
}
