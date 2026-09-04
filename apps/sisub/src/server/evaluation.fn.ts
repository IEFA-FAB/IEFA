/**
 * @module evaluation.fn
 * Wrapper fino sobre as operations de avaliação de `@iefa/sisub-domain` (Drizzle).
 * TABLES: super_admin_controller (key="evaluation"), opinions.
 *
 * O gate `admin:2` da escrita da config mora AGORA na operation — não aqui e muito menos no
 * `beforeLoad` da rota. O endpoint `/_serverFn/...` é chamável direto, sem passar pelo router.
 * @domain app
 * @migration done
 */

import { fetchEvalConfig, fetchEvaluationForUser, SubmitEvaluationSchema, submitEvaluation, UpsertEvalConfigSchema, upsertEvalConfig } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth, requireUserId } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import type { EvalConfig, EvaluationResult } from "@/types/domain/admin"

/**
 * Config corrente (flag + texto da pergunta). Nunca lança por linha ausente — devolve
 * `{ active: false, value: "" }`.
 */
export const fetchEvalConfigFn = createServerFn({ method: "GET" }).handler(async (): Promise<EvalConfig> => {
	await requireUserId()
	return fetchEvalConfig(getDb()).catch(handleDomainError)
})

/**
 * Upsert da config da avaliação (chave `evaluation`).
 *
 * @remarks
 * SIDE EFFECTS: escreve em super_admin_controller. Exige `admin:2` (guard na operation).
 */
export const upsertEvalConfigFn = createServerFn({ method: "POST" })
	.validator(UpsertEvalConfigSchema)
	.handler(async ({ data }): Promise<EvalConfig> => {
		const ctx = await requireAuth()
		return upsertEvalConfig(getDb(), ctx, data).catch(handleDomainError)
	})

/**
 * Diz se o usuário da sessão ainda deve ver o convite de avaliação.
 * Self-only: a identidade vem da sessão — o cliente não decide de quem é a avaliação.
 */
export const fetchEvaluationForUserFn = createServerFn({ method: "GET" }).handler(async (): Promise<EvaluationResult> => {
	const ctx = await requireAuth()
	return fetchEvaluationForUser(getDb(), ctx).catch(handleDomainError)
})

/**
 * Registra a resposta do usuário autenticado.
 *
 * @remarks
 * SIDE EFFECTS: insere em opinions. Sem unicidade — resposta repetida é aceita.
 */
export const submitEvaluationFn = createServerFn({ method: "POST" })
	.validator(SubmitEvaluationSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		return submitEvaluation(getDb(), ctx, data).catch(handleDomainError)
	})
