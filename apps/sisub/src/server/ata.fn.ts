/**
 * @module ata.fn
 * Procurement list lifecycle: needs calculation, creation, status transitions, soft-delete.
 * CLIENT: getSupabaseServerClient (service role) — all functions.
 * TABLES: procurement_list, procurement_list_kitchen, procurement_list_selection, procurement_list_item.
 */

import type { ProcurementList } from "@iefa/database/sisub"
import type { ProcurementNeed } from "@iefa/sisub-domain/types"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuth } from "@/lib/auth.server"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { AtaKitchenWithDetails, AtaWithDetails } from "@/types/domain/ata"

// ─── Input Schemas ────────────────────────────────────────────────────────────

const TemplateSelectionSchema = z.object({
	templateId: z.string(),
	templateName: z.string(),
	repetitions: z.number().min(1),
})

const KitchenSelectionSchema = z.object({
	kitchenId: z.number(),
	kitchenName: z.string(),
	deliveryNotes: z.string(),
	templateSelections: z.array(TemplateSelectionSchema),
	eventSelections: z.array(TemplateSelectionSchema),
})

// ─── Calcular necessidades (sem persistir) ────────────────────────────────────

/**
 * Computes ingredient quantities needed to fulfill a set of menu template selections — read-only, no persistence.
 *
 * @remarks
 * Resolves templates → recipes → ingredients; multiplies net_quantity by (headcount / portion_yield × repetitions).
 * Aggregates identical ingredient_ids across all kitchenSelections (weekly + events combined).
 * Sorts result by folder_description → ingredient_name (pt-BR collation).
 *
 * @throws {Error} "Erro ao buscar templates: ..." on Supabase query failure.
 */
export const calculateAtaNeedsFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			kitchenSelections: z.array(KitchenSelectionSchema),
		})
	)
	.handler(async ({ data }): Promise<ProcurementNeed[]> => {
		await requireAuth()
		const supabase = getSupabaseServerClient()
		const { kitchenSelections } = data

		// Coletar todos os IDs de template únicos (weekly + events)
		const allSelections = kitchenSelections.flatMap((ks) => [
			...ks.templateSelections.map((s) => ({ ...s, kitchenId: ks.kitchenId })),
			...ks.eventSelections.map((s) => ({ ...s, kitchenId: ks.kitchenId })),
		])

		if (allSelections.length === 0) return []

		const uniqueTemplateIds = [...new Set(allSelections.map((s) => s.templateId))]

		// Buscar templates com items → recipe → ingredients → ingredient (cozinha pura, sem catmat)
		const { data: templates, error: templatesError } = await supabase
			.from("menu_template")
			.select(
				`
        id,
        template_type,
        menu_template_items (
          id,
          recipe_id,
          headcount_override,
          recipes:recipe_id (
            id,
            portion_yield,
            recipe_ingredients (
              ingredient_id,
              net_quantity,
              ingredient:ingredient_id (
                id,
                description,
                measure_unit,
                folder_id,
                folder:folder_id (
                  id,
                  description
                )
              )
            )
          )
        )
      `
			)
			.in("id", uniqueTemplateIds)

		if (templatesError) throw new Error(`Erro ao buscar templates: ${templatesError.message}`)
		if (!templates || templates.length === 0) return []

		// Mapa templateId → template data
		const templateMap = new Map(templates.map((t) => [t.id, t]))

		// Mapa de agregação por ingredient_id
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

			const items = template.menu_template_items || []

			for (const item of items) {
				const recipeData = Array.isArray(item.recipes) ? item.recipes[0] : item.recipes
				if (!recipeData) continue

				const headcount = item.headcount_override
				if (!headcount) continue

				const portionYield = recipeData.portion_yield || 1
				const portionMultiplier = (headcount / portionYield) * selection.repetitions

				const recipeIngredients = recipeData.recipe_ingredients || []
				for (const ri of recipeIngredients) {
					const ingredientRaw = Array.isArray(ri.ingredient) ? ri.ingredient[0] : ri.ingredient
					if (!ingredientRaw || !ri.ingredient_id) continue

					const folderRaw = Array.isArray(ingredientRaw.folder) ? ingredientRaw.folder[0] : ingredientRaw.folder
					const ingredient = { ...ingredientRaw, folder: folderRaw }

					const quantityNeeded = (ri.net_quantity || 0) * portionMultiplier

					const existing = needsMap.get(ri.ingredient_id)
					if (existing) {
						existing.total_quantity += quantityNeeded
					} else {
						needsMap.set(ri.ingredient_id, { ingredient, total_quantity: quantityNeeded })
					}
				}
			}
		}

		// Passo de tradução: ingredient → purchase_item (via is_default link)
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
			const { data: piLinks } = await supabase
				.from("purchase_item_ingredient")
				.select(
					"ingredient_id, conversion_factor, purchase_item:purchase_item_id(id, description, purchase_measure_unit, catmat_item_codigo, catmat_item_descricao, unit_price, deleted_at)"
				)
				.in("ingredient_id", ingredientIds)
				.eq("is_default", true)

			for (const link of piLinks || []) {
				const piRaw = Array.isArray(link.purchase_item) ? link.purchase_item[0] : link.purchase_item
				if (!piRaw || piRaw.deleted_at) continue
				ingredientToPurchaseItem.set(link.ingredient_id, {
					purchase_item_id: piRaw.id,
					purchase_item_description: piRaw.description,
					purchase_measure_unit: piRaw.purchase_measure_unit,
					catmat_item_codigo: piRaw.catmat_item_codigo,
					catmat_item_descricao: piRaw.catmat_item_descricao,
					unit_price: piRaw.unit_price,
					conversion_factor: Number(link.conversion_factor),
				})
			}
		}

		// Converter para array final
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
			}
		})

		// Ordenar por categoria → ingrediente
		needs.sort((a, b) => {
			const folderA = a.folder_description || "Sem categoria"
			const folderB = b.folder_description || "Sem categoria"
			if (folderA !== folderB) return folderA.localeCompare(folderB, "pt-BR")
			return a.ingredient_name.localeCompare(b.ingredient_name, "pt-BR")
		})

		return needs
	})

// ─── Criar rascunho vazio (wizard step 1) ────────────────────────────────────

export const createAtaDraftFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ unitId: z.number() }))
	.handler(async ({ data }): Promise<{ id: string }> => {
		await requireAuth()
		const supabase = getSupabaseServerClient()
		const { data: ata, error } = await supabase
			.from("procurement_list")
			.insert({ unit_id: data.unitId, title: "Sem nome", status: "draft", wizard_step: 1 })
			.select("id")
			.single()
		if (error) throw new Error(`Erro ao criar rascunho: ${error.message}`)
		return { id: ata.id }
	})

// ─── Atualizar metadados e seleções do rascunho ───────────────────────────────

export const updateAtaDraftFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			draftId: z.string().uuid(),
			title: z.string().optional(),
			notes: z.string().optional(),
			wizardStep: z.number().min(1).max(4).optional(),
			kitchenSelections: z.array(KitchenSelectionSchema).optional(),
		})
	)
	.handler(async ({ data }) => {
		await requireAuth()
		const supabase = getSupabaseServerClient()

		const updateData = {
			updated_at: new Date().toISOString(),
			...(data.title !== undefined && { title: data.title }),
			...(data.notes !== undefined && { notes: data.notes || null }),
			...(data.wizardStep !== undefined && { wizard_step: data.wizardStep }),
		}

		const { error: updateError } = await supabase.from("procurement_list").update(updateData).eq("id", data.draftId)
		if (updateError) throw new Error(`Erro ao atualizar rascunho: ${updateError.message}`)

		if (data.kitchenSelections !== undefined) {
			await supabase.from("procurement_list_kitchen").delete().eq("list_id", data.draftId)

			await Promise.all(
				data.kitchenSelections.map(async (ks) => {
					const allSels = [...ks.templateSelections, ...ks.eventSelections]
					if (allSels.length === 0) return

					const { data: ataKitchen, error: kitchenError } = await supabase
						.from("procurement_list_kitchen")
						.insert({ list_id: data.draftId, kitchen_id: ks.kitchenId, delivery_notes: ks.deliveryNotes || null })
						.select()
						.single()
					if (kitchenError) throw new Error(`Erro ao salvar cozinha: ${kitchenError.message}`)

					const selRows = allSels.map((s) => ({
						list_kitchen_id: ataKitchen.id,
						template_id: s.templateId,
						repetitions: s.repetitions,
					}))
					const { error: selError } = await supabase.from("procurement_list_selection").insert(selRows)
					if (selError) throw new Error(`Erro ao salvar seleções: ${selError.message}`)
				})
			)
		}
	})

// ─── Salvar itens calculados no rascunho (substitui todos) ───────────────────

const DraftItemSchema = z.object({
	ata_item_id: z.string().uuid().optional().nullable(), // presente em itens já persistidos
	ingredient_id: z.string().optional().nullable(),
	ingredient_name: z.string(),
	folder_id: z.string().optional().nullable(),
	folder_description: z.string().optional().nullable(),
	measure_unit: z.string().optional().nullable(),
	total_quantity: z.number(),
	purchase_item_id: z.string().optional().nullable(),
	purchase_item_description: z.string().optional().nullable(),
	purchase_measure_unit: z.string().optional().nullable(),
	purchase_quantity: z.number().optional().nullable(),
	conversion_factor: z.number().optional().nullable(),
	catmat_item_codigo: z.number().optional().nullable(),
	catmat_item_descricao: z.string().optional().nullable(),
	unit_price: z.number().optional().nullable(),
})

function buildItemPayload(item: z.infer<typeof DraftItemSchema>, draftId: string) {
	return {
		list_id: draftId,
		ingredient_id: item.ingredient_id || null,
		ingredient_name: item.ingredient_name,
		folder_id: item.folder_id || null,
		folder_description: item.folder_description || null,
		measure_unit: item.measure_unit || null,
		total_quantity: item.total_quantity,
		purchase_item_id: item.purchase_item_id || null,
		purchase_item_description: item.purchase_item_description || null,
		purchase_measure_unit: item.purchase_measure_unit || null,
		purchase_quantity: item.purchase_quantity || null,
		conversion_factor: item.conversion_factor || null,
		catmat_item_codigo: item.catmat_item_codigo || null,
		catmat_item_descricao: item.catmat_item_descricao || null,
		unit_price: item.unit_price || null,
	}
}

export const saveAtaDraftItemsFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			draftId: z.string().uuid(),
			items: z.array(DraftItemSchema),
			researchLinks: z
				.array(
					z.object({
						ingredientId: z.string(),
						researchId: z.string().uuid(),
						researchItemId: z.string().uuid(),
					})
				)
				.optional(),
		})
	)
	.handler(async ({ data }) => {
		await requireAuth()
		const supabase = getSupabaseServerClient()

		// Separar itens existentes (têm ata_item_id) dos novos
		const existing = data.items.filter((i) => i.ata_item_id)
		const toInsert = data.items.filter((i) => !i.ata_item_id)
		const keepIds = new Set(existing.map((i) => i.ata_item_id as string))

		// Deletar itens que não estão mais na lista
		const { data: currentItems } = await supabase.from("procurement_list_item").select("id").eq("list_id", data.draftId)
		const toDelete = (currentItems || []).filter((row) => !keepIds.has(row.id)).map((row) => row.id)
		if (toDelete.length > 0) {
			await supabase.from("procurement_list_item").delete().in("id", toDelete)
		}

		// Atualizar itens existentes (preserva IDs, logo preserva pesquisa_preco_item.ata_item_id)
		await Promise.all(
			existing.map((item) =>
				supabase
					.from("procurement_list_item")
					.update(buildItemPayload(item, data.draftId))
					.eq("id", item.ata_item_id as string)
			)
		)

		// Inserir itens novos
		const insertedItemsById = new Map<string, string>() // ingredient_id → new item id
		if (toInsert.length > 0) {
			const { data: insertedItems, error: itemsError } = await supabase
				.from("procurement_list_item")
				.insert(toInsert.map((item) => buildItemPayload(item, data.draftId)))
				.select("id, ingredient_id")
			if (itemsError) throw new Error(`Erro ao salvar itens: ${itemsError.message}`)
			for (const row of insertedItems || []) {
				if (row.ingredient_id) insertedItemsById.set(row.ingredient_id, row.id)
			}
		}

		// Linkar pesquisas de preço para itens novos (itens existentes já mantêm o link)
		if (data.researchLinks?.length && insertedItemsById.size > 0) {
			await Promise.all(
				data.researchLinks.map(async (link) => {
					const newItemId = insertedItemsById.get(link.ingredientId)
					if (!newItemId) return
					await Promise.all([
						supabase.schema("sisub").from("procurement_pesquisa_preco_item").update({ ata_item_id: newItemId }).eq("id", link.researchItemId),
						supabase.schema("sisub").from("procurement_pesquisa_preco").update({ ata_id: data.draftId }).eq("id", link.researchId),
					])
				})
			)
		}

		await supabase.from("procurement_list").update({ wizard_step: 4, updated_at: new Date().toISOString() }).eq("id", data.draftId)
	})

// ─── Finalizar rascunho (wizard_step → null, ata pronta para publicação) ──────

export const finalizeAtaDraftFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			draftId: z.string().uuid(),
			title: z.string().min(1),
			notes: z.string().optional(),
			items: z.array(DraftItemSchema),
			researchLinks: z
				.array(
					z.object({
						ingredientId: z.string(),
						researchId: z.string().uuid(),
						researchItemId: z.string().uuid(),
					})
				)
				.optional(),
		})
	)
	.handler(async ({ data }): Promise<ProcurementList> => {
		await requireAuth()
		const supabase = getSupabaseServerClient()

		// Mesma lógica do saveAtaDraftItemsFn: atualizar existentes, inserir novos, deletar removidos
		const existing = data.items.filter((i) => i.ata_item_id)
		const toInsert = data.items.filter((i) => !i.ata_item_id)
		const keepIds = new Set(existing.map((i) => i.ata_item_id as string))

		const { data: currentItems } = await supabase.from("procurement_list_item").select("id").eq("list_id", data.draftId)
		const toDelete = (currentItems || []).filter((row) => !keepIds.has(row.id)).map((row) => row.id)
		if (toDelete.length > 0) {
			await supabase.from("procurement_list_item").delete().in("id", toDelete)
		}

		await Promise.all(
			existing.map((item) =>
				supabase
					.from("procurement_list_item")
					.update(buildItemPayload(item, data.draftId))
					.eq("id", item.ata_item_id as string)
			)
		)

		const insertedItemsById = new Map<string, string>()
		if (toInsert.length > 0) {
			const { data: insertedItems, error: itemsError } = await supabase
				.from("procurement_list_item")
				.insert(toInsert.map((item) => buildItemPayload(item, data.draftId)))
				.select("id, ingredient_id")
			if (itemsError) throw new Error(`Erro ao salvar itens: ${itemsError.message}`)
			for (const row of insertedItems || []) {
				if (row.ingredient_id) insertedItemsById.set(row.ingredient_id, row.id)
			}
		}

		if (data.researchLinks?.length && insertedItemsById.size > 0) {
			await Promise.all(
				data.researchLinks.map(async (link) => {
					const newItemId = insertedItemsById.get(link.ingredientId)
					if (!newItemId) return
					await Promise.all([
						supabase.schema("sisub").from("procurement_pesquisa_preco_item").update({ ata_item_id: newItemId }).eq("id", link.researchItemId),
						supabase.schema("sisub").from("procurement_pesquisa_preco").update({ ata_id: data.draftId }).eq("id", link.researchId),
					])
				})
			)
		}

		const { data: ata, error } = await supabase
			.from("procurement_list")
			.update({ title: data.title, notes: data.notes || null, wizard_step: null, updated_at: new Date().toISOString() })
			.eq("id", data.draftId)
			.select()
			.single()
		if (error) throw new Error(`Erro ao finalizar ata: ${error.message}`)
		return ata
	})

// ─── Criar ATA (persiste tudo) ────────────────────────────────────────────────

/**
 * Persists a complete procurement list with its kitchen assignments, template selections and pre-calculated items across 4 tables.
 *
 * @remarks
 * SIDE EFFECTS: inserts procurement_list (1 row), procurement_list_kitchen (n), procurement_list_selection (m), procurement_list_item (p).
 * Steps are sequential — partial failure leaves orphaned rows (no DB transaction). Status defaults to "draft".
 *
 * @throws {Error} on any Supabase insert failure at any step.
 */
export const createAtaFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			unitId: z.number(),
			title: z.string().min(1),
			notes: z.string().optional(),
			kitchenSelections: z.array(KitchenSelectionSchema),
			items: z.array(
				z.object({
					ingredient_id: z.string().optional().nullable(),
					ingredient_name: z.string(),
					folder_id: z.string().optional().nullable(),
					folder_description: z.string().optional().nullable(),
					measure_unit: z.string().optional().nullable(),
					total_quantity: z.number(),
					// Purchase domain
					purchase_item_id: z.string().optional().nullable(),
					purchase_item_description: z.string().optional().nullable(),
					purchase_measure_unit: z.string().optional().nullable(),
					purchase_quantity: z.number().optional().nullable(),
					conversion_factor: z.number().optional().nullable(),
					catmat_item_codigo: z.number().optional().nullable(),
					catmat_item_descricao: z.string().optional().nullable(),
					unit_price: z.number().optional().nullable(),
				})
			),
			researchLinks: z
				.array(
					z.object({
						ingredientId: z.string(),
						researchId: z.string().uuid(),
						researchItemId: z.string().uuid(),
					})
				)
				.optional(),
		})
	)
	.handler(async ({ data }): Promise<ProcurementList> => {
		await requireAuth()
		const supabase = getSupabaseServerClient()
		const { unitId, title, notes, kitchenSelections, items } = data

		// 1. Criar lista de compras
		const { data: ata, error: ataError } = await supabase
			.from("procurement_list")
			.insert({ unit_id: unitId, title, notes: notes || null, status: "draft" })
			.select()
			.single()
		if (ataError) throw new Error(`Erro ao criar lista: ${ataError.message}`)

		// 2. Para cada cozinha com seleções, criar procurement_list_kitchen + selections
		await Promise.all(
			kitchenSelections.map(async (ks) => {
				const allSels = [...ks.templateSelections, ...ks.eventSelections]
				if (allSels.length === 0) return

				const { data: ataKitchen, error: kitchenError } = await supabase
					.from("procurement_list_kitchen")
					.insert({
						list_id: ata.id,
						kitchen_id: ks.kitchenId,
						delivery_notes: ks.deliveryNotes || null,
					})
					.select()
					.single()
				if (kitchenError) throw new Error(`Erro ao associar cozinha: ${kitchenError.message}`)

				if (allSels.length > 0) {
					const selectionRows = allSels.map((s) => ({
						list_kitchen_id: ataKitchen.id,
						template_id: s.templateId,
						repetitions: s.repetitions,
					}))
					const { error: selError } = await supabase.from("procurement_list_selection").insert(selectionRows)
					if (selError) throw new Error(`Erro ao salvar seleções: ${selError.message}`)
				}
			})
		)

		// 3. Inserir itens calculados
		if (items.length > 0) {
			const itemRows = items.map((item) => ({
				list_id: ata.id,
				ingredient_id: item.ingredient_id || null,
				ingredient_name: item.ingredient_name,
				folder_id: item.folder_id || null,
				folder_description: item.folder_description || null,
				measure_unit: item.measure_unit || null,
				total_quantity: item.total_quantity,
				// Purchase domain snapshots
				purchase_item_id: item.purchase_item_id || null,
				purchase_item_description: item.purchase_item_description || null,
				purchase_measure_unit: item.purchase_measure_unit || null,
				purchase_quantity: item.purchase_quantity || null,
				conversion_factor: item.conversion_factor || null,
				catmat_item_codigo: item.catmat_item_codigo || null,
				catmat_item_descricao: item.catmat_item_descricao || null,
				unit_price: item.unit_price || null,
			}))
			const { data: insertedItems, error: itemsError } = await supabase.from("procurement_list_item").insert(itemRows).select("id, ingredient_id")
			if (itemsError) throw new Error(`Erro ao salvar itens: ${itemsError.message}`)

			// 4. Linkar registros de auditoria de pesquisa de preços (se houver)
			if (data.researchLinks?.length && insertedItems?.length) {
				await Promise.all(
					data.researchLinks.map(async (link) => {
						const ataItem = insertedItems.find((i) => i.ingredient_id === link.ingredientId)
						if (!ataItem) return
						await Promise.all([
							supabase.schema("sisub").from("procurement_pesquisa_preco_item").update({ ata_item_id: ataItem.id }).eq("id", link.researchItemId),
							supabase.schema("sisub").from("procurement_pesquisa_preco").update({ ata_id: ata.id }).eq("id", link.researchId),
						])
					})
				)
			}
		}

		return ata
	})

// ─── Listar ATAs da unidade ───────────────────────────────────────────────────

/**
 * Lists all non-deleted ATAs for a unit, ordered by creation date descending.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchAtaListFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ unitId: z.number() }))
	.handler(async ({ data }): Promise<ProcurementList[]> => {
		const { data: lists, error } = await getSupabaseServerClient()
			.from("procurement_list")
			.select("*")
			.eq("unit_id", data.unitId)
			.is("deleted_at", null)
			.order("created_at", { ascending: false })

		if (error) throw new Error(`Erro ao buscar listas: ${error.message}`)
		return lists || []
	})

// ─── Buscar ATA com detalhes ──────────────────────────────────────────────────

/**
 * Fetches full ATA details including kitchens, template selections and calculated items. Returns null if ATA row not found.
 *
 * @remarks
 * Returns null only on missing ATA (ataError); kitchen/items failures still throw.
 *
 * @throws {Error} on kitchens or items query failure — NOT on missing ATA (returns null).
 */
export const fetchAtaDetailsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ ataId: z.string() }))
	.handler(async ({ data }): Promise<AtaWithDetails | null> => {
		const supabase = getSupabaseServerClient()

		const { data: ata, error: ataError } = await supabase.from("procurement_list").select("*").eq("id", data.ataId).single()
		if (ataError) return null

		const { data: kitchens, error: kitchensError } = await supabase
			.from("procurement_list_kitchen")
			.select(
				`
        *,
        kitchen:kitchen_id ( id, display_name ),
        selections:procurement_list_selection (
          *,
          template:template_id ( name, template_type )
        )
      `
			)
			.eq("list_id", data.ataId)

		if (kitchensError) throw new Error(`Erro ao buscar cozinhas: ${kitchensError.message}`)

		const { data: items, error: itemsError } = await supabase
			.from("procurement_list_item")
			.select("*")
			.eq("list_id", data.ataId)
			.order("folder_description", { nullsFirst: false })
			.order("ingredient_name")

		if (itemsError) throw new Error(`Erro ao buscar itens: ${itemsError.message}`)

		return { ...ata, kitchens: (kitchens ?? []) as unknown as AtaKitchenWithDetails[], items: items || [] }
	})

// ─── Atualizar status da ATA ──────────────────────────────────────────────────

/**
 * Transitions ATA status to "draft" | "published" | "archived" and stamps updated_at.
 *
 * @throws {Error} on Supabase update failure.
 */
export const updateAtaStatusFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			ataId: z.string(),
			status: z.enum(["draft", "published", "archived"]),
		})
	)
	.handler(async ({ data }) => {
		await requireAuth()
		const { error } = await getSupabaseServerClient()
			.from("procurement_list")
			.update({ status: data.status, updated_at: new Date().toISOString() })
			.eq("id", data.ataId)
		if (error) throw new Error(`Erro ao atualizar status: ${error.message}`)
	})

// ─── Atualizar preços de itens de uma ATA já salva ───────────────────────────

export const updateAtaItemPricesFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			ataId: z.string().uuid(),
			updates: z.array(
				z.object({
					ataItemId: z.string().uuid(),
					price: z.number().positive(),
				})
			),
			researchLinks: z
				.array(
					z.object({
						ataItemId: z.string().uuid(),
						researchId: z.string().uuid(),
						researchItemId: z.string().uuid(),
					})
				)
				.optional(),
		})
	)
	.handler(async ({ data }) => {
		await requireAuth()
		const supabase = getSupabaseServerClient()

		await Promise.all(data.updates.map((u) => supabase.from("procurement_list_item").update({ unit_price: u.price }).eq("id", u.ataItemId)))

		if (data.researchLinks?.length) {
			await Promise.all(
				data.researchLinks.flatMap((link) => [
					supabase.schema("sisub").from("procurement_pesquisa_preco_item").update({ ata_item_id: link.ataItemId }).eq("id", link.researchItemId),
					supabase.schema("sisub").from("procurement_pesquisa_preco").update({ ata_id: data.ataId }).eq("id", link.researchId),
				])
			)
		}
	})

// ─── Deletar ATA (soft delete) ────────────────────────────────────────────────

/**
 * Soft-deletes an ATA by setting deleted_at — kitchen associations and items remain intact.
 *
 * @throws {Error} on Supabase update failure.
 */
export const deleteAtaFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ ataId: z.string() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { error } = await getSupabaseServerClient().from("procurement_list").update({ deleted_at: new Date().toISOString() }).eq("id", data.ataId)
		if (error) throw new Error(`Erro ao deletar lista: ${error.message}`)
	})
