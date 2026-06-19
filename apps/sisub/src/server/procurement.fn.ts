/**
 * @module procurement.fn
 * Thin wrapper delegating to @iefa/sisub-domain operations.
 * @domain core
 * @migration done
 */

import { FetchProcurementNeedsSchema, fetchProcurementNeeds } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export const fetchProcurementNeedsFn = createServerFn({ method: "GET" })
	.inputValidator(FetchProcurementNeedsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchProcurementNeeds(getDb(), ctx, data).catch(handleDomainError)
	})
