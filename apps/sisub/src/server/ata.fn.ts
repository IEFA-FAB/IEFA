/**
 * @module ata.fn
 * Procurement list lifecycle: needs calculation, creation, status transitions, soft-delete.
 * CLIENT: getSupabaseServerClient (service role) — all functions.
 * TABLES: procurement_list, procurement_list_kitchen, procurement_list_selection, procurement_list_item.
 */

import type { ProcurementList } from "@iefa/database/sisub"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { ProcurementNeed } from "@/services/ProcurementService"
import type { AtaWithDetails } from "@/types/domain/ata"

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
		const supabase = getSupabaseServerClient()
		const { kitchenSelections } = data

		// Coletar todos os IDs de template únicos (weekly + events)
		const allSelections = kitchenSelections.flatMap((ks) => [
			...ks.templateSelections.map((s) => ({ ...s, kitchenId: ks.kitchenId })),
			...ks.eventSelections.map((s) => ({ ...s, kitchenId: ks.kitchenId })),
		])

		if (allSelections.length === 0) return []

		const uniqueTemplateIds = [...new Set(allSelections.map((s) => s.templateId))]

		// Buscar templates com items → recipe → ingredients → ingredient (+ catmat, unit_price)
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
                catmat_item_codigo,
                catmat_item_descricao,
                unit_price,
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
				catmat_item_codigo: number | null
				catmat_item_descricao: string | null
				unit_price: number | null
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

		// Converter para array final
		const needs: ProcurementNeed[] = Array.from(needsMap.entries()).map(([ingredientId, d]) => {
			const unitPrice = d.ingredient.unit_price ?? null
			return {
				folder_id: d.ingredient.folder_id,
				folder_description: d.ingredient.folder?.description || null,
				ingredient_id: ingredientId,
				ingredient_name: d.ingredient.description || "",
				measure_unit: d.ingredient.measure_unit,
				total_quantity: Number(d.total_quantity.toFixed(4)),
				catmat_item_codigo: d.ingredient.catmat_item_codigo,
				catmat_item_descricao: d.ingredient.catmat_item_descricao,
				unit_price: unitPrice,
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
					catmat_item_codigo: z.number().optional().nullable(),
					catmat_item_descricao: z.string().optional().nullable(),
					ingredient_name: z.string(),
					folder_id: z.string().optional().nullable(),
					folder_description: z.string().optional().nullable(),
					measure_unit: z.string().optional().nullable(),
					total_quantity: z.number(),
					unit_price: z.number().optional().nullable(),
				})
			),
		})
	)
	.handler(async ({ data }): Promise<ProcurementList> => {
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
		for (const ks of kitchenSelections) {
			const allSels = [...ks.templateSelections, ...ks.eventSelections]
			if (allSels.length === 0) continue

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
		}

		// 3. Inserir itens calculados
		if (items.length > 0) {
			const itemRows = items.map((item) => ({
				list_id: ata.id,
				ingredient_id: item.ingredient_id || null,
				catmat_item_codigo: item.catmat_item_codigo || null,
				catmat_item_descricao: item.catmat_item_descricao || null,
				ingredient_name: item.ingredient_name,
				folder_id: item.folder_id || null,
				folder_description: item.folder_description || null,
				measure_unit: item.measure_unit || null,
				total_quantity: item.total_quantity,
				unit_price: item.unit_price || null,
			}))
			const { error: itemsError } = await supabase.from("procurement_list_item").insert(itemRows)
			if (itemsError) throw new Error(`Erro ao salvar itens: ${itemsError.message}`)
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

		// biome-ignore lint/suspicious/noExplicitAny: relation shape differs from generated types
		return { ...ata, kitchens: (kitchens as any) || [], items: items || [] }
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
		const { error } = await getSupabaseServerClient()
			.from("procurement_list")
			.update({ status: data.status, updated_at: new Date().toISOString() })
			.eq("id", data.ataId)
		if (error) throw new Error(`Erro ao atualizar status: ${error.message}`)
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
		const { error } = await getSupabaseServerClient().from("procurement_list").update({ deleted_at: new Date().toISOString() }).eq("id", data.ataId)
		if (error) throw new Error(`Erro ao deletar lista: ${error.message}`)
	})
