/**
 * Kitchen ATA draft operations: pending → sent status lifecycle for
 * kitchen-to-management procurement requests.
 *
 * Auth posture preserved from the original server functions: reads have no PBAC
 * guard; mutations were authenticated-only (no module-level guard). The thin
 * wrappers call requireAuth() and pass ctx; ops do not use it.
 *
 * Status: "pending" (editable by kitchen) → "sent" (submitted, awaiting management action).
 * Special error messages (`Erro ao ...: message`) preserved verbatim.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type {
	CreateKitchenDraft,
	DeleteKitchenDraft,
	FetchKitchenDrafts,
	FetchPendingDraft,
	SendKitchenDraft,
	UpdateKitchenDraft,
} from "../schemas/procurement.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client
type AnyClient = SupabaseClient<any, any, any>

const DRAFT_WITH_SELECTIONS = `
        *,
        selections:kitchen_ata_draft_selection (
          *,
          template:template_id ( id, name, template_type )
        )
      ` as const

/** Lists all drafts for a kitchen with their template selections, ordered by creation date descending. */
export async function fetchKitchenDrafts(client: AnyClient, _ctx: UserContext, input: FetchKitchenDrafts) {
	const { data: drafts, error } = await client
		.from("kitchen_ata_draft")
		.select(DRAFT_WITH_SELECTIONS)
		.eq("kitchen_id", input.kitchenId)
		.order("created_at", { ascending: false })

	if (error) throw new DomainError("FETCH_FAILED", `Erro ao buscar rascunhos: ${error.message}`)
	return drafts ?? []
}

/** Returns the most recent "sent" draft for a kitchen (awaiting management action), or null if none exists. */
export async function fetchPendingDraft(client: AnyClient, _ctx: UserContext, input: FetchPendingDraft) {
	const { data: draft, error } = await client
		.from("kitchen_ata_draft")
		.select(DRAFT_WITH_SELECTIONS)
		.eq("kitchen_id", input.kitchenId)
		.eq("status", "sent")
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle()

	if (error) throw new DomainError("FETCH_FAILED", `Erro ao buscar rascunho pendente: ${error.message}`)
	return draft
}

/** Creates a draft with status "pending" and inserts its template selections. Rolls back the draft on selection failure. */
export async function createKitchenDraft(client: AnyClient, _ctx: UserContext, input: CreateKitchenDraft) {
	const { data: draft, error: draftError } = await client
		.from("kitchen_ata_draft")
		.insert({
			kitchen_id: input.kitchenId,
			title: input.title,
			notes: input.notes || null,
			status: "pending",
		})
		.select()
		.single()

	if (draftError) throw new DomainError("INSERT_FAILED", `Erro ao criar rascunho: ${draftError.message}`)

	if (input.selections.length > 0) {
		const rows = input.selections.map((s) => ({
			draft_id: draft.id,
			template_id: s.templateId,
			repetitions: s.repetitions,
		}))
		const { error: selError } = await client.from("kitchen_ata_draft_selection").insert(rows)
		if (selError) {
			await client.from("kitchen_ata_draft").delete().eq("id", draft.id)
			throw new DomainError("INSERT_FAILED", `Erro ao salvar seleções do rascunho: ${selError.message}`)
		}
	}

	return draft
}

/**
 * Updates draft metadata and optionally replaces all selections (delete-all + re-insert).
 * selections=undefined → metadata-only update, existing selections untouched.
 */
export async function updateKitchenDraft(client: AnyClient, _ctx: UserContext, input: UpdateKitchenDraft) {
	const { data: draft, error } = await client
		.from("kitchen_ata_draft")
		.update({ ...input.updates, updated_at: new Date().toISOString() })
		.eq("id", input.draftId)
		.select()
		.single()

	if (error) throw new DomainError("UPDATE_FAILED", `Erro ao atualizar rascunho: ${error.message}`)

	if (input.selections !== undefined) {
		await client.from("kitchen_ata_draft_selection").delete().eq("draft_id", input.draftId)

		if (input.selections.length > 0) {
			const rows = input.selections.map((s) => ({
				draft_id: input.draftId,
				template_id: s.templateId,
				repetitions: s.repetitions,
			}))
			const { error: selError } = await client.from("kitchen_ata_draft_selection").insert(rows)
			if (selError) throw new DomainError("UPDATE_FAILED", `Erro ao atualizar seleções: ${selError.message}`)
		}
	}

	return draft
}

/** Transitions a draft from "pending" to "sent", making it visible to management. */
export async function sendKitchenDraft(client: AnyClient, _ctx: UserContext, input: SendKitchenDraft) {
	const { error } = await client.from("kitchen_ata_draft").update({ status: "sent", updated_at: new Date().toISOString() }).eq("id", input.draftId)
	if (error) throw new DomainError("UPDATE_FAILED", `Erro ao enviar rascunho: ${error.message}`)
}

/** Hard-deletes a draft and its selections (cascade via FK). Only pending drafts should be deleted. */
export async function deleteKitchenDraft(client: AnyClient, _ctx: UserContext, input: DeleteKitchenDraft) {
	const { error } = await client.from("kitchen_ata_draft").delete().eq("id", input.draftId)
	if (error) throw new DomainError("DELETE_FAILED", `Erro ao deletar rascunho: ${error.message}`)
}
