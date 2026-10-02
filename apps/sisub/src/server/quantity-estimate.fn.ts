/**
 * @module quantity-estimate.fn
 * Procurement list lifecycle: needs calculation, creation, status transitions, soft-delete.
 * Thin wrappers delegating to @iefa/sisub-domain operations (operations/quantity-estimate).
 * Auth enforced via requireAuth() — all endpoints now require authentication.
 * @domain core
 * @migration done
 */

import type { QuantityEstimate } from "@iefa/database/sisub"
import {
	CalculateQuantityEstimateNeedsSchema,
	CreateQuantityEstimateDraftSchema,
	CreateQuantityEstimateSchema,
	calculateQuantityEstimateNeeds,
	calculateQuantityEstimateNeedsForSegment,
	createQuantityEstimate,
	createQuantityEstimateDraft,
	DeleteQuantityEstimateSchema,
	deleteQuantityEstimate,
	FetchQuantityEstimateDetailsSchema,
	FetchQuantityEstimateListSchema,
	FinalizeQuantityEstimateDraftSchema,
	fetchQuantityEstimateDetails,
	fetchQuantityEstimateList,
	finalizeQuantityEstimateDraft,
	type ProcurementNeed,
	SaveQuantityEstimateDraftItemsSchema,
	type SegmentExclusion,
	saveQuantityEstimateDraftItems,
	UpdateQuantityEstimateDraftSchema,
	UpdateQuantityEstimateItemDescriptionSchema,
	UpdateQuantityEstimateItemPricesSchema,
	UpdateQuantityEstimateLimitsSchema,
	UpdateQuantityEstimateStatusSchema,
	updateQuantityEstimateDraft,
	updateQuantityEstimateItemDescription,
	updateQuantityEstimateItemPrices,
	updateQuantityEstimateLimits,
	updateQuantityEstimateStatus,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { requireAuthThenRun } from "@/lib/domain-handler.server"
import type { QuantityEstimateWithDetails } from "@/types/domain/quantity-estimate"

// ─── Calcular necessidades (sem persistir) ────────────────────────────────────

export const calculateQuantityEstimateNeedsFn = createServerFn({ method: "POST" })
	.validator(CalculateQuantityEstimateNeedsSchema)
	.handler(async ({ data }): Promise<{ items: ProcurementNeed[]; excluded: SegmentExclusion | null }> => {
		const ctx = await requireAuth()
		// Anexo de uma contratação: só os itens dela, com a contagem do que ficou de fora.
		if (data.segmentId) return calculateQuantityEstimateNeedsForSegment(getDb(), ctx, { ...data, segmentId: data.segmentId }).catch(handleDomainError)
		return calculateQuantityEstimateNeeds(getDb(), ctx, data)
			.then((items) => ({ items, excluded: null }))
			.catch(handleDomainError)
	})

// ─── Criar rascunho vazio (wizard step 1) ────────────────────────────────────

export const createQuantityEstimateDraftFn = createServerFn({ method: "POST" })
	.validator(CreateQuantityEstimateDraftSchema)
	.handler(requireAuthThenRun(createQuantityEstimateDraft))

// ─── Atualizar metadados e seleções do rascunho ───────────────────────────────

export const updateQuantityEstimateDraftFn = createServerFn({ method: "POST" })
	.validator(UpdateQuantityEstimateDraftSchema)
	.handler(requireAuthThenRun(updateQuantityEstimateDraft))

// ─── Salvar itens calculados no rascunho (substitui todos) ───────────────────

export const saveQuantityEstimateDraftItemsFn = createServerFn({ method: "POST" })
	.validator(SaveQuantityEstimateDraftItemsSchema)
	.handler(requireAuthThenRun(saveQuantityEstimateDraftItems))

// ─── Finalizar rascunho (wizard_step → null, anexo pronto para conclusão) ──────

export const finalizeQuantityEstimateDraftFn = createServerFn({ method: "POST" })
	.validator(FinalizeQuantityEstimateDraftSchema)
	.handler(async ({ data }): Promise<QuantityEstimate> => {
		const ctx = await requireAuth()
		return (await finalizeQuantityEstimateDraft(getDb(), ctx, data).catch(handleDomainError)) as unknown as QuantityEstimate
	})

// ─── Criar anexo (persiste tudo) ────────────────────────────────────────────────

export const createQuantityEstimateFn = createServerFn({ method: "POST" })
	.validator(CreateQuantityEstimateSchema)
	.handler(async ({ data }): Promise<QuantityEstimate> => {
		const ctx = await requireAuth()
		return (await createQuantityEstimate(getDb(), ctx, data).catch(handleDomainError)) as unknown as QuantityEstimate
	})

// ─── Listar anexos da unidade ───────────────────────────────────────────────────

export const fetchQuantityEstimateListFn = createServerFn({ method: "GET" })
	.validator(FetchQuantityEstimateListSchema)
	.handler(async ({ data }): Promise<QuantityEstimate[]> => {
		const ctx = await requireAuth()
		return (await fetchQuantityEstimateList(getDb(), ctx, data).catch(handleDomainError)) as unknown as QuantityEstimate[]
	})

// ─── Buscar anexo com detalhes ──────────────────────────────────────────────────

export const fetchQuantityEstimateDetailsFn = createServerFn({ method: "GET" })
	.validator(FetchQuantityEstimateDetailsSchema)
	.handler(async ({ data }): Promise<QuantityEstimateWithDetails | null> => {
		const ctx = await requireAuth()
		return (await fetchQuantityEstimateDetails(getDb(), ctx, data).catch(handleDomainError)) as unknown as QuantityEstimateWithDetails | null
	})

// ─── Atualizar status do anexo ──────────────────────────────────────────────────

export const updateQuantityEstimateStatusFn = createServerFn({ method: "POST" })
	.validator(UpdateQuantityEstimateStatusSchema)
	.handler(requireAuthThenRun(updateQuantityEstimateStatus))

// ─── Atualizar preços de itens de um anexo já salvo ───────────────────────────

export const updateQuantityEstimateItemPricesFn = createServerFn({ method: "POST" })
	.validator(UpdateQuantityEstimateItemPricesSchema)
	.handler(requireAuthThenRun(updateQuantityEstimateItemPrices))

// ─── Atualizar descrição de um item de anexo ───────────────────────────────────

export const updateQuantityEstimateItemDescriptionFn = createServerFn({ method: "POST" })
	.validator(UpdateQuantityEstimateItemDescriptionSchema)
	.handler(requireAuthThenRun(updateQuantityEstimateItemDescription))

// ─── Ajustar limites do anexo de quantitativos ───────────────────────────────

export const updateQuantityEstimateLimitsFn = createServerFn({ method: "POST" })
	.validator(UpdateQuantityEstimateLimitsSchema)
	.handler(requireAuthThenRun(updateQuantityEstimateLimits))

// ─── Deletar anexo (soft delete) ────────────────────────────────────────────────

export const deleteQuantityEstimateFn = createServerFn({ method: "POST" })
	.validator(DeleteQuantityEstimateSchema)
	.handler(requireAuthThenRun(deleteQuantityEstimate))
