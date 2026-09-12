/**
 * Registro das operações sensíveis (`access_control.sensitive_operation_log`).
 *
 * ## Apenas-inserção, e isso é o contrato
 *
 * Este arquivo expõe UMA função de ESCRITA, e ela insere (a outra função é a
 * leitura da tela de auditoria, que não altera nada). Não há `updateSensitiveOperation`
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

import { type SisubDb, sensitiveOperationLogInAccessControl, userDataInCore } from "@iefa/database/drizzle/sisub"
import { count, desc, eq } from "drizzle-orm"
import { requirePermission } from "../guards/index.ts"
import {
	type ListSensitiveOperations,
	type RecordSensitiveOperation,
	SENSITIVE_OPERATION_LIST_DEFAULT,
	SENSITIVE_OPERATION_LIST_MAX,
} from "../schemas/audit.ts"
import type { UserContext } from "../types/context.ts"
import { insertOneOrFail, runQuery } from "../utils/index.ts"

/**
 * Valor que o `jsonb` do alvo aceita. Escrito por extenso, e não como `unknown`, porque a
 * checagem de serialização do retorno de server function do TanStack Start reprova
 * `unknown` — e reprova com razão: o que atravessa a fronteira tem que ser serializável.
 */
export type AuditTargetValue = string | number | boolean | null | AuditTargetValue[] | { [key: string]: AuditTargetValue }

/** Projeção do registro gravado — o que a tela de auditoria consome. */
export type SensitiveOperationLogRow = {
	id: string
	actor_id: string
	operation: string
	assurance: string
	/**
	 * Alvo da operação. Tipado como objeto (e não `unknown`) porque o que escreve a
	 * coluna é `RecordSensitiveOperationSchema.target`, que é `Record<string, unknown>` —
	 * e porque `unknown` atravessando a fronteira de uma server function do TanStack
	 * Start reprova a checagem de serialização do retorno.
	 */
	target: Record<string, AuditTargetValue> | null
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
	// O `jsonb` do Drizzle volta como `unknown`; quem grava a coluna é o schema acima.
	return (await insertOneOrFail("AUDIT_INSERT_FAILED", "no row returned", () =>
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
	)) as SensitiveOperationLogRow
}

/** Linha do registro com a identificação legível do ator, para a tela de auditoria. */
export type SensitiveOperationLogEntry = SensitiveOperationLogRow & {
	/** `null` quando o ator ainda não tem linha em `core.user_data` (ela só nasce no login). */
	actor_email: string | null
	actor_nr_ordem: string | null
}

/**
 * Consulta do registro, mais recentes primeiro, com o total da consulta.
 *
 * `admin` nível 3 porque a leitura é a consulta mais sensível do sistema: ela
 * reúne, num lugar só, quem mexeu em permissão e quem moveu dinheiro público.
 * Nível 2 já concede permissão — quem concede não precisa ler o histórico de
 * todo mundo para trabalhar.
 *
 * O `total` volta junto de propósito: sem ele, quem abre a tela lê 50 linhas e
 * conclui que o sistema teve 50 operações sensíveis. É a mesma razão pela qual
 * toda listagem exposta a modelo devolve total (CLAUDE.md).
 */
export async function listSensitiveOperations(
	db: SisubDb,
	ctx: UserContext,
	input: ListSensitiveOperations
): Promise<{ rows: SensitiveOperationLogEntry[]; total: number }> {
	requirePermission(ctx, "admin", 3)

	// Teto reaplicado aqui, e não só no schema: a operation também é chamada por
	// caminhos que não passam pelo validator da server function.
	const limit = Math.min(input.limit ?? SENSITIVE_OPERATION_LIST_DEFAULT, SENSITIVE_OPERATION_LIST_MAX)
	const where = input.actorId ? eq(sensitiveOperationLogInAccessControl.actorId, input.actorId) : undefined

	const [rows, totals] = await Promise.all([
		runQuery("FETCH_FAILED", () =>
			db
				.select({
					...SENSITIVE_OPERATION_LOG_COLS,
					actor_email: userDataInCore.email,
					actor_nr_ordem: userDataInCore.nrOrdem,
				})
				.from(sensitiveOperationLogInAccessControl)
				// LEFT: `core.user_data` só nasce no primeiro login, e um INNER faria
				// sumir da auditoria justamente a linha de quem não tem cadastro —
				// silenciosamente, sem nada indicando a omissão.
				.leftJoin(userDataInCore, eq(userDataInCore.id, sensitiveOperationLogInAccessControl.actorId))
				.where(where)
				.orderBy(desc(sensitiveOperationLogInAccessControl.createdAt))
				.limit(limit)
				.offset(input.offset ?? 0)
		),
		runQuery("FETCH_FAILED", () => db.select({ value: count() }).from(sensitiveOperationLogInAccessControl).where(where)),
	])

	return { rows: rows as SensitiveOperationLogEntry[], total: Number(totals[0]?.value ?? 0) }
}
