/**
 * Kitchen ATA draft operations: pending → sent status lifecycle for
 * kitchen-to-management procurement requests. Drizzle query layer.
 *
 * Auth posture preserved from the original server functions: reads have no PBAC
 * guard; mutations were authenticated-only (no module-level guard). The thin
 * wrappers call requireAuth() and pass ctx; ops do not use it.
 *
 * Status: "pending" (editable by kitchen) → "sent". Mensagens de erro especiais
 * (`Erro ao ...: message`) preservadas (prefixo + mensagem do driver).
 */

import { kitchenAtaDraftInProcurement, kitchenAtaDraftSelectionInProcurement, type SisubDb } from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { desc, eq } from "drizzle-orm"
import type {
	CreateKitchenDraft,
	DeleteKitchenDraft,
	FetchKitchenDrafts,
	FetchPendingDraft,
	SendKitchenDraft,
	UpdateKitchenDraft,
} from "../schemas/procurement.ts"
import type { UserContext } from "../types/context.ts"
import { insertOneOrFail, mutateOrFail, runQuery, toColumns, toWire } from "../utils/index.ts"

type Draft = Tables<"kitchen_ata_draft">
type DraftTemplateRef = { id: string; name: string; template_type: string }
type DraftSelectionWire = Tables<"kitchen_ata_draft_selection"> & { template: DraftTemplateRef | null }
type DraftWithSelections = Draft & { selections: DraftSelectionWire[] }

const DRAFT_RELATIONS: Record<string, string> = { kitchenAtaDraftSelectionInProcurements: "selections", menuTemplateInKitchen: "template" }

// draft → selections[] → template{id,name,template_type}
const DRAFT_WITH = {
	kitchenAtaDraftSelectionInProcurements: { with: { menuTemplateInKitchen: { columns: { id: true, name: true, templateType: true } } } },
} as const

/** Lists all drafts for a kitchen with their template selections, ordered by creation date descending. */
export async function fetchKitchenDrafts(db: SisubDb, _ctx: UserContext, input: FetchKitchenDrafts) {
	const drafts = await runQuery(
		"FETCH_FAILED",
		() =>
			db.query.kitchenAtaDraftInProcurement.findMany({
				with: DRAFT_WITH,
				where: eq(kitchenAtaDraftInProcurement.kitchenId, input.kitchenId),
				orderBy: (draft) => [desc(draft.createdAt)],
			}),
		{ prefix: "Erro ao buscar rascunhos" }
	)
	return drafts.map((d) => toWire<DraftWithSelections>(d, DRAFT_RELATIONS))
}

/** Returns the most recent "sent" draft for a kitchen (awaiting management action), or null if none exists. */
export async function fetchPendingDraft(db: SisubDb, _ctx: UserContext, input: FetchPendingDraft) {
	const draft = await runQuery(
		"FETCH_FAILED",
		() =>
			db.query.kitchenAtaDraftInProcurement.findFirst({
				with: DRAFT_WITH,
				where: (d, { and }) => and(eq(d.kitchenId, input.kitchenId), eq(d.status, "sent")),
				orderBy: (d) => [desc(d.createdAt)],
			}),
		{ prefix: "Erro ao buscar rascunho pendente" }
	)
	return draft ? toWire<DraftWithSelections>(draft, DRAFT_RELATIONS) : null
}

/** Creates a draft with status "pending" and inserts its template selections (atômico). */
export async function createKitchenDraft(db: SisubDb, _ctx: UserContext, input: CreateKitchenDraft) {
	const draft = await db.transaction(async (tx) => {
		const inserted = await insertOneOrFail(
			"INSERT_FAILED",
			"Erro ao criar rascunho: no row returned",
			() =>
				tx
					.insert(kitchenAtaDraftInProcurement)
					.values({ kitchenId: input.kitchenId, title: input.title, notes: input.notes || null, status: "pending" })
					.returning(),
			{ prefix: "Erro ao criar rascunho" }
		)

		if (input.selections.length > 0) {
			const rows = input.selections.map((s) => ({ draftId: inserted.id, templateId: s.templateId, repetitions: s.repetitions }))
			await runQuery("INSERT_FAILED", () => tx.insert(kitchenAtaDraftSelectionInProcurement).values(rows), { prefix: "Erro ao salvar seleções do rascunho" })
		}
		return inserted
	})
	return toWire<Draft>(draft)
}

/**
 * Updates draft metadata and optionally replaces all selections (delete-all + re-insert, atômico).
 * selections=undefined → metadata-only update, existing selections untouched.
 */
export async function updateKitchenDraft(db: SisubDb, _ctx: UserContext, input: UpdateKitchenDraft) {
	const draft = await db.transaction(async (tx) => {
		const set = { ...toColumns(input.updates), updatedAt: new Date().toISOString() } as Partial<typeof kitchenAtaDraftInProcurement.$inferInsert>
		const updated = await insertOneOrFail(
			"UPDATE_FAILED",
			`Erro ao atualizar rascunho: rascunho ${input.draftId} não encontrado`,
			() => tx.update(kitchenAtaDraftInProcurement).set(set).where(eq(kitchenAtaDraftInProcurement.id, input.draftId)).returning(),
			{ prefix: "Erro ao atualizar rascunho" }
		)

		if (input.selections !== undefined) {
			await tx.delete(kitchenAtaDraftSelectionInProcurement).where(eq(kitchenAtaDraftSelectionInProcurement.draftId, input.draftId))
			if (input.selections.length > 0) {
				const rows = input.selections.map((s) => ({ draftId: input.draftId, templateId: s.templateId, repetitions: s.repetitions }))
				await runQuery("UPDATE_FAILED", () => tx.insert(kitchenAtaDraftSelectionInProcurement).values(rows), { prefix: "Erro ao atualizar seleções" })
			}
		}
		return updated
	})
	return toWire<Draft>(draft)
}

/** Transitions a draft from "pending" to "sent", making it visible to management. */
export async function sendKitchenDraft(db: SisubDb, _ctx: UserContext, input: SendKitchenDraft) {
	await mutateOrFail(
		"UPDATE_FAILED",
		`Erro ao enviar rascunho: rascunho ${input.draftId} não encontrado`,
		() =>
			db
				.update(kitchenAtaDraftInProcurement)
				.set({ status: "sent", updatedAt: new Date().toISOString() })
				.where(eq(kitchenAtaDraftInProcurement.id, input.draftId))
				.returning({ id: kitchenAtaDraftInProcurement.id }),
		{ prefix: "Erro ao enviar rascunho" }
	)
}

/** Hard-deletes a draft and its selections (cascade via FK). Only pending drafts should be deleted. */
export async function deleteKitchenDraft(db: SisubDb, _ctx: UserContext, input: DeleteKitchenDraft) {
	await mutateOrFail(
		"DELETE_FAILED",
		`Erro ao deletar rascunho: rascunho ${input.draftId} não encontrado`,
		() => db.delete(kitchenAtaDraftInProcurement).where(eq(kitchenAtaDraftInProcurement.id, input.draftId)).returning({ id: kitchenAtaDraftInProcurement.id }),
		{ prefix: "Erro ao deletar rascunho" }
	)
}
