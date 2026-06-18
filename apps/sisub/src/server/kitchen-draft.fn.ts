/**
 * @module kitchen-draft.fn
 * Kitchen ATA draft workflow — pending → sent status lifecycle for kitchen-to-management procurement requests.
 * Thin wrappers delegating to @iefa/sisub-domain operations (operations/kitchen-draft).
 * Auth enforced via requireAuth() — all endpoints now require authentication.
 * Status: "pending" (editable by kitchen) → "sent" (submitted, awaiting management action).
 * @domain core
 * @migration done
 */

import {
	CreateKitchenDraftSchema,
	createKitchenDraft,
	DeleteKitchenDraftSchema,
	deleteKitchenDraft,
	FetchKitchenDraftsSchema,
	FetchPendingDraftSchema,
	fetchKitchenDrafts,
	fetchPendingDraft,
	SendKitchenDraftSchema,
	sendKitchenDraft,
	UpdateKitchenDraftSchema,
	updateKitchenDraft,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { handleDomainError } from "@/lib/domain-errors"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { DraftWithSelections, KitchenAtaDraft } from "@/types/domain/ata"

// ─── Listar rascunhos da cozinha ──────────────────────────────────────────────

export const fetchKitchenDraftsFn = createServerFn({ method: "GET" })
	.inputValidator(FetchKitchenDraftsSchema)
	.handler(async ({ data }): Promise<DraftWithSelections[]> => {
		const ctx = await requireAuth()
		return (await fetchKitchenDrafts(getSupabaseServerClient(), ctx, data).catch(handleDomainError)) as unknown as DraftWithSelections[]
	})

// ─── Buscar rascunho enviado pendente para a cozinha ──────────────────────────

export const fetchPendingDraftFn = createServerFn({ method: "GET" })
	.inputValidator(FetchPendingDraftSchema)
	.handler(async ({ data }): Promise<DraftWithSelections | null> => {
		const ctx = await requireAuth()
		return (await fetchPendingDraft(getSupabaseServerClient(), ctx, data).catch(handleDomainError)) as unknown as DraftWithSelections | null
	})

// ─── Criar rascunho ───────────────────────────────────────────────────────────

export const createKitchenDraftFn = createServerFn({ method: "POST" })
	.inputValidator(CreateKitchenDraftSchema)
	.handler(async ({ data }): Promise<KitchenAtaDraft> => {
		const ctx = await requireAuth()
		return (await createKitchenDraft(getSupabaseServerClient(), ctx, data).catch(handleDomainError)) as unknown as KitchenAtaDraft
	})

// ─── Atualizar rascunho ───────────────────────────────────────────────────────

export const updateKitchenDraftFn = createServerFn({ method: "POST" })
	.inputValidator(UpdateKitchenDraftSchema)
	.handler(async ({ data }): Promise<KitchenAtaDraft> => {
		const ctx = await requireAuth()
		return (await updateKitchenDraft(getSupabaseServerClient(), ctx, data).catch(handleDomainError)) as unknown as KitchenAtaDraft
	})

// ─── Enviar rascunho para a gestão ───────────────────────────────────────────

export const sendKitchenDraftFn = createServerFn({ method: "POST" })
	.inputValidator(SendKitchenDraftSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		await sendKitchenDraft(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

// ─── Deletar rascunho ─────────────────────────────────────────────────────────

export const deleteKitchenDraftFn = createServerFn({ method: "POST" })
	.inputValidator(DeleteKitchenDraftSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		await deleteKitchenDraft(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})
