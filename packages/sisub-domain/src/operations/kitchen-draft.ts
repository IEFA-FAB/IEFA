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

import { kitchenAtaDraftInSisub, kitchenAtaDraftSelectionInSisub, type SisubDb } from "@iefa/database/drizzle/sisub"
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
import { DomainError } from "../types/errors.ts"
import { toColumns, toWire } from "../utils/index.ts"

type Draft = Tables<"kitchen_ata_draft">
type DraftTemplateRef = { id: string; name: string; template_type: string }
type DraftSelectionWire = Tables<"kitchen_ata_draft_selection"> & { template: DraftTemplateRef | null }
type DraftWithSelections = Draft & { selections: DraftSelectionWire[] }

const DRAFT_RELATIONS: Record<string, string> = { kitchenAtaDraftSelectionInSisubs: "selections", menuTemplateInSisub: "template" }

// draft → selections[] → template{id,name,template_type}
const DRAFT_WITH = {
	kitchenAtaDraftSelectionInSisubs: { with: { menuTemplateInSisub: { columns: { id: true, name: true, templateType: true } } } },
} as const

/** Erro de domínio com o prefixo verbatim do original + mensagem do driver; preserva DomainError. */
async function draftOp<T>(code: string, prefix: string, op: () => Promise<T>): Promise<T> {
	try {
		return await op()
	} catch (e) {
		if (e instanceof DomainError) throw e
		throw new DomainError(code, `${prefix}: ${e instanceof Error ? e.message : String(e)}`)
	}
}

/** Lists all drafts for a kitchen with their template selections, ordered by creation date descending. */
export async function fetchKitchenDrafts(db: SisubDb, _ctx: UserContext, input: FetchKitchenDrafts) {
	const drafts = await draftOp("FETCH_FAILED", "Erro ao buscar rascunhos", () =>
		db.query.kitchenAtaDraftInSisub.findMany({
			with: DRAFT_WITH,
			where: eq(kitchenAtaDraftInSisub.kitchenId, input.kitchenId),
			orderBy: (draft) => [desc(draft.createdAt)],
		})
	)
	return drafts.map((d) => toWire<DraftWithSelections>(d, DRAFT_RELATIONS))
}

/** Returns the most recent "sent" draft for a kitchen (awaiting management action), or null if none exists. */
export async function fetchPendingDraft(db: SisubDb, _ctx: UserContext, input: FetchPendingDraft) {
	const draft = await draftOp("FETCH_FAILED", "Erro ao buscar rascunho pendente", () =>
		db.query.kitchenAtaDraftInSisub.findFirst({
			with: DRAFT_WITH,
			where: (d, { and }) => and(eq(d.kitchenId, input.kitchenId), eq(d.status, "sent")),
			orderBy: (d) => [desc(d.createdAt)],
		})
	)
	return draft ? toWire<DraftWithSelections>(draft, DRAFT_RELATIONS) : null
}

/** Creates a draft with status "pending" and inserts its template selections (atômico). */
export async function createKitchenDraft(db: SisubDb, _ctx: UserContext, input: CreateKitchenDraft) {
	const draft = await db.transaction(async (tx) => {
		const [inserted] = await draftOp("INSERT_FAILED", "Erro ao criar rascunho", () =>
			tx
				.insert(kitchenAtaDraftInSisub)
				.values({ kitchenId: input.kitchenId, title: input.title, notes: input.notes || null, status: "pending" })
				.returning()
		)
		if (!inserted) throw new DomainError("INSERT_FAILED", "Erro ao criar rascunho: no row returned")

		if (input.selections.length > 0) {
			const rows = input.selections.map((s) => ({ draftId: inserted.id, templateId: s.templateId, repetitions: s.repetitions }))
			await draftOp("INSERT_FAILED", "Erro ao salvar seleções do rascunho", () => tx.insert(kitchenAtaDraftSelectionInSisub).values(rows))
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
		const set = { ...toColumns(input.updates), updatedAt: new Date().toISOString() } as Partial<typeof kitchenAtaDraftInSisub.$inferInsert>
		const [updated] = await draftOp("UPDATE_FAILED", "Erro ao atualizar rascunho", () =>
			tx.update(kitchenAtaDraftInSisub).set(set).where(eq(kitchenAtaDraftInSisub.id, input.draftId)).returning()
		)
		if (!updated) throw new DomainError("UPDATE_FAILED", `Erro ao atualizar rascunho: rascunho ${input.draftId} não encontrado`)

		if (input.selections !== undefined) {
			await tx.delete(kitchenAtaDraftSelectionInSisub).where(eq(kitchenAtaDraftSelectionInSisub.draftId, input.draftId))
			if (input.selections.length > 0) {
				const rows = input.selections.map((s) => ({ draftId: input.draftId, templateId: s.templateId, repetitions: s.repetitions }))
				await draftOp("UPDATE_FAILED", "Erro ao atualizar seleções", () => tx.insert(kitchenAtaDraftSelectionInSisub).values(rows))
			}
		}
		return updated
	})
	return toWire<Draft>(draft)
}

/** Transitions a draft from "pending" to "sent", making it visible to management. */
export async function sendKitchenDraft(db: SisubDb, _ctx: UserContext, input: SendKitchenDraft) {
	const sent = await draftOp("UPDATE_FAILED", "Erro ao enviar rascunho", () =>
		db
			.update(kitchenAtaDraftInSisub)
			.set({ status: "sent", updatedAt: new Date().toISOString() })
			.where(eq(kitchenAtaDraftInSisub.id, input.draftId))
			.returning({ id: kitchenAtaDraftInSisub.id })
	)
	if (sent.length === 0) throw new DomainError("UPDATE_FAILED", `Erro ao enviar rascunho: rascunho ${input.draftId} não encontrado`)
}

/** Hard-deletes a draft and its selections (cascade via FK). Only pending drafts should be deleted. */
export async function deleteKitchenDraft(db: SisubDb, _ctx: UserContext, input: DeleteKitchenDraft) {
	const deleted = await draftOp("DELETE_FAILED", "Erro ao deletar rascunho", () =>
		db.delete(kitchenAtaDraftInSisub).where(eq(kitchenAtaDraftInSisub.id, input.draftId)).returning({ id: kitchenAtaDraftInSisub.id })
	)
	if (deleted.length === 0) throw new DomainError("DELETE_FAILED", `Erro ao deletar rascunho: rascunho ${input.draftId} não encontrado`)
}
