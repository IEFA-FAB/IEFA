/**
 * Kitchen ATA draft operations: pending → sent status lifecycle for
 * kitchen-to-management procurement requests. Drizzle query layer.
 *
 * Auth: LEITURA exige `kitchen:1` na cozinha OU `unit:1` numa OM dela (a gestão lê o rascunho
 * enviado no wizard da ATA) — ver `requireKitchenOrItsUnit`. ESCRITA exige `kitchen:2` na
 * cozinha dona do rascunho, resolvida do banco quando a operação recebe só o id
 * (`authorizeDraft`), e os planos citados precisam ser da própria cozinha ou globais.
 *
 * Status: "pending" (editable by kitchen) → "sent". Mensagens de erro especiais
 * (`Erro ao ...: message`) preservadas (prefixo + mensagem do driver).
 */

import { kitchenAtaDraftInProcurement, kitchenAtaDraftSelectionInProcurement, menuTemplateInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, desc, eq, inArray } from "drizzle-orm"
import { requireKitchenOrItsUnit } from "../guards/kitchen-unit.ts"
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
import { DomainError, NotFoundError } from "../types/errors.ts"
import { insertOneOrFail, mutateOrFail, runQuery, toColumns, toWire } from "../utils/index.ts"

type Draft = Tables<"kitchen_ata_draft">
type DraftTemplateRef = { id: string; name: string; template_type: string }
type DraftSelectionWire = Tables<"kitchen_ata_draft_selection"> & { template: DraftTemplateRef | null }
type DraftWithSelections = Draft & { selections: DraftSelectionWire[] }

const DRAFT_RELATIONS: Record<string, string> = { kitchenAtaDraftSelectionInProcurements: "selections", menuTemplateInKitchen: "template" }

type DraftRow = typeof kitchenAtaDraftInProcurement.$inferSelect

/**
 * Pendura seleções → template nos rascunhos em queries SEPARADAS, juntadas em JS.
 *
 * A relational query aninhada (rascunho → seleções → template) gerava o alias
 * `kitchenAtaDraftInProcurement_kitchenAtaDraftSelectionInProcurements` (69 chars): o Postgres
 * trunca em NAMEDATALEN (63) e o SQL emitido segue citando o nome inteiro → 42703 `column
 * ....template_id does not exist`. Toda leitura de rascunho quebrava — inclusive o aviso de
 * rascunho pendente no wizard da ATA. É o mesmo bug que `fetchAtaDetails` já contornava.
 * Chaves iguais às da relational query, para `DRAFT_RELATIONS` mapear o contrato de wire.
 */
async function attachSelections(db: SisubDb, drafts: DraftRow[], prefix: string): Promise<DraftWithSelections[]> {
	if (drafts.length === 0) return []
	const selections = await runQuery(
		"FETCH_FAILED",
		() =>
			db
				.select()
				.from(kitchenAtaDraftSelectionInProcurement)
				.where(
					inArray(
						kitchenAtaDraftSelectionInProcurement.draftId,
						drafts.map((d) => d.id)
					)
				),
		{ prefix }
	)
	const templateIds = [...new Set(selections.map((s) => s.templateId))]
	const templates =
		templateIds.length > 0
			? await runQuery(
					"FETCH_FAILED",
					() =>
						db
							.select({ id: menuTemplateInKitchen.id, name: menuTemplateInKitchen.name, templateType: menuTemplateInKitchen.templateType })
							.from(menuTemplateInKitchen)
							.where(inArray(menuTemplateInKitchen.id, templateIds)),
					{ prefix }
				)
			: []
	const templateById = new Map(templates.map((t) => [t.id, t]))
	return drafts.map((d) =>
		toWire<DraftWithSelections>(
			{
				...d,
				kitchenAtaDraftSelectionInProcurements: selections
					.filter((s) => s.draftId === d.id)
					.map((s) => ({ ...s, menuTemplateInKitchen: templateById.get(s.templateId) ?? null })),
			},
			DRAFT_RELATIONS
		)
	)
}

/** Lists all drafts for a kitchen with their template selections, ordered by creation date descending. */
export async function fetchKitchenDrafts(db: SisubDb, ctx: UserContext, input: FetchKitchenDrafts) {
	await requireKitchenOrItsUnit(db, ctx, 1, input.kitchenId)
	const prefix = "Erro ao buscar rascunhos"
	const drafts = await runQuery(
		"FETCH_FAILED",
		() =>
			db
				.select()
				.from(kitchenAtaDraftInProcurement)
				.where(eq(kitchenAtaDraftInProcurement.kitchenId, input.kitchenId))
				.orderBy(desc(kitchenAtaDraftInProcurement.createdAt)),
		{ prefix }
	)
	return attachSelections(db, drafts, prefix)
}

/** Returns the most recent "sent" draft for a kitchen (awaiting management action), or null if none exists. */
export async function fetchPendingDraft(db: SisubDb, ctx: UserContext, input: FetchPendingDraft) {
	// O wizard da ATA chama isto para CADA cozinha da OM: quem compõe a ata é a gestão da
	// unidade, que não precisa ter a cozinha.
	await requireKitchenOrItsUnit(db, ctx, 1, input.kitchenId)
	const prefix = "Erro ao buscar rascunho pendente"
	const drafts = await runQuery(
		"FETCH_FAILED",
		() =>
			db
				.select()
				.from(kitchenAtaDraftInProcurement)
				.where(and(eq(kitchenAtaDraftInProcurement.kitchenId, input.kitchenId), eq(kitchenAtaDraftInProcurement.status, "sent")))
				.orderBy(desc(kitchenAtaDraftInProcurement.createdAt))
				.limit(1),
		{ prefix }
	)
	const [draft] = await attachSelections(db, drafts, prefix)
	return draft ?? null
}

/** Creates a draft with status "pending" and inserts its template selections (atômico). */
/**
 * Autoriza pela cozinha DONA do rascunho, lida da linha.
 *
 * A entrada dessas operações traz só o `draftId` — sem resolver o dono, qualquer detentor de
 * `kitchen:2` em uma cozinha editava, enviava ou apagava o rascunho de ATA de outra.
 */
async function authorizeDraft(db: SisubDb, ctx: UserContext, draftId: string): Promise<number> {
	const [row] = await runQuery("FETCH_FAILED", () =>
		db
			.select({ kitchenId: kitchenAtaDraftInProcurement.kitchenId })
			.from(kitchenAtaDraftInProcurement)
			.where(eq(kitchenAtaDraftInProcurement.id, draftId))
			.limit(1)
	)
	if (!row?.kitchenId) throw new NotFoundError("kitchen_ata_draft", draftId)
	requireKitchen(ctx, 2, row.kitchenId)
	return row.kitchenId
}

/**
 * Os planos citados no rascunho são da própria cozinha ou globais. O guard da cozinha prova
 * só a cozinha; o `templateId` vinha do corpo, e um rascunho enviado à OM levava o plano
 * LOCAL de outra cozinha — que o wizard da ATA depois abria e calculava.
 */
async function assertTemplatesOfKitchen(db: SisubDb, kitchenId: number, templateIds: readonly string[]): Promise<void> {
	const ids = [...new Set(templateIds)]
	if (ids.length === 0) return
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: menuTemplateInKitchen.id, kitchenId: menuTemplateInKitchen.kitchenId })
			.from(menuTemplateInKitchen)
			.where(inArray(menuTemplateInKitchen.id, ids))
	)
	const ownerById = new Map(rows.map((r) => [r.id, r.kitchenId]))
	const foreign = ids.filter((id) => !ownerById.has(id) || (ownerById.get(id) != null && ownerById.get(id) !== kitchenId))
	if (foreign.length > 0) {
		throw new DomainError("TEMPLATE_ACCESS_DENIED", `Plano(s) de cardápio que não são desta cozinha nem globais: ${foreign.join(", ")}`)
	}
}

export async function createKitchenDraft(db: SisubDb, ctx: UserContext, input: CreateKitchenDraft) {
	requireKitchen(ctx, 2, input.kitchenId)
	await assertTemplatesOfKitchen(
		db,
		input.kitchenId,
		input.selections.map((s) => s.templateId)
	)

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
	const kitchenId = await authorizeDraft(db, ctx, input.draftId)
	if (input.selections !== undefined) {
		await assertTemplatesOfKitchen(
			db,
			kitchenId,
			input.selections.map((s) => s.templateId)
		)
	}

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
