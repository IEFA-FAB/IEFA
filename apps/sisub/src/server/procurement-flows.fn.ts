/**
 * @module procurement-flows.fn
 * Status dos fluxos guiados do planejamento da contratação (change
 * `sisub-procurement-planning-flows`). Só leitura: o status sai dos dados a cada chamada.
 * @domain core
 */

import { fetchDemandForecastStatus, fetchProcurementPlanningStatus } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuthThenRun } from "@/lib/domain-handler.server"

export const fetchProcurementPlanningStatusFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive() }))
	.handler(requireAuthThenRun(fetchProcurementPlanningStatus))

export const fetchDemandForecastStatusFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(requireAuthThenRun(fetchDemandForecastStatus))
