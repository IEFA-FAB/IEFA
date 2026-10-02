/**
 * @module procurement.fn
 * Thin wrapper delegating to @iefa/sisub-domain operations.
 * @domain core
 * @migration done
 */

import { FetchProcurementNeedsSchema, fetchProcurementNeeds } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuthThenRun } from "@/lib/domain-handler.server"

export const fetchProcurementNeedsFn = createServerFn({ method: "GET" })
	.validator(FetchProcurementNeedsSchema)
	.handler(requireAuthThenRun(fetchProcurementNeeds))
