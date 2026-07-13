/**
 * Procurement list (ATA) lifecycle operations: needs calculation, creation,
 * status transitions, soft-delete. Drizzle query layer (migração PostgREST→Drizzle).
 *
 * Auth posture preserved from the original server functions: reads have no PBAC
 * guard; mutations were authenticated-only (no module-level guard). The thin
 * wrappers call requireAuth() and pass ctx; ops do not use it.
 *
 * Contrato de retorno PRESERVADO (snake_case aninhado) via `toWire()`; o Drizzle
 * devolve colunas camelCase e relations com nomes gerados pelo `drizzle-kit pull`.
 *
 * Mensagens de erro especiais (`Erro ao ...: message`) preservadas (prefixo +
 * mensagem do driver). Mutações multi-tabela rodam em `db.transaction` (bug fix
 * vs original PostgREST: falha parcial agora desfaz tudo, sem linhas órfãs).
 *
 * Colunas `numeric` voltam como string no Drizzle (PostgREST devolvia number):
 * escritas embrulham números com `String(...)`; aritmética/agregação lê com `Number(...)`.
 */

import {
	menuTemplateInKitchen,
	menuTemplateItemsInKitchen,
	procurementListInProcurement,
	procurementListItemInProcurement,
	procurementListKitchenInProcurement,
	procurementListSelectionInProcurement,
	procurementListSnapshotComponentInProcurement,
	procurementListSnapshotSelectionInProcurement,
	procurementPesquisaPrecoInProcurement,
	procurementPesquisaPrecoItemInProcurement,
	purchaseItemIngredientInProcurement,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"
import type {
	CalculateAtaNeeds,
	CreateAta,
	CreateAtaDraft,
	DeleteAta,
	DraftItem,
	FetchAtaDetails,
	FetchAtaList,
	FinalizeAtaDraft,
	SaveAtaDraftItems,
	UpdateAtaDraft,
	UpdateAtaItemDescription,
	UpdateAtaItemPrices,
	UpdateAtaStatus,
} from "../schemas/procurement.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import type { ProcurementNeed } from "../types/procurement.ts"
import { insertOneOrFail, mutateOrFail, runQuery, toWire } from "../utils/index.ts"

/** Janela legal padrão de validade da pesquisa de preço (IN SEGES 65/2021). */
const PRICE_RESEARCH_VALIDITY_DAYS = 180

/** Transições de status permitidas da ATA. Publicada e arquivada são terminais quanto a downgrade. */
const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
	draft: ["published", "archived"],
	published: ["archived"],
	archived: [],
}

type TxClient = Parameters<Parameters<SisubDb["transaction"]>[0]>[0]

/** Lê o status atual da lista ou lança se inexistente. */
async function getListStatus(client: SisubDb | TxClient, listId: string): Promise<string> {
	const rows = await client
		.select({ status: procurementListInProcurement.status })
		.from(procurementListInProcurement)
		.where(eq(procurementListInProcurement.id, listId))
	if (!rows[0]) throw new DomainError("NOT_FOUND", `ata ${listId} não encontrada`)
	return rows[0].status
}

/** Barra mutações de composição/quantitativo quando a ATA já saiu do rascunho. */
async function assertDraftEditable(client: SisubDb | TxClient, listId: string): Promise<void> {
	const status = await getListStatus(client, listId)
	if (status !== "draft") {
		throw new DomainError("ATA_NOT_DRAFT", `ATA ${listId} está ${status}: composição e quantitativos são imutáveis após publicação`)
	}
}

type ProcurementList = Tables<"procurement_list">
type ProcurementListItem = Tables<"procurement_list_item">
type ProcurementListKitchen = Tables<"procurement_list_kitchen">
type ProcurementListSelection = Tables<"procurement_list_selection">

type AtaSelectionWire = ProcurementListSelection & { template: { name: string | null; template_type: string } | null }
type AtaKitchenWire = ProcurementListKitchen & { kitchen: { id: number; display_name: string | null } | null; selections: AtaSelectionWire[] }

type AtaSnapshotSelection = {
	template_name: string | null
	template_type: string | null
	kitchen_id: number | null
	kitchen_name: string | null
	repetitions: number
	snapshot_source: string
}
type AtaSnapshotComponent = {
	ingredient_name: string
	folder_description: string | null
	measure_unit: string | null
	total_quantity: string
	purchase_item_description: string | null
	purchase_measure_unit: string | null
	purchase_quantity: string | null
	catmat_item_codigo: number | null
	unit_price: string | null
	snapshot_source: string
}
/** Metadados de integridade computados por request (não persistidos). */
type AtaMeta = {
	is_stale: boolean
	price_research: { oldest_research_at: string | null; validity_days: number; is_expired: boolean }
	snapshot: { selections: AtaSnapshotSelection[]; components: AtaSnapshotComponent[] } | null
}
type AtaWithDetails = ProcurementList & { kitchens: AtaKitchenWire[]; items: ProcurementListItem[]; meta: AtaMeta }

type ItemInsert = typeof procurementListItemInProcurement.$inferInsert

const DETAILS_RELATIONS: Record<string, string> = {
	procurementListSelectionInProcurements: "selections",
	kitchenInCore: "kitchen",
	menuTemplateInKitchen: "template",
}

// ─── Calcular necessidades (sem persistir) ────────────────────────────────────

/**
 * Computes ingredient quantities needed to fulfill a set of menu template selections — read-only, no persistence.
 *
 * Resolves templates → recipes → ingredients; multiplies net_quantity by (headcount / portion_yield × repetitions).
 * Aggregates identical ingredient_ids across all kitchenSelections (weekly + events combined).
 * Translates ingredient → purchase_item via is_default link, then sorts by folder_description → ingredient_name (pt-BR).
 */
export async function calculateAtaNeeds(db: SisubDb, _ctx: UserContext, input: CalculateAtaNeeds): Promise<ProcurementNeed[]> {
	const { kitchenSelections } = input

	// Coletar todas as seleções (weekly + events).
	const allSelections = kitchenSelections.flatMap((ks) => [
		...ks.templateSelections.map((s) => ({ ...s, kitchenId: ks.kitchenId })),
		...ks.eventSelections.map((s) => ({ ...s, kitchenId: ks.kitchenId })),
	])

	if (allSelections.length === 0) return []

	const uniqueTemplateIds = [...new Set(allSelections.map((s) => s.templateId))]

	// Templates com items → recipe → ingredients → ingredient → folder (cozinha pura, sem catmat).
	const templates = await runQuery(
		"QUERY_FAILED",
		() =>
			db.query.menuTemplateInKitchen.findMany({
				columns: { id: true, templateType: true },
				with: {
					menuTemplateItemsInKitchens: {
						columns: { id: true, recipeId: true, headcountOverride: true },
						with: {
							recipesInKitchen: {
								columns: { id: true, portionYield: true },
								with: {
									recipeIngredientsInKitchens: {
										columns: { ingredientId: true, netQuantity: true },
										with: {
											ingredientInKitchen: {
												columns: { id: true, description: true, measureUnit: true, folderId: true },
												with: { folderInKitchen: { columns: { id: true, description: true } } },
											},
										},
									},
								},
							},
						},
					},
				},
				where: inArray(menuTemplateInKitchen.id, uniqueTemplateIds),
			}),
		{ prefix: "Erro ao buscar templates" }
	)

	if (templates.length === 0) return []

	const templateMap = new Map(templates.map((t) => [t.id, t]))

	type NeedAccumulator = {
		ingredient: {
			id: string
			description: string | null
			measure_unit: string | null
			folder_id: string | null
			folder?: { id: string; description: string | null } | null
		}
		total_quantity: number
	}
	const needsMap = new Map<string, NeedAccumulator>()

	for (const selection of allSelections) {
		const template = templateMap.get(selection.templateId)
		if (!template) continue

		for (const item of template.menuTemplateItemsInKitchens) {
			const recipeData = item.recipesInKitchen
			if (!recipeData) continue

			const headcount = item.headcountOverride
			if (!headcount) continue

			const portionYield = Number(recipeData.portionYield ?? 0) || 1
			const portionMultiplier = (headcount / portionYield) * selection.repetitions

			for (const ri of recipeData.recipeIngredientsInKitchens) {
				const ingredientRaw = ri.ingredientInKitchen
				if (!ingredientRaw || !ri.ingredientId) continue

				const ingredient = {
					id: ingredientRaw.id,
					description: ingredientRaw.description,
					measure_unit: ingredientRaw.measureUnit,
					folder_id: ingredientRaw.folderId,
					folder: ingredientRaw.folderInKitchen ? { id: ingredientRaw.folderInKitchen.id, description: ingredientRaw.folderInKitchen.description } : null,
				}

				const quantityNeeded = Number(ri.netQuantity ?? 0) * portionMultiplier

				const existing = needsMap.get(ri.ingredientId)
				if (existing) {
					existing.total_quantity += quantityNeeded
				} else {
					needsMap.set(ri.ingredientId, { ingredient, total_quantity: quantityNeeded })
				}
			}
		}
	}

	// Passo de tradução: ingredient → purchase_item (via is_default link, purchase_item não soft-deleted).
	const ingredientIds = Array.from(needsMap.keys())
	type PurchaseItemLink = {
		purchase_item_id: string
		purchase_item_description: string
		purchase_measure_unit: string | null
		catmat_item_codigo: number | null
		catmat_item_descricao: string | null
		unit_price: number | null
		conversion_factor: number
	}
	const ingredientToPurchaseItem = new Map<string, PurchaseItemLink>()

	if (ingredientIds.length > 0) {
		const piLinks = await runQuery(
			"QUERY_FAILED",
			() =>
				db.query.purchaseItemIngredientInProcurement.findMany({
					columns: { ingredientId: true, conversionFactor: true },
					with: {
						purchaseItemInProcurement: {
							columns: {
								id: true,
								description: true,
								purchaseMeasureUnit: true,
								catmatItemCodigo: true,
								catmatItemDescricao: true,
								unitPrice: true,
								deletedAt: true,
							},
						},
					},
					where: and(inArray(purchaseItemIngredientInProcurement.ingredientId, ingredientIds), eq(purchaseItemIngredientInProcurement.isDefault, true)),
				}),
			{ prefix: "Erro ao buscar itens de compra" }
		)

		for (const link of piLinks) {
			const pi = link.purchaseItemInProcurement
			if (!pi || pi.deletedAt) continue
			ingredientToPurchaseItem.set(link.ingredientId, {
				purchase_item_id: pi.id,
				purchase_item_description: pi.description,
				purchase_measure_unit: pi.purchaseMeasureUnit,
				catmat_item_codigo: pi.catmatItemCodigo,
				catmat_item_descricao: pi.catmatItemDescricao,
				unit_price: pi.unitPrice === null ? null : Number(pi.unitPrice),
				conversion_factor: Number(link.conversionFactor),
			})
		}
	}

	const needs: ProcurementNeed[] = Array.from(needsMap.entries()).map(([ingredientId, d]) => {
		const pi = ingredientToPurchaseItem.get(ingredientId)
		const purchaseQuantity = pi ? Number((d.total_quantity / pi.conversion_factor).toFixed(4)) : null
		return {
			folder_id: d.ingredient.folder_id,
			folder_description: d.ingredient.folder?.description || null,
			ingredient_id: ingredientId,
			ingredient_name: d.ingredient.description || "",
			measure_unit: d.ingredient.measure_unit,
			total_quantity: Number(d.total_quantity.toFixed(4)),
			purchase_item_id: pi?.purchase_item_id ?? null,
			purchase_item_description: pi?.purchase_item_description ?? null,
			purchase_measure_unit: pi?.purchase_measure_unit ?? null,
			purchase_quantity: purchaseQuantity,
			conversion_factor: pi?.conversion_factor ?? null,
			catmat_item_codigo: pi?.catmat_item_codigo ?? null,
			catmat_item_descricao: pi?.catmat_item_descricao ?? null,
			unit_price: pi?.unit_price ?? null,
			item_description: null,
		}
	})

	needs.sort((a, b) => {
		const folderA = a.folder_description || "Sem categoria"
		const folderB = b.folder_description || "Sem categoria"
		if (folderA !== folderB) return folderA.localeCompare(folderB, "pt-BR")
		return a.ingredient_name.localeCompare(b.ingredient_name, "pt-BR")
	})

	return needs
}

// ─── Criar rascunho vazio (wizard step 1) ────────────────────────────────────

export async function createAtaDraft(db: SisubDb, _ctx: UserContext, input: CreateAtaDraft): Promise<{ id: string }> {
	const ata = await insertOneOrFail(
		"INSERT_FAILED",
		"Erro ao criar rascunho: no row returned",
		() =>
			db
				.insert(procurementListInProcurement)
				.values({ unitId: input.unitId, title: "Sem nome", status: "draft", wizardStep: 1 })
				.returning({ id: procurementListInProcurement.id }),
		{ prefix: "Erro ao criar rascunho" }
	)
	return { id: ata.id }
}

// ─── Atualizar metadados e seleções do rascunho ───────────────────────────────

export async function updateAtaDraft(db: SisubDb, _ctx: UserContext, input: UpdateAtaDraft): Promise<void> {
	await db.transaction(async (tx) => {
		const updateData: Partial<typeof procurementListInProcurement.$inferInsert> = { updatedAt: new Date().toISOString() }
		if (input.title !== undefined) updateData.title = input.title
		if (input.notes !== undefined) updateData.notes = input.notes || null
		if (input.wizardStep !== undefined) updateData.wizardStep = input.wizardStep

		// Detecta draft inexistente (deletado mid-session) em vez de no-op silencioso — paridade com updateAtaStatus/deleteAta.
		await mutateOrFail(
			"UPDATE_FAILED",
			`Erro ao atualizar rascunho: rascunho ${input.draftId} não encontrado`,
			() =>
				tx
					.update(procurementListInProcurement)
					.set(updateData)
					.where(eq(procurementListInProcurement.id, input.draftId))
					.returning({ id: procurementListInProcurement.id }),
			{ prefix: "Erro ao atualizar rascunho" }
		)

		if (input.kitchenSelections !== undefined) {
			// Substituição destrutiva (delete-all + re-insert) das cozinhas → seleções cascateiam via FK.
			await tx.delete(procurementListKitchenInProcurement).where(eq(procurementListKitchenInProcurement.listId, input.draftId))

			for (const ks of input.kitchenSelections) {
				const allSels = [...ks.templateSelections, ...ks.eventSelections]
				if (allSels.length === 0) continue

				const ataKitchen = await insertOneOrFail(
					"INSERT_FAILED",
					"Erro ao salvar cozinha: no row returned",
					() =>
						tx
							.insert(procurementListKitchenInProcurement)
							.values({ listId: input.draftId, kitchenId: ks.kitchenId, deliveryNotes: ks.deliveryNotes || null })
							.returning({ id: procurementListKitchenInProcurement.id }),
					{ prefix: "Erro ao salvar cozinha" }
				)

				const selRows = allSels.map((s) => ({ listKitchenId: ataKitchen.id, templateId: s.templateId, repetitions: s.repetitions }))
				await runQuery("INSERT_FAILED", () => tx.insert(procurementListSelectionInProcurement).values(selRows), { prefix: "Erro ao salvar seleções" })
			}
		}
	})
}

// ─── Salvar itens calculados no rascunho (substitui todos) ───────────────────

function buildItemPayload(item: DraftItem, draftId: string): ItemInsert {
	return {
		listId: draftId,
		ingredientId: item.ingredient_id || null,
		ingredientName: item.ingredient_name,
		folderId: item.folder_id || null,
		folderDescription: item.folder_description || null,
		measureUnit: item.measure_unit || null,
		totalQuantity: String(item.total_quantity),
		purchaseItemId: item.purchase_item_id || null,
		purchaseItemDescription: item.purchase_item_description || null,
		purchaseMeasureUnit: item.purchase_measure_unit || null,
		purchaseQuantity: item.purchase_quantity == null ? null : String(item.purchase_quantity),
		conversionFactor: item.conversion_factor == null ? null : String(item.conversion_factor),
		catmatItemCodigo: item.catmat_item_codigo ?? null,
		catmatItemDescricao: item.catmat_item_descricao || null,
		unitPrice: item.unit_price == null ? null : String(item.unit_price),
		itemDescription: item.item_description || null,
		computedAt: new Date().toISOString(),
	}
}

/**
 * Replace-all dos itens (update existentes por id, insere novos, deleta removidos), tudo numa
 * transação; opcionalmente relinka pesquisas de preço dos itens novos; seta wizard_step 4.
 * Retorna o mapeamento ingredient_id → ata_item_id para o cliente atualizar o estado local.
 */
export async function saveAtaDraftItems(
	db: SisubDb,
	_ctx: UserContext,
	input: SaveAtaDraftItems
): Promise<{ savedIds: Array<{ ingredientId: string; ataItemId: string }>; unlinkedResearchCount: number }> {
	const existing = input.items.filter((i) => i.ata_item_id)
	const toInsert = input.items.filter((i) => !i.ata_item_id)
	const insertedItemsById = new Map<string, string>() // ingredient_id → new item id

	const { unlinkedResearchCount } = await db.transaction(async (tx) => {
		await assertDraftEditable(tx, input.draftId)
		const result = await persistDraftItems(tx, input.draftId, existing, toInsert, insertedItemsById, input.researchLinks)
		await runQuery(
			"UPDATE_FAILED",
			() =>
				tx
					.update(procurementListInProcurement)
					.set({ wizardStep: 4, updatedAt: new Date().toISOString() })
					.where(eq(procurementListInProcurement.id, input.draftId)),
			{ prefix: "Erro ao atualizar rascunho" }
		)
		return result
	})

	const savedIds: Array<{ ingredientId: string; ataItemId: string }> = [
		...existing.map((item) => ({ ingredientId: item.ingredient_id ?? "", ataItemId: item.ata_item_id as string })),
		...Array.from(insertedItemsById.entries()).map(([ingredientId, ataItemId]) => ({ ingredientId, ataItemId })),
	]
	return { savedIds, unlinkedResearchCount }
}

type ResearchLink = { ingredientId: string; researchId: string; researchItemId: string }

/** Chave de negócio de um item para reconciliar pesquisa de preço: CATMAT tem prioridade, ingrediente é fallback. */
function itemBusinessKey(catmat: number | null | undefined, ingredientId: string | null | undefined): string | null {
	if (catmat != null) return `c:${catmat}`
	if (ingredientId) return `i:${ingredientId}`
	return null
}

/**
 * Núcleo compartilhado por saveAtaDraftItems/finalizeAtaDraft: replace-all dos itens + reconciliação de pesquisas.
 *
 * Reconciliação por chave de negócio (CATMAT→ingrediente): itens existentes preservam o id (e o link);
 * quando um item some mas outro de mesma chave sobrevive/entra, a pesquisa é remapeada em vez de orfanada.
 * Pesquisas realmente órfãs (`ata_item_id` nulo) desta ATA são removidas. Retorna a contagem desvinculada.
 */
async function persistDraftItems(
	tx: TxClient,
	draftId: string,
	existing: DraftItem[],
	toInsert: DraftItem[],
	insertedItemsById: Map<string, string>,
	researchLinks: ResearchLink[] | undefined
): Promise<{ unlinkedResearchCount: number }> {
	const keepIds = new Set(existing.map((i) => i.ata_item_id as string))

	// Itens atuais com chave de negócio (para reconciliar pesquisas antes de deletar).
	const currentItems = await tx
		.select({
			id: procurementListItemInProcurement.id,
			ingredientId: procurementListItemInProcurement.ingredientId,
			catmat: procurementListItemInProcurement.catmatItemCodigo,
		})
		.from(procurementListItemInProcurement)
		.where(eq(procurementListItemInProcurement.listId, draftId))
	const keyByCurrentId = new Map(currentItems.map((r) => [r.id, itemBusinessKey(r.catmat, r.ingredientId)]))
	const toDelete = currentItems.filter((row) => !keepIds.has(row.id)).map((row) => row.id)

	// Mapa chave → item sobrevivente (existentes mantêm id).
	const survivorByKey = new Map<string, string>()
	for (const item of existing) {
		const key = itemBusinessKey(item.catmat_item_codigo, item.ingredient_id)
		if (key) survivorByKey.set(key, item.ata_item_id as string)
	}

	// Atualizar existentes (preserva IDs, logo preserva pesquisa_preco_item.ata_item_id).
	for (const item of existing) {
		await tx
			.update(procurementListItemInProcurement)
			.set(buildItemPayload(item, draftId))
			.where(eq(procurementListItemInProcurement.id, item.ata_item_id as string))
	}

	// Inserir novos.
	if (toInsert.length > 0) {
		const insertedItems = await runQuery(
			"INSERT_FAILED",
			() =>
				tx
					.insert(procurementListItemInProcurement)
					.values(toInsert.map((item) => buildItemPayload(item, draftId)))
					.returning({
						id: procurementListItemInProcurement.id,
						ingredientId: procurementListItemInProcurement.ingredientId,
						catmat: procurementListItemInProcurement.catmatItemCodigo,
					}),
			{ prefix: "Erro ao salvar itens" }
		)
		for (const row of insertedItems) {
			if (row.ingredientId) insertedItemsById.set(row.ingredientId, row.id)
			const key = itemBusinessKey(row.catmat, row.ingredientId)
			if (key && !survivorByKey.has(key)) survivorByKey.set(key, row.id)
		}
	}

	// Reconciliar pesquisas dos itens que vão sumir: mover o vínculo para um sobrevivente de mesma chave.
	if (toDelete.length > 0) {
		const deleteSet = new Set(toDelete)
		const research = await tx
			.select({ id: procurementPesquisaPrecoItemInProcurement.id, ataItemId: procurementPesquisaPrecoItemInProcurement.ataItemId })
			.from(procurementPesquisaPrecoItemInProcurement)
			.where(inArray(procurementPesquisaPrecoItemInProcurement.ataItemId, toDelete))
		for (const r of research) {
			const key = r.ataItemId ? keyByCurrentId.get(r.ataItemId) : null
			const target = key ? survivorByKey.get(key) : undefined
			if (target && !deleteSet.has(target)) {
				await tx.update(procurementPesquisaPrecoItemInProcurement).set({ ataItemId: target }).where(eq(procurementPesquisaPrecoItemInProcurement.id, r.id))
			}
		}
		// Deletar itens removidos (o que não foi remapeado vira ata_item_id NULL via ON DELETE SET NULL).
		await tx.delete(procurementListItemInProcurement).where(inArray(procurementListItemInProcurement.id, toDelete))
	}

	// Linkar pesquisas de preço para itens novos (cliente reconcilia estado local).
	if (researchLinks?.length && insertedItemsById.size > 0) {
		for (const link of researchLinks) {
			const newItemId = insertedItemsById.get(link.ingredientId)
			if (!newItemId) continue
			await tx
				.update(procurementPesquisaPrecoItemInProcurement)
				.set({ ataItemId: newItemId })
				.where(eq(procurementPesquisaPrecoItemInProcurement.id, link.researchItemId))
			await tx.update(procurementPesquisaPrecoInProcurement).set({ ataId: draftId }).where(eq(procurementPesquisaPrecoInProcurement.id, link.researchId))
		}
	}

	// Limpar pesquisas realmente órfãs desta ATA (item removido de vez, sem sobrevivente de mesma chave).
	let unlinkedResearchCount = 0
	const headers = await tx
		.select({ id: procurementPesquisaPrecoInProcurement.id })
		.from(procurementPesquisaPrecoInProcurement)
		.where(eq(procurementPesquisaPrecoInProcurement.ataId, draftId))
	if (headers.length > 0) {
		const deleted = await tx
			.delete(procurementPesquisaPrecoItemInProcurement)
			.where(
				and(
					isNull(procurementPesquisaPrecoItemInProcurement.ataItemId),
					inArray(
						procurementPesquisaPrecoItemInProcurement.researchId,
						headers.map((h) => h.id)
					)
				)
			)
			.returning({ id: procurementPesquisaPrecoItemInProcurement.id })
		unlinkedResearchCount = deleted.length
	}

	return { unlinkedResearchCount }
}

// ─── Finalizar rascunho (wizard_step → null, ata pronta para publicação) ──────

export async function finalizeAtaDraft(db: SisubDb, _ctx: UserContext, input: FinalizeAtaDraft): Promise<ProcurementList> {
	const existing = input.items.filter((i) => i.ata_item_id)
	const toInsert = input.items.filter((i) => !i.ata_item_id)
	const insertedItemsById = new Map<string, string>()

	const ata = await db.transaction(async (tx) => {
		await assertDraftEditable(tx, input.draftId)
		await persistDraftItems(tx, input.draftId, existing, toInsert, insertedItemsById, input.researchLinks)

		const updated = await insertOneOrFail(
			"UPDATE_FAILED",
			`Erro ao finalizar ata: ata ${input.draftId} não encontrada`,
			() =>
				tx
					.update(procurementListInProcurement)
					.set({ title: input.title, notes: input.notes || null, wizardStep: null, updatedAt: new Date().toISOString() })
					.where(eq(procurementListInProcurement.id, input.draftId))
					.returning(),
			{ prefix: "Erro ao finalizar ata" }
		)
		return updated
	})

	return toWire<ProcurementList>(ata)
}

// ─── Criar ATA (persiste tudo) ────────────────────────────────────────────────

/**
 * Persists a complete procurement list with its kitchen assignments, template selections and pre-calculated items across 4 tables.
 *
 * SIDE EFFECTS: inserts procurement_list (1), procurement_list_kitchen (n), procurement_list_selection (m), procurement_list_item (p).
 * Tudo numa transação Drizzle: falha parcial desfaz tudo (bug fix vs original sem transação). Status default "draft".
 */
export async function createAta(db: SisubDb, _ctx: UserContext, input: CreateAta): Promise<ProcurementList> {
	const { unitId, title, notes, kitchenSelections, items } = input

	const ata = await db.transaction(async (tx) => {
		// 1. Criar lista de compras.
		const created = await insertOneOrFail(
			"INSERT_FAILED",
			"Erro ao criar lista: no row returned",
			() =>
				tx
					.insert(procurementListInProcurement)
					.values({ unitId, title, notes: notes || null, status: "draft" })
					.returning(),
			{ prefix: "Erro ao criar lista" }
		)

		// 2. Para cada cozinha com seleções, criar procurement_list_kitchen + selections.
		for (const ks of kitchenSelections) {
			const allSels = [...ks.templateSelections, ...ks.eventSelections]
			if (allSels.length === 0) continue

			const ataKitchen = await insertOneOrFail(
				"INSERT_FAILED",
				"Erro ao associar cozinha: no row returned",
				() =>
					tx
						.insert(procurementListKitchenInProcurement)
						.values({ listId: created.id, kitchenId: ks.kitchenId, deliveryNotes: ks.deliveryNotes || null })
						.returning({ id: procurementListKitchenInProcurement.id }),
				{ prefix: "Erro ao associar cozinha" }
			)

			const selectionRows = allSels.map((s) => ({ listKitchenId: ataKitchen.id, templateId: s.templateId, repetitions: s.repetitions }))
			await runQuery("INSERT_FAILED", () => tx.insert(procurementListSelectionInProcurement).values(selectionRows), { prefix: "Erro ao salvar seleções" })
		}

		// 3. Inserir itens calculados.
		if (items.length > 0) {
			const itemRows: ItemInsert[] = items.map((item) => buildItemPayload(item, created.id))
			const insertedItems = await runQuery(
				"INSERT_FAILED",
				() =>
					tx
						.insert(procurementListItemInProcurement)
						.values(itemRows)
						.returning({ id: procurementListItemInProcurement.id, ingredientId: procurementListItemInProcurement.ingredientId }),
				{ prefix: "Erro ao salvar itens" }
			)

			// 4. Linkar registros de auditoria de pesquisa de preços (se houver).
			if (input.researchLinks?.length && insertedItems.length) {
				for (const link of input.researchLinks) {
					const ataItem = insertedItems.find((i) => i.ingredientId === link.ingredientId)
					if (!ataItem) continue
					await tx
						.update(procurementPesquisaPrecoItemInProcurement)
						.set({ ataItemId: ataItem.id })
						.where(eq(procurementPesquisaPrecoItemInProcurement.id, link.researchItemId))
					await tx.update(procurementPesquisaPrecoInProcurement).set({ ataId: created.id }).where(eq(procurementPesquisaPrecoInProcurement.id, link.researchId))
				}
			}
		}

		return created
	})

	return toWire<ProcurementList>(ata)
}

// ─── Listar ATAs da unidade ───────────────────────────────────────────────────

/** Lists all non-deleted ATAs for a unit, ordered by creation date descending. */
export async function fetchAtaList(db: SisubDb, _ctx: UserContext, input: FetchAtaList): Promise<ProcurementList[]> {
	const lists = await runQuery(
		"QUERY_FAILED",
		() =>
			db
				.select()
				.from(procurementListInProcurement)
				.where(and(eq(procurementListInProcurement.unitId, input.unitId), isNull(procurementListInProcurement.deletedAt)))
				.orderBy(sql`${procurementListInProcurement.createdAt} desc`),
		{ prefix: "Erro ao buscar listas" }
	)
	return lists.map((r) => toWire<ProcurementList>(r))
}

// ─── Buscar ATA com detalhes ──────────────────────────────────────────────────

/**
 * Fetches full ATA details including kitchens, template selections and calculated items. Returns null if ATA row not found.
 *
 * Returns null only on missing ATA; kitchen/items failures still throw.
 */
export async function fetchAtaDetails(db: SisubDb, _ctx: UserContext, input: FetchAtaDetails): Promise<AtaWithDetails | null> {
	const ata = await runQuery(
		"QUERY_FAILED",
		() => db.query.procurementListInProcurement.findFirst({ where: eq(procurementListInProcurement.id, input.ataId) }),
		{
			prefix: "Erro ao buscar ata",
		}
	)
	if (!ata) return null

	const kitchens = await runQuery(
		"QUERY_FAILED",
		() =>
			db.query.procurementListKitchenInProcurement.findMany({
				with: {
					kitchenInCore: { columns: { id: true, displayName: true } },
					procurementListSelectionInProcurements: { with: { menuTemplateInKitchen: { columns: { name: true, templateType: true } } } },
				},
				where: eq(procurementListKitchenInProcurement.listId, input.ataId),
			}),
		{ prefix: "Erro ao buscar cozinhas" }
	)

	const items = await runQuery(
		"QUERY_FAILED",
		() =>
			db
				.select()
				.from(procurementListItemInProcurement)
				.where(eq(procurementListItemInProcurement.listId, input.ataId))
				.orderBy(sql`${procurementListItemInProcurement.folderDescription} asc nulls last`, asc(procurementListItemInProcurement.ingredientName)),
		{ prefix: "Erro ao buscar itens" }
	)

	const meta = await computeAtaMeta(db, ata.status, input.ataId, kitchens, items)

	return {
		...toWire<ProcurementList>(ata),
		kitchens: kitchens.map((k) => toWire<AtaKitchenWire>(k, DETAILS_RELATIONS)),
		items: items.map((i) => toWire<ProcurementListItem>(i)),
		meta,
	}
}

type KitchenRow = { procurementListSelectionInProcurements: Array<{ templateId: string }> }
type ItemRow = { computedAt: string | null }

/** Calcula defasagem (stale) do rascunho, validade da pesquisa e snapshot congelado (ATA publicada). */
async function computeAtaMeta(db: SisubDb, status: string, listId: string, kitchens: KitchenRow[], items: ItemRow[]): Promise<AtaMeta> {
	const maxDate = (values: Array<string | null | undefined>): string | null => {
		const valid = values.filter((v): v is string => !!v)
		return valid.length ? valid.reduce((a, b) => (a > b ? a : b)) : null
	}

	// Defasagem: só faz sentido em rascunho com itens já calculados.
	let isStale = false
	const lastComputedAt = maxDate(items.map((i) => i.computedAt))
	if (status === "draft" && lastComputedAt) {
		const templateIds = [...new Set(kitchens.flatMap((k) => k.procurementListSelectionInProcurements.map((s) => s.templateId)))]
		if (templateIds.length > 0) {
			const edits = await runQuery(
				"QUERY_FAILED",
				() =>
					db
						.select({ createdAt: menuTemplateItemsInKitchen.createdAt })
						.from(menuTemplateItemsInKitchen)
						.where(inArray(menuTemplateItemsInKitchen.menuTemplateId, templateIds)),
				{ prefix: "Erro ao verificar defasagem" }
			)
			const lastEdit = maxDate(edits.map((e) => e.createdAt))
			isStale = !!lastEdit && lastEdit > lastComputedAt
		}
	}

	// Validade legal da pesquisa de preço (não-bloqueante).
	const research = await runQuery(
		"QUERY_FAILED",
		() =>
			db
				.select({ createdAt: procurementPesquisaPrecoInProcurement.createdAt })
				.from(procurementPesquisaPrecoInProcurement)
				.where(eq(procurementPesquisaPrecoInProcurement.ataId, listId)),
		{ prefix: "Erro ao buscar pesquisas" }
	)
	const oldestResearchAt = research.length ? research.map((r) => r.createdAt).reduce((a, b) => (a < b ? a : b)) : null
	let isExpired = false
	if (oldestResearchAt) {
		const ageDays = (Date.now() - new Date(oldestResearchAt).getTime()) / 86_400_000
		isExpired = ageDays >= PRICE_RESEARCH_VALIDITY_DAYS
	}

	// Snapshot congelado (só existe após publicação).
	let snapshot: AtaMeta["snapshot"] = null
	if (status !== "draft") {
		const [selections, components] = await Promise.all([
			runQuery(
				"QUERY_FAILED",
				() => db.select().from(procurementListSnapshotSelectionInProcurement).where(eq(procurementListSnapshotSelectionInProcurement.listId, listId)),
				{ prefix: "Erro ao buscar snapshot" }
			),
			runQuery(
				"QUERY_FAILED",
				() => db.select().from(procurementListSnapshotComponentInProcurement).where(eq(procurementListSnapshotComponentInProcurement.listId, listId)),
				{ prefix: "Erro ao buscar snapshot" }
			),
		])
		if (selections.length || components.length) {
			snapshot = {
				selections: selections.map((s) => ({
					template_name: s.templateName,
					template_type: s.templateType,
					kitchen_id: s.kitchenId,
					kitchen_name: s.kitchenName,
					repetitions: s.repetitions,
					snapshot_source: s.snapshotSource,
				})),
				components: components.map((c) => ({
					ingredient_name: c.ingredientName,
					folder_description: c.folderDescription,
					measure_unit: c.measureUnit,
					total_quantity: c.totalQuantity,
					purchase_item_description: c.purchaseItemDescription,
					purchase_measure_unit: c.purchaseMeasureUnit,
					purchase_quantity: c.purchaseQuantity,
					catmat_item_codigo: c.catmatItemCodigo,
					unit_price: c.unitPrice,
					snapshot_source: c.snapshotSource,
				})),
			}
		}
	}

	return {
		is_stale: isStale,
		price_research: { oldest_research_at: oldestResearchAt, validity_days: PRICE_RESEARCH_VALIDITY_DAYS, is_expired: isExpired },
		snapshot,
	}
}

// ─── Snapshot da composição (congela ao publicar) ─────────────────────────────

/**
 * Materializa a composição resolvida da ATA em tabelas de snapshot próprias, tornando-a
 * autocontida e imune a edições/soft-delete posteriores de menu_template/receita/item.
 * Idempotente: substitui qualquer snapshot nativo anterior daquela ATA.
 */
async function buildAtaSnapshot(tx: TxClient, listId: string): Promise<void> {
	// Recomeça do zero para permitir republicação sem duplicar.
	await tx.delete(procurementListSnapshotSelectionInProcurement).where(eq(procurementListSnapshotSelectionInProcurement.listId, listId))
	await tx.delete(procurementListSnapshotComponentInProcurement).where(eq(procurementListSnapshotComponentInProcurement.listId, listId))

	// Seleções resolvidas (nome/tipo do cardápio congelados).
	const selections = await tx
		.select({
			originTemplateId: procurementListSelectionInProcurement.templateId,
			templateName: menuTemplateInKitchen.name,
			templateType: menuTemplateInKitchen.templateType,
			kitchenId: procurementListKitchenInProcurement.kitchenId,
			repetitions: procurementListSelectionInProcurement.repetitions,
		})
		.from(procurementListSelectionInProcurement)
		.innerJoin(procurementListKitchenInProcurement, eq(procurementListSelectionInProcurement.listKitchenId, procurementListKitchenInProcurement.id))
		.leftJoin(menuTemplateInKitchen, eq(procurementListSelectionInProcurement.templateId, menuTemplateInKitchen.id))
		.where(eq(procurementListKitchenInProcurement.listId, listId))

	if (selections.length > 0) {
		await tx.insert(procurementListSnapshotSelectionInProcurement).values(
			selections.map((s) => ({
				listId,
				originTemplateId: s.originTemplateId,
				templateName: s.templateName,
				templateType: s.templateType,
				kitchenId: s.kitchenId,
				repetitions: s.repetitions,
				snapshotSource: "native",
			}))
		)
	}

	// Componentes (cópia imutável dos itens agregados).
	const items = await tx.select().from(procurementListItemInProcurement).where(eq(procurementListItemInProcurement.listId, listId))
	if (items.length > 0) {
		await tx.insert(procurementListSnapshotComponentInProcurement).values(
			items.map((i) => ({
				listId,
				ingredientId: i.ingredientId,
				ingredientName: i.ingredientName,
				folderDescription: i.folderDescription,
				measureUnit: i.measureUnit,
				totalQuantity: i.totalQuantity,
				purchaseItemId: i.purchaseItemId,
				purchaseItemDescription: i.purchaseItemDescription,
				purchaseMeasureUnit: i.purchaseMeasureUnit,
				purchaseQuantity: i.purchaseQuantity,
				catmatItemCodigo: i.catmatItemCodigo,
				unitPrice: i.unitPrice,
				snapshotSource: "native",
				computedAt: i.computedAt ?? new Date().toISOString(),
			}))
		)
	}
}

// ─── Atualizar status da ATA ──────────────────────────────────────────────────

/**
 * Transiciona o status da ATA validando o ciclo de vida (draft → published → archived; sem downgrade).
 * Ao publicar, congela a composição num snapshot próprio (memória de cálculo imutável).
 */
export async function updateAtaStatus(db: SisubDb, _ctx: UserContext, input: UpdateAtaStatus): Promise<void> {
	await db.transaction(async (tx) => {
		const current = await getListStatus(tx, input.ataId)
		if (current === input.status) return // no-op idempotente

		const allowed = ALLOWED_STATUS_TRANSITIONS[current] ?? []
		if (!allowed.includes(input.status)) {
			throw new DomainError("INVALID_STATUS_TRANSITION", `Transição inválida: ${current} → ${input.status}`)
		}

		await mutateOrFail(
			"UPDATE_FAILED",
			`Erro ao atualizar status: ata ${input.ataId} não encontrada`,
			() =>
				tx
					.update(procurementListInProcurement)
					.set({ status: input.status, updatedAt: new Date().toISOString() })
					.where(eq(procurementListInProcurement.id, input.ataId))
					.returning({ id: procurementListInProcurement.id }),
			{ prefix: "Erro ao atualizar status" }
		)

		if (input.status === "published") {
			await buildAtaSnapshot(tx, input.ataId)
		}
	})
}

// ─── Atualizar preços de itens de uma ATA já salva ───────────────────────────

export async function updateAtaItemPrices(db: SisubDb, _ctx: UserContext, input: UpdateAtaItemPrices): Promise<void> {
	await db.transaction(async (tx) => {
		for (const u of input.updates) {
			await tx
				.update(procurementListItemInProcurement)
				.set({ unitPrice: String(u.price) })
				.where(eq(procurementListItemInProcurement.id, u.ataItemId))
		}

		if (input.researchLinks?.length) {
			for (const link of input.researchLinks) {
				await tx
					.update(procurementPesquisaPrecoItemInProcurement)
					.set({ ataItemId: link.ataItemId })
					.where(eq(procurementPesquisaPrecoItemInProcurement.id, link.researchItemId))
				await tx.update(procurementPesquisaPrecoInProcurement).set({ ataId: input.ataId }).where(eq(procurementPesquisaPrecoInProcurement.id, link.researchId))
			}
		}
	})
}

// ─── Atualizar descrição de um item de ATA ───────────────────────────────────

export async function updateAtaItemDescription(db: SisubDb, _ctx: UserContext, input: UpdateAtaItemDescription): Promise<void> {
	await mutateOrFail(
		"UPDATE_FAILED",
		`Erro ao atualizar descrição: item ${input.ataItemId} não encontrado`,
		() =>
			db
				.update(procurementListItemInProcurement)
				.set({ itemDescription: input.description || null })
				.where(eq(procurementListItemInProcurement.id, input.ataItemId))
				.returning({ id: procurementListItemInProcurement.id }),
		{ prefix: "Erro ao atualizar descrição" }
	)
}

// ─── Deletar ATA (soft delete) ────────────────────────────────────────────────

/** Soft-deletes an ATA by setting deleted_at — kitchen associations and items remain intact. */
export async function deleteAta(db: SisubDb, _ctx: UserContext, input: DeleteAta): Promise<void> {
	await mutateOrFail(
		"DELETE_FAILED",
		`Erro ao deletar lista: ata ${input.ataId} não encontrada`,
		() =>
			db
				.update(procurementListInProcurement)
				.set({ deletedAt: new Date().toISOString() })
				.where(eq(procurementListInProcurement.id, input.ataId))
				.returning({ id: procurementListInProcurement.id }),
		{ prefix: "Erro ao deletar lista" }
	)
}
