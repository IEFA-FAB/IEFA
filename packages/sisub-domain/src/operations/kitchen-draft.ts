/**
 * Kitchen ATA draft operations: pending → sent status lifecycle for
 * kitchen-to-management procurement requests. Drizzle query layer.
 *
 * Auth: leituras seguem sem guard PBAC; ESCRITA exige `kitchen:2` na cozinha dona do rascunho,
 * resolvida do banco quando a operação recebe só o id (`authorizeDraft`).
 *
 * Status: "pending" (editable by kitchen) → "sent". Mensagens de erro especiais
 * (`Erro ao ...: message`) preservadas (prefixo + mensagem do driver).
 */

import { kitchenAtaDraftInProcurement, kitchenAtaDraftSelectionInProcurement, type SisubDb } from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { desc, eq } from "drizzle-orm"
import { requireKitchen } from "../guards/require-permission.ts"
import type {
	CreateKitchenDraft,
	DeleteKitchenDraft,
	FetchKitchenDrafts,
	FetchPendingDraft,
	SendKitchenDraft,
	UpdateKitchenDraft,
} from "../schemas/procurement.ts"
import type { UserContext } from "../types/context.ts"
import { NotFoundError } from "../types/errors.ts"
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
/**
 * Autoriza pela cozinha DONA do rascunho, lida da linha.
 *
 * A entrada dessas operações traz só o `draftId` — sem resolver o dono, qualquer detentor de
 * `kitchen:2` em uma cozinha editava, enviava ou apagava o rascunho de ATA de outra.
 */
async function authorizeDraft(db: SisubDb, ctx: UserContext, draftId: string): Promise<void> {
	const [row] = await runQuery("FETCH_FAILED", () =>
		db
			.select({ kitchenId: kitchenAtaDraftInProcurement.kitchenId })
			.from(kitchenAtaDraftInProcurement)
			.where(eq(kitchenAtaDraftInProcurement.id, draftId))
			.limit(1)
	)
	if (!row?.kitchenId) throw new NotFoundError("kitchen_ata_draft", draftId)
	requireKitchen(ctx, 2, row.kitchenId)
}

export async function createKitchenDraft(db: SisubDb, ctx: UserContext, input: CreateKitchenDraft) {
	requireKitchen(ctx, 2, input.kitchenId)

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
export async function updateKitchenDraft(db: SisubDb, ctx: UserContext, input: UpdateKitchenDraft) {
	await authorizeDraft(db, ctx, input.draftId)

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
export async function sendKitchenDraft(db: SisubDb, ctx: UserContext, input: SendKitchenDraft) {
	await authorizeDraft(db, ctx, input.draftId)

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
export async function deleteKitchenDraft(db: SisubDb, ctx: UserContext, input: DeleteKitchenDraft) {
	await authorizeDraft(db, ctx, input.draftId)

	await mutateOrFail(
		"DELETE_FAILED",
		`Erro ao deletar rascunho: rascunho ${input.draftId} não encontrado`,
		() => db.delete(kitchenAtaDraftInProcurement).where(eq(kitchenAtaDraftInProcurement.id, input.draftId)).returning({ id: kitchenAtaDraftInProcurement.id }),
		{ prefix: "Erro ao deletar rascunho" }
	)
}
