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
import { requireAuth, requireAuthWithPermission, requireSessionIdentity } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { withSessionIdentity } from "@/lib/session-identity"

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

// Terceira leitura da tela de fiscalização, e a única que havia ficado com só `requireAuth()`:
// devolve a contagem de não-cadastrados de qualquer rancho, data e refeição. Mesmo guard das
// outras duas — o payload traz `messHallId`, então o escopo é exigível.
export const fetchOtherPresencesCountFn = createServerFn({ method: "GET" })
	.validator(FetchOtherPresencesCountSchema)
	.handler(async ({ data }): Promise<number> => {
		const ctx = await requireAuth()
		await requireAuthWithPermission("messhall", 1, { type: "mess_hall", id: data.messHallId })
		return fetchOtherPresencesCount(getDb(), ctx, data).catch(handleDomainError)
	})

// `addOtherPresence` já exige `messhall:2` no rancho, então quem PODE lançar está resolvido.
// O que vinha do cliente era a AUTORIA: `adminId` é gravado em `other_presences.admin_id` e é
// o rastro de quem lançou. Com ele no payload, um fiscal legítimo atribuía o lançamento a
// outra pessoa — permissão correta, autoria falsificada. Agora vem da sessão.
export const addOtherPresenceFn = createServerFn({ method: "POST" })
	.validator(AddOtherPresenceSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		const session = await requireSessionIdentity()
		return addOtherPresence(getDb(), ctx, withSessionIdentity(data, session, ["adminId"])).catch(handleDomainError)
	})

// Resolver o nome de terceiro exige `messhall:1` no rancho informado; o próprio nome, não.
// O escopo é o mesmo que a rota `/messhall/$messHallId` exige — e é por isso que o schema
// pede `messHallId` mesmo sem usá-lo na consulta: guard sem escopo aceitaria nível 1 em
// QUALQUER rancho para resolver o nome de qualquer pessoa da base.
export const resolveDisplayNameFn = createServerFn({ method: "GET" })
	.validator(ResolveDisplayNameSchema)
	.handler(async ({ data }): Promise<string | null> => {
		const ctx = await requireAuth()
		if (data.userId !== ctx.userId) await requireAuthWithPermission("messhall", 1, { type: "mess_hall", id: data.messHallId })
		return resolveDisplayName(getDb(), ctx, data).catch(handleDomainError)
	})
