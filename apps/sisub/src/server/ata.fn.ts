/**
 * @module ata.fn
 * Procurement list lifecycle: needs calculation, creation, status transitions, soft-delete.
 * Thin wrappers delegating to @iefa/sisub-domain operations (operations/ata).
 * Auth enforced via requireAuth() — all endpoints now require authentication.
 * @domain core
 * @migration done
 */

import type { ProcurementList } from "@iefa/database/sisub"
import {
	CalculateAtaNeedsSchema,
	CreateAtaDraftSchema,
	CreateAtaSchema,
	calculateAtaNeeds,
	createAta,
	createAtaDraft,
	DeleteAtaSchema,
	deleteAta,
	FetchAtaDetailsSchema,
	FetchAtaListSchema,
	FinalizeAtaDraftSchema,
	fetchAtaDetails,
	fetchAtaList,
	finalizeAtaDraft,
	type ProcurementNeed,
	SaveAtaDraftItemsSchema,
	saveAtaDraftItems,
	UpdateAtaDraftSchema,
	UpdateAtaItemDescriptionSchema,
	UpdateAtaItemPricesSchema,
	UpdateAtaStatusSchema,
	updateAtaDraft,
	updateAtaItemDescription,
	updateAtaItemPrices,
	updateAtaStatus,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { handleDomainError } from "@/lib/domain-errors"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { AtaWithDetails } from "@/types/domain/ata"

// ─── Calcular necessidades (sem persistir) ────────────────────────────────────

export const calculateAtaNeedsFn = createServerFn({ method: "POST" })
	.inputValidator(CalculateAtaNeedsSchema)
	.handler(async ({ data }): Promise<ProcurementNeed[]> => {
		const ctx = await requireAuth()
		return calculateAtaNeeds(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

// ─── Criar rascunho vazio (wizard step 1) ────────────────────────────────────

export const createAtaDraftFn = createServerFn({ method: "POST" })
	.inputValidator(CreateAtaDraftSchema)
	.handler(async ({ data }): Promise<{ id: string }> => {
		const ctx = await requireAuth()
		return createAtaDraft(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

// ─── Atualizar metadados e seleções do rascunho ───────────────────────────────

export const updateAtaDraftFn = createServerFn({ method: "POST" })
	.inputValidator(UpdateAtaDraftSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateAtaDraft(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

// ─── Salvar itens calculados no rascunho (substitui todos) ───────────────────

export const saveAtaDraftItemsFn = createServerFn({ method: "POST" })
	.inputValidator(SaveAtaDraftItemsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return saveAtaDraftItems(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

// ─── Finalizar rascunho (wizard_step → null, ata pronta para publicação) ──────

export const finalizeAtaDraftFn = createServerFn({ method: "POST" })
	.inputValidator(FinalizeAtaDraftSchema)
	.handler(async ({ data }): Promise<ProcurementList> => {
		const ctx = await requireAuth()
		return (await finalizeAtaDraft(getSupabaseServerClient(), ctx, data).catch(handleDomainError)) as unknown as ProcurementList
	})

// ─── Criar ATA (persiste tudo) ────────────────────────────────────────────────

export const createAtaFn = createServerFn({ method: "POST" })
	.inputValidator(CreateAtaSchema)
	.handler(async ({ data }): Promise<ProcurementList> => {
		const ctx = await requireAuth()
		return (await createAta(getSupabaseServerClient(), ctx, data).catch(handleDomainError)) as unknown as ProcurementList
	})

// ─── Listar ATAs da unidade ───────────────────────────────────────────────────

export const fetchAtaListFn = createServerFn({ method: "GET" })
	.inputValidator(FetchAtaListSchema)
	.handler(async ({ data }): Promise<ProcurementList[]> => {
		const ctx = await requireAuth()
		return (await fetchAtaList(getSupabaseServerClient(), ctx, data).catch(handleDomainError)) as unknown as ProcurementList[]
	})

// ─── Buscar ATA com detalhes ──────────────────────────────────────────────────

export const fetchAtaDetailsFn = createServerFn({ method: "GET" })
	.inputValidator(FetchAtaDetailsSchema)
	.handler(async ({ data }): Promise<AtaWithDetails | null> => {
		const ctx = await requireAuth()
		return (await fetchAtaDetails(getSupabaseServerClient(), ctx, data).catch(handleDomainError)) as unknown as AtaWithDetails | null
	})

// ─── Atualizar status da ATA ──────────────────────────────────────────────────

export const updateAtaStatusFn = createServerFn({ method: "POST" })
	.inputValidator(UpdateAtaStatusSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateAtaStatus(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

// ─── Atualizar preços de itens de uma ATA já salva ───────────────────────────

export const updateAtaItemPricesFn = createServerFn({ method: "POST" })
	.inputValidator(UpdateAtaItemPricesSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateAtaItemPrices(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

// ─── Atualizar descrição de um item de ATA ───────────────────────────────────

export const updateAtaItemDescriptionFn = createServerFn({ method: "POST" })
	.inputValidator(UpdateAtaItemDescriptionSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateAtaItemDescription(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

// ─── Deletar ATA (soft delete) ────────────────────────────────────────────────

export const deleteAtaFn = createServerFn({ method: "POST" })
	.inputValidator(DeleteAtaSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteAta(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})
