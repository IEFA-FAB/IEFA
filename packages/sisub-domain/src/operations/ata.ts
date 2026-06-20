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
	menuTemplateInSisub,
	procurementListInSisub,
	procurementListItemInSisub,
	procurementListKitchenInSisub,
	procurementListSelectionInSisub,
	procurementPesquisaPrecoInSisub,
	procurementPesquisaPrecoItemInSisub,
	purchaseItemIngredientInSisub,
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
import type { ProcurementNeed } from "../types/procurement.ts"
import { insertOneOrFail, mutateOrFail, runQuery, toWire } from "../utils/index.ts"

type ProcurementList = Tables<"procurement_list">
type ProcurementListItem = Tables<"procurement_list_item">
type ProcurementListKitchen = Tables<"procurement_list_kitchen">
type ProcurementListSelection = Tables<"procurement_list_selection">

type AtaSelectionWire = ProcurementListSelection & { template: { name: string | null; template_type: string } | null }
type AtaKitchenWire = ProcurementListKitchen & { kitchen: { id: number; display_name: string | null } | null; selections: AtaSelectionWire[] }
type AtaWithDetails = ProcurementList & { kitchens: AtaKitchenWire[]; items: ProcurementListItem[] }

type ItemInsert = typeof procurementListItemInSisub.$inferInsert

const DETAILS_RELATIONS: Record<string, string> = {
	procurementListSelectionInSisubs: "selections",
	kitchenInSisub: "kitchen",
	menuTemplateInSisub: "template",
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
			db.query.menuTemplateInSisub.findMany({
				columns: { id: true, templateType: true },
				with: {
					menuTemplateItemsInSisubs: {
						columns: { id: true, recipeId: true, headcountOverride: true },
						with: {
							recipesInSisub: {
								columns: { id: true, portionYield: true },
								with: {
									recipeIngredientsInSisubs: {
										columns: { ingredientId: true, netQuantity: true },
										with: {
											ingredientInSisub: {
												columns: { id: true, description: true, measureUnit: true, folderId: true },
												with: { folderInSisub: { columns: { id: true, description: true } } },
											},
										},
									},
								},
							},
						},
					},
				},
				where: inArray(menuTemplateInSisub.id, uniqueTemplateIds),
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

		for (const item of template.menuTemplateItemsInSisubs) {
			const recipeData = item.recipesInSisub
			if (!recipeData) continue

			const headcount = item.headcountOverride
			if (!headcount) continue

			const portionYield = Number(recipeData.portionYield ?? 0) || 1
			const portionMultiplier = (headcount / portionYield) * selection.repetitions

			for (const ri of recipeData.recipeIngredientsInSisubs) {
				const ingredientRaw = ri.ingredientInSisub
				if (!ingredientRaw || !ri.ingredientId) continue

				const ingredient = {
					id: ingredientRaw.id,
					description: ingredientRaw.description,
					measure_unit: ingredientRaw.measureUnit,
					folder_id: ingredientRaw.folderId,
					folder: ingredientRaw.folderInSisub ? { id: ingredientRaw.folderInSisub.id, description: ingredientRaw.folderInSisub.description } : null,
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
				db.query.purchaseItemIngredientInSisub.findMany({
					columns: { ingredientId: true, conversionFactor: true },
					with: {
						purchaseItemInSisub: {
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
					where: and(inArray(purchaseItemIngredientInSisub.ingredientId, ingredientIds), eq(purchaseItemIngredientInSisub.isDefault, true)),
				}),
			{ prefix: "Erro ao buscar itens de compra" }
		)

		for (const link of piLinks) {
			const pi = link.purchaseItemInSisub
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
				.insert(procurementListInSisub)
				.values({ unitId: input.unitId, title: "Sem nome", status: "draft", wizardStep: 1 })
				.returning({ id: procurementListInSisub.id }),
		{ prefix: "Erro ao criar rascunho" }
	)
	return { id: ata.id }
}

// ─── Atualizar metadados e seleções do rascunho ───────────────────────────────

export async function updateAtaDraft(db: SisubDb, _ctx: UserContext, input: UpdateAtaDraft): Promise<void> {
	await db.transaction(async (tx) => {
		const updateData: Partial<typeof procurementListInSisub.$inferInsert> = { updatedAt: new Date().toISOString() }
		if (input.title !== undefined) updateData.title = input.title
		if (input.notes !== undefined) updateData.notes = input.notes || null
		if (input.wizardStep !== undefined) updateData.wizardStep = input.wizardStep

		// Detecta draft inexistente (deletado mid-session) em vez de no-op silencioso — paridade com updateAtaStatus/deleteAta.
		await mutateOrFail(
			"UPDATE_FAILED",
			`Erro ao atualizar rascunho: rascunho ${input.draftId} não encontrado`,
			() => tx.update(procurementListInSisub).set(updateData).where(eq(procurementListInSisub.id, input.draftId)).returning({ id: procurementListInSisub.id }),
			{ prefix: "Erro ao atualizar rascunho" }
		)

		if (input.kitchenSelections !== undefined) {
			// Substituição destrutiva (delete-all + re-insert) das cozinhas → seleções cascateiam via FK.
			await tx.delete(procurementListKitchenInSisub).where(eq(procurementListKitchenInSisub.listId, input.draftId))

			for (const ks of input.kitchenSelections) {
				const allSels = [...ks.templateSelections, ...ks.eventSelections]
				if (allSels.length === 0) continue

				const ataKitchen = await insertOneOrFail(
					"INSERT_FAILED",
					"Erro ao salvar cozinha: no row returned",
					() =>
						tx
							.insert(procurementListKitchenInSisub)
							.values({ listId: input.draftId, kitchenId: ks.kitchenId, deliveryNotes: ks.deliveryNotes || null })
							.returning({ id: procurementListKitchenInSisub.id }),
					{ prefix: "Erro ao salvar cozinha" }
				)

				const selRows = allSels.map((s) => ({ listKitchenId: ataKitchen.id, templateId: s.templateId, repetitions: s.repetitions }))
				await runQuery("INSERT_FAILED", () => tx.insert(procurementListSelectionInSisub).values(selRows), { prefix: "Erro ao salvar seleções" })
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
): Promise<{ savedIds: Array<{ ingredientId: string; ataItemId: string }> }> {
	const existing = input.items.filter((i) => i.ata_item_id)
	const toInsert = input.items.filter((i) => !i.ata_item_id)
	const insertedItemsById = new Map<string, string>() // ingredient_id → new item id

	await db.transaction(async (tx) => {
		await persistDraftItems(tx, input.draftId, existing, toInsert, insertedItemsById, input.researchLinks)
		await runQuery(
			"UPDATE_FAILED",
			() => tx.update(procurementListInSisub).set({ wizardStep: 4, updatedAt: new Date().toISOString() }).where(eq(procurementListInSisub.id, input.draftId)),
			{ prefix: "Erro ao atualizar rascunho" }
		)
	})

	const savedIds: Array<{ ingredientId: string; ataItemId: string }> = [
		...existing.map((item) => ({ ingredientId: item.ingredient_id ?? "", ataItemId: item.ata_item_id as string })),
		...Array.from(insertedItemsById.entries()).map(([ingredientId, ataItemId]) => ({ ingredientId, ataItemId })),
	]
	return { savedIds }
}

type TxClient = Parameters<Parameters<SisubDb["transaction"]>[0]>[0]
type ResearchLink = { ingredientId: string; researchId: string; researchItemId: string }

/** Núcleo compartilhado por saveAtaDraftItems/finalizeAtaDraft: replace-all dos itens + relink de pesquisas. */
async function persistDraftItems(
	tx: TxClient,
	draftId: string,
	existing: DraftItem[],
	toInsert: DraftItem[],
	insertedItemsById: Map<string, string>,
	researchLinks: ResearchLink[] | undefined
): Promise<void> {
	const keepIds = new Set(existing.map((i) => i.ata_item_id as string))

	// Deletar itens que não estão mais na lista.
	const currentItems = await tx
		.select({ id: procurementListItemInSisub.id })
		.from(procurementListItemInSisub)
		.where(eq(procurementListItemInSisub.listId, draftId))
	const toDelete = currentItems.filter((row) => !keepIds.has(row.id)).map((row) => row.id)
	if (toDelete.length > 0) {
		await tx.delete(procurementListItemInSisub).where(inArray(procurementListItemInSisub.id, toDelete))
	}

	// Atualizar existentes (preserva IDs, logo preserva pesquisa_preco_item.ata_item_id).
	for (const item of existing) {
		await tx
			.update(procurementListItemInSisub)
			.set(buildItemPayload(item, draftId))
			.where(eq(procurementListItemInSisub.id, item.ata_item_id as string))
	}

	// Inserir novos.
	if (toInsert.length > 0) {
		const insertedItems = await runQuery(
			"INSERT_FAILED",
			() =>
				tx
					.insert(procurementListItemInSisub)
					.values(toInsert.map((item) => buildItemPayload(item, draftId)))
					.returning({ id: procurementListItemInSisub.id, ingredientId: procurementListItemInSisub.ingredientId }),
			{ prefix: "Erro ao salvar itens" }
		)
		for (const row of insertedItems) {
			if (row.ingredientId) insertedItemsById.set(row.ingredientId, row.id)
		}
	}

	// Linkar pesquisas de preço para itens novos (itens existentes já mantêm o link).
	if (researchLinks?.length && insertedItemsById.size > 0) {
		for (const link of researchLinks) {
			const newItemId = insertedItemsById.get(link.ingredientId)
			if (!newItemId) continue
			await tx.update(procurementPesquisaPrecoItemInSisub).set({ ataItemId: newItemId }).where(eq(procurementPesquisaPrecoItemInSisub.id, link.researchItemId))
			await tx.update(procurementPesquisaPrecoInSisub).set({ ataId: draftId }).where(eq(procurementPesquisaPrecoInSisub.id, link.researchId))
		}
	}
}

// ─── Finalizar rascunho (wizard_step → null, ata pronta para publicação) ──────

export async function finalizeAtaDraft(db: SisubDb, _ctx: UserContext, input: FinalizeAtaDraft): Promise<ProcurementList> {
	const existing = input.items.filter((i) => i.ata_item_id)
	const toInsert = input.items.filter((i) => !i.ata_item_id)
	const insertedItemsById = new Map<string, string>()

	const ata = await db.transaction(async (tx) => {
		await persistDraftItems(tx, input.draftId, existing, toInsert, insertedItemsById, input.researchLinks)

		const updated = await insertOneOrFail(
			"UPDATE_FAILED",
			`Erro ao finalizar ata: ata ${input.draftId} não encontrada`,
			() =>
				tx
					.update(procurementListInSisub)
					.set({ title: input.title, notes: input.notes || null, wizardStep: null, updatedAt: new Date().toISOString() })
					.where(eq(procurementListInSisub.id, input.draftId))
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
					.insert(procurementListInSisub)
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
						.insert(procurementListKitchenInSisub)
						.values({ listId: created.id, kitchenId: ks.kitchenId, deliveryNotes: ks.deliveryNotes || null })
						.returning({ id: procurementListKitchenInSisub.id }),
				{ prefix: "Erro ao associar cozinha" }
			)

			const selectionRows = allSels.map((s) => ({ listKitchenId: ataKitchen.id, templateId: s.templateId, repetitions: s.repetitions }))
			await runQuery("INSERT_FAILED", () => tx.insert(procurementListSelectionInSisub).values(selectionRows), { prefix: "Erro ao salvar seleções" })
		}

		// 3. Inserir itens calculados.
		if (items.length > 0) {
			const itemRows: ItemInsert[] = items.map((item) => buildItemPayload(item, created.id))
			const insertedItems = await runQuery(
				"INSERT_FAILED",
				() =>
					tx
						.insert(procurementListItemInSisub)
						.values(itemRows)
						.returning({ id: procurementListItemInSisub.id, ingredientId: procurementListItemInSisub.ingredientId }),
				{ prefix: "Erro ao salvar itens" }
			)

			// 4. Linkar registros de auditoria de pesquisa de preços (se houver).
			if (input.researchLinks?.length && insertedItems.length) {
				for (const link of input.researchLinks) {
					const ataItem = insertedItems.find((i) => i.ingredientId === link.ingredientId)
					if (!ataItem) continue
					await tx
						.update(procurementPesquisaPrecoItemInSisub)
						.set({ ataItemId: ataItem.id })
						.where(eq(procurementPesquisaPrecoItemInSisub.id, link.researchItemId))
					await tx.update(procurementPesquisaPrecoInSisub).set({ ataId: created.id }).where(eq(procurementPesquisaPrecoInSisub.id, link.researchId))
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
				.from(procurementListInSisub)
				.where(and(eq(procurementListInSisub.unitId, input.unitId), isNull(procurementListInSisub.deletedAt)))
				.orderBy(sql`${procurementListInSisub.createdAt} desc`),
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
	const ata = await runQuery("QUERY_FAILED", () => db.query.procurementListInSisub.findFirst({ where: eq(procurementListInSisub.id, input.ataId) }), {
		prefix: "Erro ao buscar ata",
	})
	if (!ata) return null

	const kitchens = await runQuery(
		"QUERY_FAILED",
		() =>
			db.query.procurementListKitchenInSisub.findMany({
				with: {
					kitchenInSisub: { columns: { id: true, displayName: true } },
					procurementListSelectionInSisubs: { with: { menuTemplateInSisub: { columns: { name: true, templateType: true } } } },
				},
				where: eq(procurementListKitchenInSisub.listId, input.ataId),
			}),
		{ prefix: "Erro ao buscar cozinhas" }
	)

	const items = await runQuery(
		"QUERY_FAILED",
		() =>
			db
				.select()
				.from(procurementListItemInSisub)
				.where(eq(procurementListItemInSisub.listId, input.ataId))
				.orderBy(sql`${procurementListItemInSisub.folderDescription} asc nulls last`, asc(procurementListItemInSisub.ingredientName)),
		{ prefix: "Erro ao buscar itens" }
	)

	return {
		...toWire<ProcurementList>(ata),
		kitchens: kitchens.map((k) => toWire<AtaKitchenWire>(k, DETAILS_RELATIONS)),
		items: items.map((i) => toWire<ProcurementListItem>(i)),
	}
}

// ─── Atualizar status da ATA ──────────────────────────────────────────────────

/** Transitions ATA status to "draft" | "published" | "archived" and stamps updated_at. */
export async function updateAtaStatus(db: SisubDb, _ctx: UserContext, input: UpdateAtaStatus): Promise<void> {
	await mutateOrFail(
		"UPDATE_FAILED",
		`Erro ao atualizar status: ata ${input.ataId} não encontrada`,
		() =>
			db
				.update(procurementListInSisub)
				.set({ status: input.status, updatedAt: new Date().toISOString() })
				.where(eq(procurementListInSisub.id, input.ataId))
				.returning({ id: procurementListInSisub.id }),
		{ prefix: "Erro ao atualizar status" }
	)
}

// ─── Atualizar preços de itens de uma ATA já salva ───────────────────────────

export async function updateAtaItemPrices(db: SisubDb, _ctx: UserContext, input: UpdateAtaItemPrices): Promise<void> {
	await db.transaction(async (tx) => {
		for (const u of input.updates) {
			await tx
				.update(procurementListItemInSisub)
				.set({ unitPrice: String(u.price) })
				.where(eq(procurementListItemInSisub.id, u.ataItemId))
		}

		if (input.researchLinks?.length) {
			for (const link of input.researchLinks) {
				await tx
					.update(procurementPesquisaPrecoItemInSisub)
					.set({ ataItemId: link.ataItemId })
					.where(eq(procurementPesquisaPrecoItemInSisub.id, link.researchItemId))
				await tx.update(procurementPesquisaPrecoInSisub).set({ ataId: input.ataId }).where(eq(procurementPesquisaPrecoInSisub.id, link.researchId))
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
				.update(procurementListItemInSisub)
				.set({ itemDescription: input.description || null })
				.where(eq(procurementListItemInSisub.id, input.ataItemId))
				.returning({ id: procurementListItemInSisub.id }),
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
				.update(procurementListInSisub)
				.set({ deletedAt: new Date().toISOString() })
				.where(eq(procurementListInSisub.id, input.ataId))
				.returning({ id: procurementListInSisub.id }),
		{ prefix: "Erro ao deletar lista" }
	)
}
