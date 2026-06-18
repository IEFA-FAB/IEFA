/**
 * @module procurement.fn
 * Thin wrapper delegating to @iefa/sisub-domain operations.
 * @domain core
 * @migration done
 */

import { FetchProcurementNeedsSchema, fetchProcurementNeeds } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { handleDomainError } from "@/lib/domain-errors"
import { getSupabaseServerClient } from "@/lib/supabase.server"

export const fetchProcurementNeedsFn = createServerFn({ method: "GET" })
	.inputValidator(FetchProcurementNeedsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchProcurementNeeds(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})
