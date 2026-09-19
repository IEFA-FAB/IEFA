/**
 * Regressão happy-path — operations de ATA / procurement_list (@iefa/sisub-domain).
 * Maior arquivo do domínio (607 LOC). Congela o contrato ANTES da migração Drizzle:
 * defaults do draft, persistência multi-tabela + round-trip aninhado, ordenação,
 * soft-delete, transições de status e a agregação read-only de calculateAtaNeeds.
 *
 * Limpeza: procurement_list_* têm ON DELETE CASCADE em list_id/list_kitchen_id,
 * então rastrear o procurement_list (hard delete) limpa cozinhas, seleções e itens.
 */

import { procurementListInProcurement, type SisubDb } from "@iefa/database/drizzle/sisub"
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
	updateAtaItemPrices,
	updateAtaQuantityLimits,
	updateAtaStatus,
} from "@iefa/sisub-domain"
import { eq } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("ata operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("procurement_list")
		reachable = s.reachable
		if (s.client) client = s.client
		const url = getSisubDatabaseUrl()
		if (reachable && url) {
			const t = createSisubTestDb(url)
			db = t.db
			closeDb = t.close
		}
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	afterAll(async () => {
		await closeDb?.()
	})

	test("createAtaDraft cria com defaults (title 'Sem nome', status 'draft', wizard_step 1)", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const { id } = await createAtaDraft(db, ctx, { unitId })
		seeder.track("procurement_list", id)

		const details = await fetchAtaDetails(db, ctx, { ataId: id })
		expect(details).not.toBeNull()
		expect(details?.title).toBe("Sem nome")
		expect(details?.status).toBe("draft")
		expect(details?.wizard_step).toBe(1)
	})

	test("createAta persiste lista + cozinhas + seleções + itens; fetchAtaDetails faz round-trip aninhado", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const { id: kitchenId } = await seeder.seedKitchen({ unitId })
		const templateId = await seeder.seedTemplate({ kitchenId })
		const ingredientId = await seeder.seedIngredient()

		const ata = await createAta(db, ctx, {
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
					exceptionSelections: [],
				},
			],
			items: [{ ingredient_id: ingredientId, ingredient_name: "Arroz", folder_description: "Grãos", measure_unit: "KG", total_quantity: 12.5 }],
		})
		seeder.track("procurement_list", ata.id)

		const details = await fetchAtaDetails(db, ctx, { ataId: ata.id })
		expect(details?.kitchens).toHaveLength(1)
		expect(details?.kitchens[0].kitchen?.id).toBe(kitchenId)
		expect(details?.kitchens[0].selections).toHaveLength(1)
		expect(details?.kitchens[0].selections[0].template?.template_type).toBeDefined()
		expect(details?.items).toHaveLength(1)
		expect(details?.items[0].ingredient_name).toBe("Arroz")
		expect(Number(details?.items[0].total_quantity)).toBe(12.5)
	})

	test("fetchAtaList ordena por created_at desc e exclui soft-deleted; fetchAtaDetails de id inexistente → null", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const first = await createAtaDraft(db, ctx, { unitId })
		seeder.track("procurement_list", first.id)
		const second = await createAtaDraft(db, ctx, { unitId })
		seeder.track("procurement_list", second.id)

		const list = await fetchAtaList(db, ctx, { unitId })
		expect(list.findIndex((a) => a.id === second.id)).toBeLessThan(list.findIndex((a) => a.id === first.id))

		await deleteAta(db, ctx, { ataId: first.id }) // soft delete
		const after = await fetchAtaList(db, ctx, { unitId })
		expect(after.map((a) => a.id)).not.toContain(first.id)
		expect(after.map((a) => a.id)).toContain(second.id)

		expect(await fetchAtaDetails(db, ctx, { ataId: "00000000-0000-4000-8000-000000000000" })).toBeNull()
	})

	test("updateAtaStatus transiciona e updateAtaItemDescription persiste a descrição do item", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const ata = await createAta(db, ctx, {
			unitId,
			title: uid("[TEST] ATA "),
			kitchenSelections: [],
			items: [{ ingredient_name: "Feijão", total_quantity: 5 }],
		})
		seeder.track("procurement_list", ata.id)

		await updateAtaStatus(db, ctx, { ataId: ata.id, status: "published" })
		const detailsAfterStatus = await fetchAtaDetails(db, ctx, { ataId: ata.id })
		expect(detailsAfterStatus?.status).toBe("published")

		const item = detailsAfterStatus?.items[0]
		if (!item) throw new Error("esperava um item na ATA após createAta")
		await updateAtaItemDescription(db, ctx, { ataItemId: item.id, description: "marca X" })
		const reloaded = await fetchAtaDetails(db, ctx, { ataId: ata.id })
		expect(reloaded?.items[0].item_description).toBe("marca X")
	})

	test("updateAtaDraft substitui kitchenSelections (delete-all + re-insert)", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const { id: kitchenId } = await seeder.seedKitchen({ unitId })
		const templateA = await seeder.seedTemplate({ kitchenId })
		const templateB = await seeder.seedTemplate({ kitchenId })
		const { id: draftId } = await createAtaDraft(db, ctx, { unitId })
		seeder.track("procurement_list", draftId)

		const mkSel = (templateId: string, repetitions: number) => ({
			kitchenId,
			kitchenName: "K",
			deliveryNotes: "",
			templateSelections: [{ templateId, templateName: "T", repetitions }],
			eventSelections: [],
			exceptionSelections: [],
		})

		await updateAtaDraft(db, ctx, { draftId, kitchenSelections: [mkSel(templateA, 1)] })
		await updateAtaDraft(db, ctx, { draftId, title: "Renomeada", kitchenSelections: [mkSel(templateB, 3)] })

		const details = await fetchAtaDetails(db, ctx, { ataId: draftId })
		expect(details?.title).toBe("Renomeada")
		expect(details?.kitchens).toHaveLength(1)
		expect(details?.kitchens[0].selections).toHaveLength(1)
		expect(details?.kitchens[0].selections[0].template_id).toBe(templateB)
		expect(details?.kitchens[0].selections[0].repetitions).toBe(3)
	})

	test("saveAtaDraftItems insere itens novos, seta wizard_step 5 e retorna savedIds", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const ingredientId = await seeder.seedIngredient()
		const { id: draftId } = await createAtaDraft(db, ctx, { unitId })
		seeder.track("procurement_list", draftId)

		const { savedIds } = await saveAtaDraftItems(db, ctx, {
			draftId,
			items: [{ ingredient_id: ingredientId, ingredient_name: "Óleo", total_quantity: 3 }],
		})
		expect(savedIds).toHaveLength(1)
		expect(savedIds[0].ingredientId).toBe(ingredientId)
		expect(savedIds[0].ataItemId).toBeTruthy()

		const details = await fetchAtaDetails(db, ctx, { ataId: draftId })
		expect(details?.wizard_step).toBe(5)
		expect(details?.items).toHaveLength(1)
		expect(details?.items[0].ingredient_name).toBe("Óleo")
	})

	test("calculateAtaNeeds agrega net_quantity × (headcount/portion_yield) × repetitions", async () => {
		if (!reachable || !seeder || !db) return
		const { id: kitchenId } = await seeder.seedKitchen()
		const ingredientId = await seeder.seedIngredient({ measureUnit: "KG" })
		const recipeId = await seeder.seedRecipe({ kitchenId, portionYield: 100, ingredients: [{ ingredientId, netQuantity: 150 }] })
		const mealTypeId = await seeder.seedMealType({ kitchenId })
		const templateId = await seeder.seedTemplate({ kitchenId })
		await seeder.seedTemplateItem({ templateId, mealTypeId, recipeId, dayOfWeek: 1, headcountOverride: 200 })

		const needs = await calculateAtaNeeds(db, ctx, {
			kitchenSelections: [
				{
					kitchenId,
					kitchenName: "K",
					deliveryNotes: "",
					templateSelections: [{ templateId, templateName: "T", repetitions: 2 }],
					eventSelections: [],
					exceptionSelections: [],
				},
			],
		})

		const need = needs.find((n) => n.ingredient_id === ingredientId)
		expect(need).toBeDefined()
		// 150 × (200/100) × 2 = 600
		expect(need?.total_quantity).toBe(600)
		expect(need?.measure_unit).toBe("KG")
	})

	// ─── freeze-ata-snapshot-on-publish ──────────────────────────────────────────

	test("saveAtaDraftItems é rejeitado após a ATA sair do rascunho (ATA_NOT_DRAFT)", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const ata = await createAta(db, ctx, {
			unitId,
			title: uid("[TEST] ATA "),
			kitchenSelections: [],
			items: [{ ingredient_name: "Arroz", total_quantity: 10 }],
		})
		seeder.track("procurement_list", ata.id)
		await updateAtaStatus(db, ctx, { ataId: ata.id, status: "published" })

		await expect(saveAtaDraftItems(db, ctx, { draftId: ata.id, items: [{ ingredient_name: "Arroz", total_quantity: 99 }] })).rejects.toThrow(
			/imutáveis|ATA_NOT_DRAFT|published/i
		)
	})

	test("updateAtaStatus proíbe downgrade published → draft (INVALID_STATUS_TRANSITION)", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const ata = await createAta(db, ctx, { unitId, title: uid("[TEST] ATA "), kitchenSelections: [], items: [] })
		seeder.track("procurement_list", ata.id)
		await updateAtaStatus(db, ctx, { ataId: ata.id, status: "published" })

		await expect(updateAtaStatus(db, ctx, { ataId: ata.id, status: "draft" })).rejects.toThrow(/Transição inválida|INVALID_STATUS_TRANSITION/i)
	})

	test("publicar congela snapshot da composição; fetchAtaDetails.meta.snapshot reflete os itens", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const ata = await createAta(db, ctx, {
			unitId,
			title: uid("[TEST] ATA "),
			kitchenSelections: [],
			items: [
				{ ingredient_name: "Feijão", total_quantity: 5 },
				{ ingredient_name: "Sal", total_quantity: 2 },
			],
		})
		seeder.track("procurement_list", ata.id)

		// Rascunho: sem snapshot.
		const draftDetails = await fetchAtaDetails(db, ctx, { ataId: ata.id })
		expect(draftDetails?.meta.snapshot).toBeNull()

		await updateAtaStatus(db, ctx, { ataId: ata.id, status: "published" })
		const pubDetails = await fetchAtaDetails(db, ctx, { ataId: ata.id })
		expect(pubDetails?.meta.snapshot).not.toBeNull()
		expect(pubDetails?.meta.snapshot?.components).toHaveLength(2)
		expect(pubDetails?.meta.snapshot?.components.every((c) => c.snapshot_source === "native")).toBe(true)
	})

	test("createAta carimba computed_at nos itens (base do detector de defasagem)", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const ata = await createAta(db, ctx, {
			unitId,
			title: uid("[TEST] ATA "),
			kitchenSelections: [],
			items: [{ ingredient_name: "Açúcar", total_quantity: 4 }],
		})
		seeder.track("procurement_list", ata.id)

		const details = await fetchAtaDetails(db, ctx, { ataId: ata.id })
		expect(details?.items[0].computed_at).toBeTruthy()
		// Sem edição de cardápio posterior → não está defasado.
		expect(details?.meta.is_stale).toBe(false)
	})

	test("anexo: margem acima de 50% trava a publicação até a justificativa única da ata; o snapshot congela os limites", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const ata = await createAta(db, ctx, {
			unitId,
			title: uid("[TEST] ATA "),
			kitchenSelections: [],
			items: [
				{ ingredient_name: "Frango", total_quantity: 1200 },
				{ ingredient_name: "Alface", total_quantity: 520 },
			],
		})
		seeder.track("procurement_list", ata.id)

		const draft = await fetchAtaDetails(db, ctx, { ataId: ata.id })
		expect(draft?.max_margin_percent).toBe(20)
		const frango = draft?.items.find((i) => i.ingredient_name === "Frango")
		const alface = draft?.items.find((i) => i.ingredient_name === "Alface")
		if (!frango || !alface) throw new Error("itens não persistidos")

		await updateAtaQuantityLimits(db, ctx, {
			ataId: ata.id,
			items: [
				{ ataItemId: frango.id, maxMarginPercent: 60 },
				{ ataItemId: alface.id, deliveryCycle: "weekly", minOrderQuantity: 4 },
			],
		})

		await expect(updateAtaStatus(db, ctx, { ataId: ata.id, status: "published" })).rejects.toThrow(/justificativa/i)

		await updateAtaQuantityLimits(db, ctx, { ataId: ata.id, marginJustification: "Histórico de falha de entrega de proteína." })
		await updateAtaStatus(db, ctx, { ataId: ata.id, status: "published" })

		const published = await fetchAtaDetails(db, ctx, { ataId: ata.id })
		const frozen = published?.meta.snapshot?.components ?? []
		const frozenFrango = frozen.find((c) => c.ingredient_name === "Frango")
		const frozenAlface = frozen.find((c) => c.ingredient_name === "Alface")
		// 1200 × 1,6 = 1920; ciclo não gravado cai para mensal → 100/entrega → mínimo 50.
		expect(Number(frozenFrango?.max_quantity)).toBe(1920)
		expect(frozenFrango?.delivery_cycle).toBe("monthly")
		expect(Number(frozenFrango?.min_order_quantity)).toBe(50)
		// 520 × 1,2 = 624; semanal gravado; mínimo informado 4.
		expect(Number(frozenAlface?.max_quantity)).toBe(624)
		expect(frozenAlface?.delivery_cycle).toBe("weekly")
		expect(Number(frozenAlface?.min_order_quantity)).toBe(4)

		// Publicada: limites imutáveis.
		await expect(updateAtaQuantityLimits(db, ctx, { ataId: ata.id, maxMarginPercent: 30 })).rejects.toThrow(/ATA_NOT_DRAFT|imutáveis/i)

		// Arquivar não recongela: nem a margem da ata mudando por fora altera o documento publicado.
		await db.update(procurementListInProcurement).set({ maxMarginPercent: 90 }).where(eq(procurementListInProcurement.id, ata.id))
		await updateAtaStatus(db, ctx, { ataId: ata.id, status: "archived" })
		const archived = await fetchAtaDetails(db, ctx, { ataId: ata.id })
		const archivedAlface = archived?.meta.snapshot?.components.find((c) => c.ingredient_name === "Alface")
		expect(Number(archivedAlface?.max_quantity)).toBe(624)
		// ~15 idas ao banco (publicar, arquivar, reler): no runner do CI passa dos 15 s padrão.
	}, 60_000)

	test("anexo: item de outra ata não é atualizado pelo ajuste de limites", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const a = await createAta(db, ctx, { unitId, title: uid("[TEST] ATA "), kitchenSelections: [], items: [{ ingredient_name: "Arroz", total_quantity: 10 }] })
		seeder.track("procurement_list", a.id)
		const b = await createAta(db, ctx, { unitId, title: uid("[TEST] ATA "), kitchenSelections: [], items: [{ ingredient_name: "Feijão", total_quantity: 10 }] })
		seeder.track("procurement_list", b.id)
		const itemOfB = (await fetchAtaDetails(db, ctx, { ataId: b.id }))?.items[0]
		if (!itemOfB) throw new Error("item não persistido")

		await expect(updateAtaQuantityLimits(db, ctx, { ataId: a.id, items: [{ ataItemId: itemOfB.id, deliveryCycle: "weekly" }] })).rejects.toThrow(
			/não pertence/i
		)
		const after = (await fetchAtaDetails(db, ctx, { ataId: b.id }))?.items[0]
		expect(after?.delivery_cycle).toBeNull()
	})

	// ─── o que a ata CITA é conferido contra ela ─────────────────────────────────

	test("saveAtaDraftItems não sequestra item de outra ata (update amarrado ao list_id)", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const other = await createAta(db, ctx, {
			unitId,
			title: uid("[TEST] ATA "),
			kitchenSelections: [],
			items: [{ ingredient_name: "Feijão", total_quantity: 10 }],
		})
		seeder.track("procurement_list", other.id)
		const itemOfOther = (await fetchAtaDetails(db, ctx, { ataId: other.id }))?.items[0]
		if (!itemOfOther) throw new Error("item não persistido")
		const { id: draftId } = await createAtaDraft(db, ctx, { unitId })
		seeder.track("procurement_list", draftId)

		await expect(
			saveAtaDraftItems(db, ctx, { draftId, items: [{ ata_item_id: itemOfOther.id, ingredient_name: "Sequestro", total_quantity: 1 }] })
		).rejects.toThrow(/não pertence/i)
		const after = (await fetchAtaDetails(db, ctx, { ataId: other.id }))?.items[0]
		expect(after?.ingredient_name).toBe("Feijão")
	})

	test("updateAtaItemPrices não repreça item de outra ata", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const a = await createAta(db, ctx, { unitId, title: uid("[TEST] ATA "), kitchenSelections: [], items: [{ ingredient_name: "Arroz", total_quantity: 10 }] })
		seeder.track("procurement_list", a.id)
		const b = await createAta(db, ctx, { unitId, title: uid("[TEST] ATA "), kitchenSelections: [], items: [{ ingredient_name: "Feijão", total_quantity: 10 }] })
		seeder.track("procurement_list", b.id)
		const itemOfB = (await fetchAtaDetails(db, ctx, { ataId: b.id }))?.items[0]
		if (!itemOfB) throw new Error("item não persistido")

		await expect(updateAtaItemPrices(db, ctx, { ataId: a.id, updates: [{ ataItemId: itemOfB.id, price: 999 }] })).rejects.toThrow(/não pertence/i)
		expect((await fetchAtaDetails(db, ctx, { ataId: b.id }))?.items[0]?.unit_price).toBeNull()
	})

	test("createAta recusa cozinha de outra unidade e plano local de outra cozinha", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const { id: ownKitchen } = await seeder.seedKitchen({ unitId })
		const { id: foreignKitchen } = await seeder.seedKitchen()
		const foreignTemplate = await seeder.seedTemplate({ kitchenId: foreignKitchen })

		const selection = (kitchenId: number, templateId: string) => ({
			kitchenId,
			kitchenName: "K",
			deliveryNotes: "",
			templateSelections: [{ templateId, templateName: "T", repetitions: 1 }],
			eventSelections: [],
			exceptionSelections: [],
		})
		await expect(
			createAta(db, ctx, { unitId, title: uid("[TEST] ATA "), kitchenSelections: [selection(foreignKitchen, foreignTemplate)], items: [] })
		).rejects.toMatchObject({ code: "KITCHEN_NOT_IN_UNIT" })
		await expect(
			createAta(db, ctx, { unitId, title: uid("[TEST] ATA "), kitchenSelections: [selection(ownKitchen, foreignTemplate)], items: [] })
		).rejects.toMatchObject({ code: "TEMPLATE_ACCESS_DENIED" })
	})
})
