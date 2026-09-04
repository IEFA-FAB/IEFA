/**
 * Avaliação interna — a pergunta global (toggle da SDAB) e a resposta de cada usuário.
 * Camada de query Drizzle; substitui o acesso PostgREST direto de `evaluation.fn.ts`.
 *
 * Duas autorizações distintas convivem aqui, e trocá-las é o erro fácil:
 *   - a CONFIG é administração de plataforma → `admin:2` (mesmo gate da tela `/admin`);
 *   - a RESPOSTA é do próprio usuário → o autor sai do `UserContext`, nunca do input.
 *
 * `super_admin_controller` é uma tabela chave-valor genérica; aqui só a chave `evaluation`
 * é tocada, e ela é constante — nada vindo da requisição escolhe qual chave escrever.
 */

import { opinionsInKitchen, type SisubDb, superAdminControllerInKitchen } from "@iefa/database/drizzle/sisub"
import { and, eq } from "drizzle-orm"
import { requirePermission } from "../guards/require-permission.ts"
import type { SubmitEvaluation, UpsertEvalConfig } from "../schemas/evaluation.ts"
import type { UserContext } from "../types/context.ts"
import { insertOneOrFail, runQuery } from "../utils/index.ts"

/** Única chave de `super_admin_controller` que estas operações leem/escrevem. */
const EVALUATION_KEY = "evaluation"

export interface EvalConfig {
	active: boolean
	value: string
}

export interface EvaluationForUser {
	shouldAsk: boolean
	question: string | null
}

/** Normaliza a linha (ausente, `active` nulo, `value` nulo) no contrato que a tela consome. */
function toEvalConfig(row: { active: boolean | null; value: string | null } | undefined): EvalConfig {
	return { active: row?.active === true, value: row?.value ?? "" }
}

/**
 * Config corrente da avaliação. Nunca lança por linha ausente — devolve
 * `{ active: false, value: "" }`, que é o estado "avaliação desligada".
 *
 * Sem `UserContext` de propósito: é um toggle global sem dado pessoal, lido por toda sessão
 * autenticada (o gate de sessão fica na server fn). Receber o contexto e não usá-lo seria
 * fingir uma autorização que não existe — ver a regra `domain-op-discards-user-context`.
 */
export async function fetchEvalConfig(db: SisubDb): Promise<EvalConfig> {
	const rows = await runQuery("QUERY_FAILED", () =>
		db
			.select({ active: superAdminControllerInKitchen.active, value: superAdminControllerInKitchen.value })
			.from(superAdminControllerInKitchen)
			.where(eq(superAdminControllerInKitchen.key, EVALUATION_KEY))
			.limit(1)
	)
	return toEvalConfig(rows[0])
}

/**
 * Liga/desliga a avaliação e grava a pergunta. Upsert na chave `evaluation`.
 *
 * `admin:2`: antes da migração o gate real vivia só no `beforeLoad` da rota — qualquer sessão
 * autenticada que chamasse o endpoint direto reescrevia a pergunta global.
 */
export async function upsertEvalConfig(db: SisubDb, ctx: UserContext, input: UpsertEvalConfig): Promise<EvalConfig> {
	requirePermission(ctx, "admin", 2)

	const row = await insertOneOrFail("UPSERT_FAILED", "eval config não salva", () =>
		db
			.insert(superAdminControllerInKitchen)
			.values({ key: EVALUATION_KEY, active: input.active, value: input.value })
			.onConflictDoUpdate({
				target: superAdminControllerInKitchen.key,
				set: { active: input.active, value: input.value },
			})
			.returning({ active: superAdminControllerInKitchen.active, value: superAdminControllerInKitchen.value })
	)
	return toEvalConfig(row)
}

/**
 * Decide se ESTE usuário ainda deve ver o convite de avaliação.
 *
 * Duas etapas: config desligada ou pergunta em branco encerram antes de tocar `opinions`;
 * caso contrário, procura resposta do próprio usuário para a pergunta corrente.
 * O `user_id` sai do contexto — consultar a resposta de terceiro seria IDOR.
 */
export async function fetchEvaluationForUser(db: SisubDb, ctx: UserContext): Promise<EvaluationForUser> {
	const config = await fetchEvalConfig(db)
	if (!config.active || !config.value) {
		return { shouldAsk: false, question: config.value || null }
	}

	const answered = await runQuery("QUERY_FAILED", () =>
		db
			.select({ id: opinionsInKitchen.id })
			.from(opinionsInKitchen)
			.where(and(eq(opinionsInKitchen.question, config.value), eq(opinionsInKitchen.userId, ctx.userId)))
			.limit(1)
	)

	return { shouldAsk: answered.length === 0, question: config.value }
}

/**
 * Registra a resposta do usuário autenticado.
 *
 * Sem unicidade no banco: resposta repetida é aceita (comportamento preservado da versão
 * PostgREST). O que NÃO é aceito é responder por outra pessoa — `userId` vem do contexto.
 */
export async function submitEvaluation(db: SisubDb, ctx: UserContext, input: SubmitEvaluation): Promise<void> {
	await insertOneOrFail("INSERT_FAILED", "avaliação não registrada", () =>
		db.insert(opinionsInKitchen).values({ value: input.value, question: input.question, userId: ctx.userId }).returning({ id: opinionsInKitchen.id })
	)
}
