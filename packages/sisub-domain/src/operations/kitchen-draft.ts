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

import {
	kitchenDemandForecastImportInProcurement,
	kitchenDemandForecastInProcurement,
	kitchenDemandForecastSelectionInProcurement,
	kitchenInKitchen,
	menuTemplateInKitchen,
	procurementListInProcurement,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, desc, eq, inArray } from "drizzle-orm"
import { kitchenBelongsToUnit, requireKitchenOrItsUnit } from "../guards/kitchen-unit.ts"
import { requireKitchen, requireUnit } from "../guards/require-permission.ts"
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

type Draft = Tables<"kitchen_demand_forecast">
type DraftTemplateRef = { id: string; name: string; template_type: string }
type DraftSelectionWire = Tables<"kitchen_demand_forecast_selection"> & { template: DraftTemplateRef | null }
/** Anexo quantitativo em que a previsão entrou (uma previsão serve a várias contratações). */
export type DraftImportWire = { list_id: string; title: string; imported_at: string }
type DraftWithSelections = Draft & { selections: DraftSelectionWire[]; imports: DraftImportWire[] }

const DRAFT_RELATIONS: Record<string, string> = { kitchenDemandForecastSelectionInProcurements: "selections", menuTemplateInKitchen: "template" }

type DraftRow = typeof kitchenDemandForecastInProcurement.$inferSelect

/**
 * Pendura seleções → template nos rascunhos em queries SEPARADAS, juntadas em JS.
 *
 * A relational query aninhada (rascunho → seleções → template) gerava o alias
 * `kitchenAtaDraftInProcurement_kitchenAtaDraftSelectionInProcurements` (69 chars, com os nomes de antes do rename 20260927010000): o Postgres
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
				.from(kitchenDemandForecastSelectionInProcurement)
				.where(
					inArray(
						kitchenDemandForecastSelectionInProcurement.forecastId,
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
	const imports = await runQuery(
		"FETCH_FAILED",
		() =>
			db
				.select({
					forecastId: kitchenDemandForecastImportInProcurement.forecastId,
					listId: kitchenDemandForecastImportInProcurement.listId,
					title: procurementListInProcurement.title,
					importedAt: kitchenDemandForecastImportInProcurement.importedAt,
				})
				.from(kitchenDemandForecastImportInProcurement)
				.innerJoin(procurementListInProcurement, eq(procurementListInProcurement.id, kitchenDemandForecastImportInProcurement.listId))
				.where(
					inArray(
						kitchenDemandForecastImportInProcurement.forecastId,
						drafts.map((d) => d.id)
					)
				)
				.orderBy(desc(kitchenDemandForecastImportInProcurement.importedAt)),
		{ prefix }
	)
	return drafts.map((d) => ({
		...toWire<Omit<DraftWithSelections, "imports">>(
			{
				...d,
				kitchenDemandForecastSelectionInProcurements: selections
					.filter((s) => s.forecastId === d.id)
					.map((s) => ({ ...s, menuTemplateInKitchen: templateById.get(s.templateId) ?? null })),
			},
			DRAFT_RELATIONS
		),
		imports: imports.filter((i) => i.forecastId === d.id).map((i) => ({ list_id: i.listId, title: i.title, imported_at: i.importedAt })),
	}))
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
				.from(kitchenDemandForecastInProcurement)
				.where(eq(kitchenDemandForecastInProcurement.kitchenId, input.kitchenId))
				.orderBy(desc(kitchenDemandForecastInProcurement.createdAt)),
		{ prefix }
	)
	return attachSelections(db, drafts, prefix)
}

/**
 * A previsão mais recente enviada pela cozinha: `sent` ou já `reviewed`. Recebida pela unidade
 * num anexo, ela continua disponível para os anexos das outras contratações (cada importação
 * fica em `imports`).
 */
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
				.from(kitchenDemandForecastInProcurement)
				.where(and(eq(kitchenDemandForecastInProcurement.kitchenId, input.kitchenId), inArray(kitchenDemandForecastInProcurement.status, ["sent", "reviewed"])))
				.orderBy(desc(kitchenDemandForecastInProcurement.createdAt))
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
			.select({ kitchenId: kitchenDemandForecastInProcurement.kitchenId })
			.from(kitchenDemandForecastInProcurement)
			.where(eq(kitchenDemandForecastInProcurement.id, draftId))
			.limit(1)
	)
	if (!row?.kitchenId) throw new NotFoundError("previsão de demanda", draftId)
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
					.insert(kitchenDemandForecastInProcurement)
					.values({ kitchenId: input.kitchenId, title: input.title, notes: input.notes || null, status: "pending" })
					.returning(),
			{ prefix: "Erro ao criar previsão de demanda" }
		)

		if (input.selections.length > 0) {
			const rows = input.selections.map((s) => ({ forecastId: inserted.id, templateId: s.templateId, repetitions: s.repetitions }))
			await runQuery("INSERT_FAILED", () => tx.insert(kitchenDemandForecastSelectionInProcurement).values(rows), {
				prefix: "Erro ao salvar seleções da previsão de demanda",
			})
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
		const set = { ...toColumns(input.updates), updatedAt: new Date().toISOString() } as Partial<typeof kitchenDemandForecastInProcurement.$inferInsert>
		const updated = await insertOneOrFail(
			"UPDATE_FAILED",
			`Erro ao atualizar rascunho: rascunho ${input.draftId} não encontrado`,
			() => tx.update(kitchenDemandForecastInProcurement).set(set).where(eq(kitchenDemandForecastInProcurement.id, input.draftId)).returning(),
			{ prefix: "Erro ao atualizar previsão de demanda" }
		)

		if (input.selections !== undefined) {
			await tx.delete(kitchenDemandForecastSelectionInProcurement).where(eq(kitchenDemandForecastSelectionInProcurement.forecastId, input.draftId))
			if (input.selections.length > 0) {
				const rows = input.selections.map((s) => ({ forecastId: input.draftId, templateId: s.templateId, repetitions: s.repetitions }))
				await runQuery("UPDATE_FAILED", () => tx.insert(kitchenDemandForecastSelectionInProcurement).values(rows), { prefix: "Erro ao atualizar seleções" })
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
				.update(kitchenDemandForecastInProcurement)
				.set({ status: "sent", updatedAt: new Date().toISOString() })
				.where(eq(kitchenDemandForecastInProcurement.id, input.draftId))
				.returning({ id: kitchenDemandForecastInProcurement.id }),
		{ prefix: "Erro ao enviar previsão de demanda" }
	)
}

/** Hard-deletes a draft and its selections (cascade via FK). Only pending drafts should be deleted. */
export async function deleteKitchenDraft(db: SisubDb, ctx: UserContext, input: DeleteKitchenDraft) {
	await authorizeDraft(db, ctx, input.draftId)

	await mutateOrFail(
		"DELETE_FAILED",
		`Erro ao deletar rascunho: rascunho ${input.draftId} não encontrado`,
		() =>
			db
				.delete(kitchenDemandForecastInProcurement)
				.where(eq(kitchenDemandForecastInProcurement.id, input.draftId))
				.returning({ id: kitchenDemandForecastInProcurement.id }),
		{ prefix: "Erro ao remover previsão de demanda" }
	)
}

/**
 * A unidade importou a previsão da cozinha num anexo: registra a importação e, na primeira,
 * marca a previsão como recebida (`reviewed`) com data e autor — é o retorno que a nutricionista
 * vê. Exige `unit:2` na OM dona do anexo, e a cozinha da previsão precisa ser dessa OM.
 */
export async function recordKitchenDraftImport(db: SisubDb, ctx: UserContext, input: { draftId: string; listId: string }): Promise<void> {
	const [list] = await runQuery("FETCH_FAILED", () =>
		db
			.select({ unitId: procurementListInProcurement.unitId })
			.from(procurementListInProcurement)
			.where(eq(procurementListInProcurement.id, input.listId))
			.limit(1)
	)
	if (!list) throw new NotFoundError("anexo quantitativo", input.listId)
	requireUnit(ctx, 2, list.unitId)

	const [draft] = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				status: kitchenDemandForecastInProcurement.status,
				unitId: kitchenInKitchen.unitId,
				purchaseUnitId: kitchenInKitchen.purchaseUnitId,
			})
			.from(kitchenDemandForecastInProcurement)
			.innerJoin(kitchenInKitchen, eq(kitchenInKitchen.id, kitchenDemandForecastInProcurement.kitchenId))
			.where(eq(kitchenDemandForecastInProcurement.id, input.draftId))
			.limit(1)
	)
	if (!draft) throw new NotFoundError("previsão de demanda", input.draftId)
	if (!kitchenBelongsToUnit({ id: 0, unitId: draft.unitId, purchaseUnitId: draft.purchaseUnitId }, list.unitId)) {
		throw new DomainError("KITCHEN_NOT_IN_UNIT", "A previsão é de uma cozinha de outra OM.")
	}
	if (draft.status === "pending") throw new DomainError("DRAFT_NOT_SENT", "A cozinha ainda não enviou esta previsão.")

	await runQuery(
		"TRANSACTION_FAILED",
		() =>
			db.transaction(async (tx) => {
				await tx
					.insert(kitchenDemandForecastImportInProcurement)
					.values({ forecastId: input.draftId, listId: input.listId, importedBy: ctx.userId })
					.onConflictDoNothing({ target: [kitchenDemandForecastImportInProcurement.forecastId, kitchenDemandForecastImportInProcurement.listId] })
				if (draft.status === "sent") {
					const now = new Date().toISOString()
					await tx
						.update(kitchenDemandForecastInProcurement)
						// Sem tocar updated_at: ele é a data da cozinha (edição, envio). Carimbar aqui
						// reordenava as previsões e fazia uma antiga parecer "atualizada".
						.set({ status: "reviewed", reviewedAt: now, reviewedBy: ctx.userId })
						.where(and(eq(kitchenDemandForecastInProcurement.id, input.draftId), eq(kitchenDemandForecastInProcurement.status, "sent")))
				}
			}),
		{ prefix: "Erro ao registrar a importação da previsão" }
	)
}
