/**
 * @module procurement-flows.fn
 * Status dos fluxos guiados do planejamento da contratação (change
 * `sisub-procurement-planning-flows`). Só leitura: o status sai dos dados a cada chamada.
 * @domain core
 */

import { type DemandForecastStatus, fetchDemandForecastStatus, fetchProcurementPlanningStatus, type ProcurementPlanningStatus } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export const fetchProcurementPlanningStatusFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive() }))
	.handler(async ({ data }): Promise<ProcurementPlanningStatus> => {
		const ctx = await requireAuth()
		return fetchProcurementPlanningStatus(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchDemandForecastStatusFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }): Promise<DemandForecastStatus> => {
		const ctx = await requireAuth()
		return fetchDemandForecastStatus(getDb(), ctx, data).catch(handleDomainError)
	})
