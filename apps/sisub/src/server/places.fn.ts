/**
 * @module places.fn
 * Organisational hierarchy CRUD: units, kitchens and mess halls graph management.
 * Thin wrappers over @iefa/sisub-domain (operations/places).
 * @domain core
 * @migration done
 */

import {
	ApplyPlacesDiffSchema,
	applyPlacesDiff,
	fetchPlacesGraph,
	type UpdateEntityInput,
	UpdatePlacesEntitySchema,
	updatePlacesEntity,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { withAtomicAudit } from "@/lib/audit.server"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { requireAuthThenRun } from "@/lib/domain-handler.server"
import type { PlacesGraphData } from "@/types/domain/places"

export type { UpdateEntityInput }

export const fetchPlacesGraphFn = createServerFn({ method: "GET" }).handler(async () => {
	const ctx = await requireAuth()
	return (await fetchPlacesGraph(getDb(), ctx).catch(handleDomainError)) as unknown as PlacesGraphData
})

export const updatePlacesEntityFn = createServerFn({ method: "POST" }).validator(UpdatePlacesEntitySchema).handler(requireAuthThenRun(updatePlacesEntity))

/**
 * Reparentar cozinha ou refeitório (mudar a OM dele) muda quem o alcança: a operação exige
 * `admin:2` para isso e grava o log na mesma transação da escrita — por isso o envelope atômico,
 * que só entrega nome e grau.
 */
export const applyPlacesDiffFn = createServerFn({ method: "POST" })
	.validator(ApplyPlacesDiffSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return withAtomicAudit("applyPlacesDiffFn", ({ audit }) => applyPlacesDiff(getDb(), ctx, data, audit)).catch(handleDomainError)
	})
