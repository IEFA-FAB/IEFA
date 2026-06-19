/**
 * Regressão happy-path — operations de ATA / procurement_list (@iefa/sisub-domain).
 * Maior arquivo do domínio (607 LOC). Congela o contrato ANTES da migração Drizzle:
 * defaults do draft, persistência multi-tabela + round-trip aninhado, ordenação,
 * soft-delete, transições de status e a agregação read-only de calculateAtaNeeds.
 *
 * Limpeza: procurement_list_* têm ON DELETE CASCADE em list_id/list_kitchen_id,
 * então rastrear o procurement_list (hard delete) limpa cozinhas, seleções e itens.
 */

import {
	calculateAtaNeeds,
	createAta,
	createAtaDraft,
	deleteAta,
	fetchAtaDetails,
	fetchAtaList,
	saveAtaDraftItems,
	updateAtaDraft,
	updateAtaItemDescription,
	updateAtaStatus,
} from "@iefa/sisub-domain"
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { describeSupabaseIntegration } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("ata operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null

	beforeAll(async () => {
		const s = await setupIntegration("procurement_list")
		reachable = s.reachable
		if (s.client) client = s.client
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	test("createAtaDraft cria com defaults (title 'Sem nome', status 'draft', wizard_step 1)", async () => {
		if (!reachable || !seeder) return
		const unitId = await seeder.seedUnit()
		const { id } = await createAtaDraft(client, ctx, { unitId })
		seeder.track("procurement_list", id)

		const details = await fetchAtaDetails(client, ctx, { ataId: id })
		expect(details).not.toBeNull()
		expect(details?.title).toBe("Sem nome")
		expect(details?.status).toBe("draft")
		expect(details?.wizard_step).toBe(1)
	})

	test("createAta persiste lista + cozinhas + seleções + itens; fetchAtaDetails faz round-trip aninhado", async () => {
		if (!reachable || !seeder) return
		const unitId = await seeder.seedUnit()
		const { id: kitchenId } = await seeder.seedKitchen({ unitId })
		const templateId = await seeder.seedTemplate({ kitchenId })
		const ingredientId = await seeder.seedIngredient()

		const ata = await createAta(client, ctx, {
			unitId,
			title: uid("[TEST] ATA "),
			notes: "obs",
			kitchenSelections: [
				{
					kitchenId,
					kitchenName: "K",
					deliveryNotes: "entregar cedo",
					templateSelections: [{ templateId, templateName: "T", repetitions: 2 }],
					eventSelections: [],
				},
			],
			items: [{ ingredient_id: ingredientId, ingredient_name: "Arroz", folder_description: "Grãos", measure_unit: "KG", total_quantity: 12.5 }],
		})
		seeder.track("procurement_list", ata.id)

		const details = await fetchAtaDetails(client, ctx, { ataId: ata.id })
		expect(details?.kitchens).toHaveLength(1)
		expect(details?.kitchens[0].kitchen?.id).toBe(kitchenId)
		expect(details?.kitchens[0].selections).toHaveLength(1)
		expect(details?.kitchens[0].selections[0].template?.template_type).toBeDefined()
		expect(details?.items).toHaveLength(1)
		expect(details?.items[0].ingredient_name).toBe("Arroz")
		expect(Number(details?.items[0].total_quantity)).toBe(12.5)
	})

	test("fetchAtaList ordena por created_at desc e exclui soft-deleted; fetchAtaDetails de id inexistente → null", async () => {
		if (!reachable || !seeder) return
		const unitId = await seeder.seedUnit()
		const first = await createAtaDraft(client, ctx, { unitId })
		seeder.track("procurement_list", first.id)
		const second = await createAtaDraft(client, ctx, { unitId })
		seeder.track("procurement_list", second.id)

		const list = await fetchAtaList(client, ctx, { unitId })
		expect(list.findIndex((a) => a.id === second.id)).toBeLessThan(list.findIndex((a) => a.id === first.id))

		await deleteAta(client, ctx, { ataId: first.id }) // soft delete
		const after = await fetchAtaList(client, ctx, { unitId })
		expect(after.map((a) => a.id)).not.toContain(first.id)
		expect(after.map((a) => a.id)).toContain(second.id)

		expect(await fetchAtaDetails(client, ctx, { ataId: "00000000-0000-4000-8000-000000000000" })).toBeNull()
	})

	test("updateAtaStatus transiciona e updateAtaItemDescription persiste a descrição do item", async () => {
		if (!reachable || !seeder) return
		const unitId = await seeder.seedUnit()
		const ata = await createAta(client, ctx, {
			unitId,
			title: uid("[TEST] ATA "),
			kitchenSelections: [],
			items: [{ ingredient_name: "Feijão", total_quantity: 5 }],
		})
		seeder.track("procurement_list", ata.id)

		await updateAtaStatus(client, ctx, { ataId: ata.id, status: "published" })
		const detailsAfterStatus = await fetchAtaDetails(client, ctx, { ataId: ata.id })
		expect(detailsAfterStatus?.status).toBe("published")

		const item = detailsAfterStatus?.items[0]
		if (!item) throw new Error("esperava um item na ATA após createAta")
		await updateAtaItemDescription(client, ctx, { ataItemId: item.id, description: "marca X" })
		const reloaded = await fetchAtaDetails(client, ctx, { ataId: ata.id })
		expect(reloaded?.items[0].item_description).toBe("marca X")
	})

	test("updateAtaDraft substitui kitchenSelections (delete-all + re-insert)", async () => {
		if (!reachable || !seeder) return
		const unitId = await seeder.seedUnit()
		const { id: kitchenId } = await seeder.seedKitchen({ unitId })
		const templateA = await seeder.seedTemplate({ kitchenId })
		const templateB = await seeder.seedTemplate({ kitchenId })
		const { id: draftId } = await createAtaDraft(client, ctx, { unitId })
		seeder.track("procurement_list", draftId)

		const mkSel = (templateId: string, repetitions: number) => ({
			kitchenId,
			kitchenName: "K",
			deliveryNotes: "",
			templateSelections: [{ templateId, templateName: "T", repetitions }],
			eventSelections: [],
		})

		await updateAtaDraft(client, ctx, { draftId, kitchenSelections: [mkSel(templateA, 1)] })
		await updateAtaDraft(client, ctx, { draftId, title: "Renomeada", kitchenSelections: [mkSel(templateB, 3)] })

		const details = await fetchAtaDetails(client, ctx, { ataId: draftId })
		expect(details?.title).toBe("Renomeada")
		expect(details?.kitchens).toHaveLength(1)
		expect(details?.kitchens[0].selections).toHaveLength(1)
		expect(details?.kitchens[0].selections[0].template_id).toBe(templateB)
		expect(details?.kitchens[0].selections[0].repetitions).toBe(3)
	})

	test("saveAtaDraftItems insere itens novos, seta wizard_step 4 e retorna savedIds", async () => {
		if (!reachable || !seeder) return
		const unitId = await seeder.seedUnit()
		const ingredientId = await seeder.seedIngredient()
		const { id: draftId } = await createAtaDraft(client, ctx, { unitId })
		seeder.track("procurement_list", draftId)

		const { savedIds } = await saveAtaDraftItems(client, ctx, {
			draftId,
			items: [{ ingredient_id: ingredientId, ingredient_name: "Óleo", total_quantity: 3 }],
		})
		expect(savedIds).toHaveLength(1)
		expect(savedIds[0].ingredientId).toBe(ingredientId)
		expect(savedIds[0].ataItemId).toBeTruthy()

		const details = await fetchAtaDetails(client, ctx, { ataId: draftId })
		expect(details?.wizard_step).toBe(4)
		expect(details?.items).toHaveLength(1)
		expect(details?.items[0].ingredient_name).toBe("Óleo")
	})

	test("calculateAtaNeeds agrega net_quantity × (headcount/portion_yield) × repetitions", async () => {
		if (!reachable || !seeder) return
		const { id: kitchenId } = await seeder.seedKitchen()
		const ingredientId = await seeder.seedIngredient({ measureUnit: "KG" })
		const recipeId = await seeder.seedRecipe({ kitchenId, portionYield: 100, ingredients: [{ ingredientId, netQuantity: 150 }] })
		const mealTypeId = await seeder.seedMealType({ kitchenId })
		const templateId = await seeder.seedTemplate({ kitchenId })
		await seeder.seedTemplateItem({ templateId, mealTypeId, recipeId, dayOfWeek: 1, headcountOverride: 200 })

		const needs = await calculateAtaNeeds(client, ctx, {
			kitchenSelections: [
				{
					kitchenId,
					kitchenName: "K",
					deliveryNotes: "",
					templateSelections: [{ templateId, templateName: "T", repetitions: 2 }],
					eventSelections: [],
				},
			],
		})

		const need = needs.find((n) => n.ingredient_id === ingredientId)
		expect(need).toBeDefined()
		// 150 × (200/100) × 2 = 600
		expect(need?.total_quantity).toBe(600)
		expect(need?.measure_unit).toBe("KG")
	})
})
