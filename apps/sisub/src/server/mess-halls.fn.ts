/**
 * @module mess-halls.fn
 * Reference data: all units and mess halls. Thin wrappers over @iefa/sisub-domain.
 * @domain core
 * @migration done
 */

import { listAllMessHalls, listUnits } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import type { MessHall, Unit } from "@/types/domain/meal"

export const fetchUnitsFn = createServerFn({ method: "GET" }).handler(async () => {
	const ctx = await requireAuth()
	return (await listUnits(getDb(), ctx).catch(handleDomainError)) as unknown as Unit[]
})

export const fetchMessHallsFn = createServerFn({ method: "GET" }).handler(async () => {
	const ctx = await requireAuth()
	return (await listAllMessHalls(getDb(), ctx).catch(handleDomainError)) as unknown as MessHall[]
})
