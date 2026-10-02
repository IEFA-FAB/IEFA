/**
 * @module training.fn
 * Ambiente de treino — estado, reset e histórico. Wrappers finos sobre @iefa/sisub-domain.
 *
 * O autor do reset é resolvido pela própria operação a partir do contexto autenticado — não
 * existe parâmetro de autor, então não há como atribuir a execução a outra pessoa no log.
 * @domain core
 * @migration done
 */

import { fetchTrainingScope, ListTrainingResetsSchema, listTrainingResets, resetTrainingScope } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { withSensitiveAudit } from "@/lib/audit.server"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { requireAuthThenRun } from "@/lib/domain-handler.server"

export const fetchTrainingScopeFn = createServerFn({ method: "GET" }).handler(async () => {
	const ctx = await requireAuth()
	return fetchTrainingScope(getDb(), ctx).catch(handleDomainError)
})

export const fetchTrainingResetsFn = createServerFn({ method: "GET" }).validator(ListTrainingResetsSchema).handler(requireAuthThenRun(listTrainingResets))

export const resetTrainingScopeFn = createServerFn({ method: "POST" }).handler(async () => {
	const ctx = await requireAuth()
	// O escopo do treino é fixo (uma unidade, uma cozinha, um refeitório): o alvo é a
	// execução, e é por ela que se chega ao que foi apagado em `kitchen.training_reset_log`.
	return withSensitiveAudit(
		"resetTrainingScopeFn",
		ctx,
		(assurance) => resetTrainingScope(getDb(), ctx, assurance),
		(result) => ({ resetId: result.reset_id })
	).catch(handleDomainError)
})
