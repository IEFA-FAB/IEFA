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
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import type { PlacesGraphData } from "@/types/domain/places"

export type { UpdateEntityInput }

export const fetchPlacesGraphFn = createServerFn({ method: "GET" }).handler(async () => {
	const ctx = await requireAuth()
	return (await fetchPlacesGraph(getDb(), ctx).catch(handleDomainError)) as unknown as PlacesGraphData
})

export const updatePlacesEntityFn = createServerFn({ method: "POST" })
	.inputValidator(UpdatePlacesEntitySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updatePlacesEntity(getDb(), ctx, data).catch(handleDomainError)
	})

export const applyPlacesDiffFn = createServerFn({ method: "POST" })
	.inputValidator(ApplyPlacesDiffSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return applyPlacesDiff(getDb(), ctx, data).catch(handleDomainError)
	})
