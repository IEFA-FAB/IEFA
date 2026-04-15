/**
 * @module ata.fn
 * Internal Procurement ATA (Ata de Registro de Preços) lifecycle: needs calculation, creation, status transitions, soft-delete.
 * CLIENT: getSupabaseServerClient (service role) — all functions.
 * TABLES: procurement_ata, procurement_ata_kitchen, procurement_ata_selection, procurement_ata_item.
 */

import type { ProcurementAta } from "@iefa/database/sisub"
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
 * Aggregates identical product_ids across all kitchenSelections (weekly + events combined).
 * Sorts result by folder_description → product_name (pt-BR collation).
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

		// Buscar templates com items → recipe → ingredients → product (+ catmat, unit_price)
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
              product_id,
              net_quantity,
              product:product_id (
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

		// Mapa de agregação por product_id
		type NeedAccumulator = {
			product: {
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

				const ingredients = recipeData.recipe_ingredients || []
				for (const ingredient of ingredients) {
					const productRaw = Array.isArray(ingredient.product) ? ingredient.product[0] : ingredient.product
					if (!productRaw || !ingredient.product_id) continue

					const folderRaw = Array.isArray(productRaw.folder) ? productRaw.folder[0] : productRaw.folder
					const product = { ...productRaw, folder: folderRaw }

					const quantityNeeded = (ingredient.net_quantity || 0) * portionMultiplier

					const existing = needsMap.get(ingredient.product_id)
					if (existing) {
						existing.total_quantity += quantityNeeded
					} else {
						needsMap.set(ingredient.product_id, { product, total_quantity: quantityNeeded })
					}
				}
			}
		}

		// Converter para array final
		const needs: ProcurementNeed[] = Array.from(needsMap.entries()).map(([productId, d]) => {
			const unitPrice = d.product.unit_price ?? null
			return {
				folder_id: d.product.folder_id,
				folder_description: d.product.folder?.description || null,
				product_id: productId,
				product_name: d.product.description || "",
				measure_unit: d.product.measure_unit,
				total_quantity: Number(d.total_quantity.toFixed(4)),
				catmat_item_codigo: d.product.catmat_item_codigo,
				catmat_item_descricao: d.product.catmat_item_descricao,
				unit_price: unitPrice,
				total_value: unitPrice !== null ? Number((d.total_quantity * unitPrice).toFixed(2)) : null,
			}
		})

		// Ordenar por categoria → produto
		needs.sort((a, b) => {
			const folderA = a.folder_description || "Sem categoria"
			const folderB = b.folder_description || "Sem categoria"
			if (folderA !== folderB) return folderA.localeCompare(folderB, "pt-BR")
			return a.product_name.localeCompare(b.product_name, "pt-BR")
		})

		return needs
	})

// ─── Criar ATA (persiste tudo) ────────────────────────────────────────────────

/**
 * Persists a complete ATA with its kitchen assignments, template selections and pre-calculated items across 4 tables.
 *
 * @remarks
 * SIDE EFFECTS: inserts procurement_ata (1 row), procurement_ata_kitchen (n), procurement_ata_selection (m), procurement_ata_item (p).
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
					product_id: z.string().optional().nullable(),
					catmat_item_codigo: z.number().optional().nullable(),
					catmat_item_descricao: z.string().optional().nullable(),
					product_name: z.string(),
					folder_id: z.string().optional().nullable(),
					folder_description: z.string().optional().nullable(),
					measure_unit: z.string().optional().nullable(),
					total_quantity: z.number(),
					unit_price: z.number().optional().nullable(),
					total_value: z.number().optional().nullable(),
				})
			),
		})
	)
	.handler(async ({ data }): Promise<ProcurementAta> => {
		const supabase = getSupabaseServerClient()
		const { unitId, title, notes, kitchenSelections, items } = data

		// 1. Criar ATA
		const { data: ata, error: ataError } = await supabase
			.from("procurement_ata")
			.insert({ unit_id: unitId, title, notes: notes || null, status: "draft" })
			.select()
			.single()
		if (ataError) throw new Error(`Erro ao criar ATA: ${ataError.message}`)

		// 2. Para cada cozinha com seleções, criar procurement_ata_kitchen + selections
		for (const ks of kitchenSelections) {
			const allSels = [...ks.templateSelections, ...ks.eventSelections]
			if (allSels.length === 0) continue

			const { data: ataKitchen, error: kitchenError } = await supabase
				.from("procurement_ata_kitchen")
				.insert({
					ata_id: ata.id,
					kitchen_id: ks.kitchenId,
					delivery_notes: ks.deliveryNotes || null,
				})
				.select()
				.single()
			if (kitchenError) throw new Error(`Erro ao associar cozinha: ${kitchenError.message}`)

			if (allSels.length > 0) {
				const selectionRows = allSels.map((s) => ({
					ata_kitchen_id: ataKitchen.id,
					template_id: s.templateId,
					repetitions: s.repetitions,
				}))
				const { error: selError } = await supabase.from("procurement_ata_selection").insert(selectionRows)
				if (selError) throw new Error(`Erro ao salvar seleções: ${selError.message}`)
			}
		}

		// 3. Inserir itens calculados
		if (items.length > 0) {
			const itemRows = items.map((item) => ({
				ata_id: ata.id,
				product_id: item.product_id || null,
				catmat_item_codigo: item.catmat_item_codigo || null,
				catmat_item_descricao: item.catmat_item_descricao || null,
				product_name: item.product_name,
				folder_id: item.folder_id || null,
				folder_description: item.folder_description || null,
				measure_unit: item.measure_unit || null,
				total_quantity: item.total_quantity,
				unit_price: item.unit_price || null,
				total_value: item.total_value || null,
			}))
			const { error: itemsError } = await supabase.from("procurement_ata_item").insert(itemRows)
			if (itemsError) throw new Error(`Erro ao salvar itens da ATA: ${itemsError.message}`)
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
	.handler(async ({ data }): Promise<ProcurementAta[]> => {
		const { data: atas, error } = await getSupabaseServerClient()
			.from("procurement_ata")
			.select("*")
			.eq("unit_id", data.unitId)
			.is("deleted_at", null)
			.order("created_at", { ascending: false })

		if (error) throw new Error(`Erro ao buscar ATAs: ${error.message}`)
		return atas || []
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

		const { data: ata, error: ataError } = await supabase.from("procurement_ata").select("*").eq("id", data.ataId).single()
		if (ataError) return null

		const { data: kitchens, error: kitchensError } = await supabase
			.from("procurement_ata_kitchen")
			.select(
				`
        *,
        kitchen:kitchen_id ( id, display_name ),
        selections:procurement_ata_selection (
          *,
          template:template_id ( name, template_type )
        )
      `
			)
			.eq("ata_id", data.ataId)

		if (kitchensError) throw new Error(`Erro ao buscar cozinhas da ATA: ${kitchensError.message}`)

		const { data: items, error: itemsError } = await supabase
			.from("procurement_ata_item")
			.select("*")
			.eq("ata_id", data.ataId)
			.order("folder_description", { nullsFirst: false })
			.order("product_name")

		if (itemsError) throw new Error(`Erro ao buscar itens da ATA: ${itemsError.message}`)

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
			.from("procurement_ata")
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
		const { error } = await getSupabaseServerClient().from("procurement_ata").update({ deleted_at: new Date().toISOString() }).eq("id", data.ataId)
		if (error) throw new Error(`Erro ao deletar ATA: ${error.message}`)
	})
