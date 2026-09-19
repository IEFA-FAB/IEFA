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
import { and, asc, count, desc, eq, type SQL, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
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

/** Linha do registro com a identificação legível do ator e do alvo, para a tela de auditoria. */
export type SensitiveOperationLogEntry = SensitiveOperationLogRow & {
	/** `null` quando o ator ainda não tem linha em `core.user_data` (ela só nasce no login). */
	actor_email: string | null
	actor_nr_ordem: string | null
	/**
	 * E-mail da pessoa cujo acesso mudou (`target.target_user_id`, ou `userId`/`targetUserId`
	 * nas linhas anteriores ao formato padrão). `null` quando a operação não tem alvo pessoal
	 * (empenho, política sem anexo) ou quando o alvo ainda não tem cadastro.
	 */
	target_email: string | null
}

const log = sensitiveOperationLogInAccessControl

/** Mesma tabela, segundo papel: o cadastro do ALVO, ao lado do cadastro do ator. */
const targetUser = alias(userDataInCore, "target_user")

/**
 * Chaves em que o alvo pessoal foi gravado, na ordem de preferência. `target_user_id` é o
 * formato padrão das funções auditadas (20260921130000); `userId` e `targetUserId` são das
 * linhas que o app gravava antes delas — o log é apenas-inserção, então elas ficam para
 * sempre e o filtro tem de continuar achando-as.
 */
const TARGET_USER_KEYS = ["target_user_id", "userId", "targetUserId"] as const

/** `target ->> '<chave>'`. A chave é literal do código (lista acima), nunca input. */
const targetKey = (key: (typeof TARGET_USER_KEYS)[number]) => sql`${log.target} ->> ${sql.raw(`'${key}'`)}`

/** Texto do alvo pessoal, `null` quando a linha não tem nenhuma das chaves. */
const targetUserText = sql`coalesce(${sql.join(TARGET_USER_KEYS.map(targetKey), sql`, `)})`

/**
 * O alvo pessoal como `uuid`, para o join com `core.user_data` usar a chave primária. O
 * cast só acontece quando o texto TEM forma de uuid: um alvo legado com outra coisa na
 * chave derrubaria a leitura inteira com `invalid input syntax for type uuid` — e a tela
 * de auditoria sumiria por causa de uma linha.
 */
const targetUserUuid = sql`(case when ${targetUserText} ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (${targetUserText})::uuid end)`

/**
 * "O que aconteceu com o acesso desta pessoa": ela como alvo direto, em qualquer das
 * chaves, OU como alcançada por mudança de política (`affected_user_ids`, que as funções
 * de política gravam com todos os anexados). Sem o segundo braço, remover uma política
 * revogaria o acesso de 40 pessoas e nenhuma delas veria a linha no próprio histórico.
 *
 * Comparação em TEXTO (`->>` e `?`), sem cast: alvo legado malformado não quebra a
 * consulta — só não casa.
 */
function targetUserPredicate(userId: string): SQL {
	const direct = TARGET_USER_KEYS.map((key) => sql`${targetKey(key)} = ${userId}`)
	return sql`(${sql.join(direct, sql` or `)} or ${log.target} -> 'affected_user_ids' ? ${userId})`
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
 * toda listagem exposta a modelo devolve total (CLAUDE.md). E ele usa o MESMO
 * `where` da página — um total que ignorasse o filtro diria "de 3.000" numa consulta
 * que tem 12.
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
	const where = and(
		input.actorId ? eq(log.actorId, input.actorId) : undefined,
		input.targetUserId ? targetUserPredicate(input.targetUserId) : undefined,
		input.operation ? eq(log.operation, input.operation) : undefined
	)

	const [rows, totals] = await Promise.all([
		runQuery("FETCH_FAILED", () =>
			db
				.select({
					...SENSITIVE_OPERATION_LOG_COLS,
					actor_email: userDataInCore.email,
					actor_nr_ordem: userDataInCore.nrOrdem,
					target_email: targetUser.email,
				})
				.from(log)
				// LEFT: `core.user_data` só nasce no primeiro login, e um INNER faria
				// sumir da auditoria justamente a linha de quem não tem cadastro —
				// silenciosamente, sem nada indicando a omissão. Vale para o ator e para o alvo.
				.leftJoin(userDataInCore, eq(userDataInCore.id, log.actorId))
				.leftJoin(targetUser, sql`${targetUser.id} = ${targetUserUuid}`)
				.where(where)
				.orderBy(desc(log.createdAt))
				.limit(limit)
				.offset(input.offset ?? 0)
		),
		// Sem join: os filtros são todos sobre o log, e nenhum LEFT JOIN multiplica linha
		// (`user_data.id` é chave primária) — o total conta exatamente o que a página pagina.
		runQuery("FETCH_FAILED", () => db.select({ value: count() }).from(log).where(where)),
	])

	return { rows: rows as SensitiveOperationLogEntry[], total: Number(totals[0]?.value ?? 0) }
}

/**
 * Nomes de operação distintos já gravados no registro — as opções do filtro "Operação".
 *
 * Lidos do log, e não de uma lista no código: as operações vêm de seis apps e de scripts,
 * e uma lista digitada deixaria de fora justamente a operação nova que alguém quer
 * investigar. Mesmo guard da leitura do registro: a lista já conta o que foi feito no
 * sistema (existir `forms.viewer.revoke` diz que houve revogação de visualizador).
 */
export async function listSensitiveOperationNames(db: SisubDb, ctx: UserContext): Promise<string[]> {
	requirePermission(ctx, "admin", 3)

	const rows = await runQuery("FETCH_FAILED", () => db.selectDistinct({ operation: log.operation }).from(log).orderBy(asc(log.operation)))
	return rows.map((row) => row.operation)
}
