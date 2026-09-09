/**
 * @module messhall.fn
 * Mess hall lookup, diner forecast queries and extra-presence tracking.
 * Thin wrappers over @iefa/sisub-domain (operations/places).
 * @domain core
 * @migration done
 */

import {
	AddOtherPresenceSchema,
	addOtherPresence,
	FetchMessHallByCodeSchema,
	FetchOtherPresencesCountSchema,
	FetchUserMealForecastSchema,
	fetchMessHallByCode,
	fetchMessHallIdByCode,
	fetchOtherPresencesCount,
	fetchUserMealForecast,
	ResolveDisplayNameSchema,
	resolveDisplayName,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth, requireAuthWithPermission } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export const fetchMessHallByCodeFn = createServerFn({ method: "GET" })
	.validator(FetchMessHallByCodeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchMessHallByCode(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchMessHallIdByCodeFn = createServerFn({ method: "GET" })
	.validator(FetchMessHallByCodeSchema)
	.handler(async ({ data }): Promise<number | null> => {
		const ctx = await requireAuth()
		return fetchMessHallIdByCode(getDb(), ctx, data).catch(handleDomainError)
	})

// Dois chamadores legítimos, como em `insertPresence`: o comensal no self check-in (manda o
// PRÓPRIO id) e o fiscal do rancho (manda o id de terceiro). Só o segundo precisa de
// `messhall`. Sem essa ramificação bastava estar autenticado para ler a previsão de qualquer
// pessoa — `fetchUserMealForecast` descarta o `_ctx` e filtra apenas por `input.userId`.
export const fetchUserMealForecastFn = createServerFn({ method: "GET" })
	.validator(FetchUserMealForecastSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		if (data.userId !== ctx.userId) await requireAuthWithPermission("messhall", 1, { type: "mess_hall", id: data.messHallId })
		return fetchUserMealForecast(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchOtherPresencesCountFn = createServerFn({ method: "GET" })
	.validator(FetchOtherPresencesCountSchema)
	.handler(async ({ data }): Promise<number> => {
		const ctx = await requireAuth()
		return fetchOtherPresencesCount(getDb(), ctx, data).catch(handleDomainError)
	})

export const addOtherPresenceFn = createServerFn({ method: "POST" })
	.validator(AddOtherPresenceSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return addOtherPresence(getDb(), ctx, data).catch(handleDomainError)
	})

// Resolver o nome de terceiro exige `messhall`; o próprio nome, não. A entrada não traz
// refeitório, então não há escopo a exigir — o guard é o módulo sem escopo, que já exclui o
// comensal comum (a permissão implícita de todo mundo é `diner`, não `messhall`). Sem isso
// qualquer autenticado convertia um UUID em nome de pessoa, e o endpoint `/_serverFn/...` é
// chamável direto, sem passar pela tela de fiscalização.
export const resolveDisplayNameFn = createServerFn({ method: "GET" })
	.validator(ResolveDisplayNameSchema)
	.handler(async ({ data }): Promise<string | null> => {
		const ctx = await requireAuth()
		if (data.userId !== ctx.userId) await requireAuthWithPermission("messhall", 1)
		return resolveDisplayName(getDb(), ctx, data).catch(handleDomainError)
	})
