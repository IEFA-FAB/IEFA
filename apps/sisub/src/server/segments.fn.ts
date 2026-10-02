/**
 * @module segments.fn
 * Segmentação das contratações da OM (change `sisub-procurement-planning-flows`, D3).
 * Wrappers finos das operações de `@iefa/sisub-domain` (operations/segments):
 * ler exige `unit:1` na OM; escrever, `unit:2`, com a OM lida do banco.
 * @domain core
 */

import {
	AddSegmentRuleSchema,
	addSegmentRule,
	CreateSegmentSchema,
	createSegment,
	DeleteSegmentSchema,
	deleteSegment,
	FetchSegmentationSchema,
	fetchSegmentationOverview,
	RemoveSegmentRuleSchema,
	removeSegmentRule,
	UpdateSegmentSchema,
	updateSegment,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuthThenRun } from "@/lib/domain-handler.server"

export const fetchSegmentationOverviewFn = createServerFn({ method: "GET" })
	.validator(FetchSegmentationSchema)
	.handler(requireAuthThenRun(fetchSegmentationOverview))

export const createSegmentFn = createServerFn({ method: "POST" }).validator(CreateSegmentSchema).handler(requireAuthThenRun(createSegment))

export const updateSegmentFn = createServerFn({ method: "POST" }).validator(UpdateSegmentSchema).handler(requireAuthThenRun(updateSegment))

export const deleteSegmentFn = createServerFn({ method: "POST" }).validator(DeleteSegmentSchema).handler(requireAuthThenRun(deleteSegment))

export const addSegmentRuleFn = createServerFn({ method: "POST" }).validator(AddSegmentRuleSchema).handler(requireAuthThenRun(addSegmentRule))

export const removeSegmentRuleFn = createServerFn({ method: "POST" }).validator(RemoveSegmentRuleSchema).handler(requireAuthThenRun(removeSegmentRule))
