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
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export const fetchTrainingScopeFn = createServerFn({ method: "GET" }).handler(async () => {
	const ctx = await requireAuth()
	return fetchTrainingScope(getDb(), ctx).catch(handleDomainError)
})

export const fetchTrainingResetsFn = createServerFn({ method: "GET" })
	.validator(ListTrainingResetsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listTrainingResets(getDb(), ctx, data).catch(handleDomainError)
	})

export const resetTrainingScopeFn = createServerFn({ method: "POST" }).handler(async () => {
	const ctx = await requireAuth()
	return resetTrainingScope(getDb(), ctx).catch(handleDomainError)
})
