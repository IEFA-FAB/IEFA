/**
 * @module presence.fn
 * Fiscal presence tracking: read presences + forecasts, insert/delete presence records.
 * Thin wrappers over @iefa/sisub-domain (operations/presence).
 * @domain core
 * @migration done
 */

import {
	DeletePresenceSchema,
	deletePresence,
	InsertPresenceSchema,
	insertPresence,
	ListForecastMapSchema,
	ListPresencesSchema,
	listForecastMap,
	listPresences,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth, requireAuthWithPermission } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import type { FiscalPresenceRecord, ForecastMap } from "@/types/domain/presence"

// Os reads são do FISCAL: devolvem quem comeu onde e quando, e o mapa de previsão de uma lista
// de comensais escolhida pelo chamador. Exigem `messhall:1` no refeitório consultado — o mesmo
// que `$messHallId/route.tsx` já exige no `beforeLoad`. O guard da rota não dispensa este: ele
// governa a navegação, e `/_serverFn/...` é chamável direto, sem passar por rota nenhuma.
// Antes exigiam apenas sessão (e, antes disso, nada), então qualquer autenticado enumerava
// presença de comensal de qualquer rancho. As operations não têm ctx, então o guard é aqui.
export const fetchPresencesFn = createServerFn({ method: "GET" })
	.validator(ListPresencesSchema)
	.handler(async ({ data }) => {
		await requireAuthWithPermission("messhall", 1, { type: "mess_hall", id: data.messHallId })
		return (await listPresences(getDb(), data).catch(handleDomainError)) as unknown as FiscalPresenceRecord[]
	})

export const fetchForecastsFn = createServerFn({ method: "GET" })
	.validator(ListForecastMapSchema)
	.handler(async ({ data }) => {
		await requireAuthWithPermission("messhall", 1, { type: "mess_hall", id: data.messHallId })
		return (await listForecastMap(getDb(), data)) as ForecastMap
	})

export const insertPresenceFn = createServerFn({ method: "POST" })
	.validator(InsertPresenceSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		// No handleDomainError: insertPresence throws a code-bearing Error so callers
		// can detect PG unique violations (code "23505"). Propagate it unchanged.
		return insertPresence(getDb(), ctx, data)
	})

export const deletePresenceFn = createServerFn({ method: "POST" })
	.validator(DeletePresenceSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deletePresence(getDb(), ctx, data).catch(handleDomainError)
	})
