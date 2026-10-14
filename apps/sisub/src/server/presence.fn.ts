/**
 * @module presence.fn
 * Fiscal presence tracking: read presences + arranchamentos, insert/delete presence records.
 * Thin wrappers over @iefa/sisub-domain (operations/presence).
 * @domain core
 * @migration done
 */

import {
	DeletePresenceSchema,
	deletePresence,
	InsertPresenceSchema,
	insertPresence,
	ListArranchamentoMapSchema,
	ListPresencesSchema,
	listArranchamentoMap,
	listPresences,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth, requireAuthWithPermission } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { requireAuthThenRun } from "@/lib/domain-handler.server"
import type { ArranchamentoMap, FiscalPresenceRecord } from "@/types/domain/presence"

// Os reads são do FISCAL: devolvem quem comeu onde e quando, e o mapa de previsão de uma lista
// de comensais escolhida pelo chamador. Exigem `messhall:1` no refeitório consultado — o mesmo
// que `$messHallId/route.tsx` já exige no `beforeLoad`. O guard da rota não dispensa este: ele
// governa a navegação, e `/_serverFn/...` é chamável direto, sem passar por rota nenhuma.
// Antes exigiam apenas sessão (e, antes disso, nada), então qualquer autenticado enumerava
// presença de comensal de qualquer refeitório. As operations não têm ctx, então o guard é aqui.
export const fetchPresencesFn = createServerFn({ method: "GET" })
	.validator(ListPresencesSchema)
	.handler(async ({ data }) => {
		await requireAuthWithPermission("messhall", 1, { type: "mess_hall", id: data.messHallId })
		return (await listPresences(getDb(), data).catch(handleDomainError)) as unknown as FiscalPresenceRecord[]
	})

export const fetchArranchamentoMapFn = createServerFn({ method: "GET" })
	.validator(ListArranchamentoMapSchema)
	.handler(async ({ data }) => {
		await requireAuthWithPermission("messhall", 1, { type: "mess_hall", id: data.messHallId })
		return (await listArranchamentoMap(getDb(), data)) as ArranchamentoMap
	})

/** Presença gravada agora, ou que já existia (fiscal e comensal tratam as duas como sucesso). */
export type InsertPresenceOutcome = { status: "inserted" } | { status: "duplicate" }

const PG_UNIQUE_VIOLATION = "23505"

export const insertPresenceFn = createServerFn({ method: "POST" })
	.validator(InsertPresenceSchema)
	.handler(async ({ data }): Promise<InsertPresenceOutcome> => {
		const ctx = await requireAuth()
		try {
			await insertPresence(getDb(), ctx, data)
			return { status: "inserted" }
		} catch (e) {
			// A duplicidade volta como RESULTADO, não como erro: o transporte da server fn
			// (ShallowErrorPlugin do TanStack Start) só leva a `message` do erro, e o `code` "23505"
			// que insertPresence preserva some antes de chegar ao navegador.
			if ((e as { code?: unknown } | null)?.code === PG_UNIQUE_VIOLATION) return { status: "duplicate" }
			throw e
		}
	})

export const deletePresenceFn = createServerFn({ method: "POST" }).validator(DeletePresenceSchema).handler(requireAuthThenRun(deletePresence))
