/**
 * Regressão happy-path — operations de anexo / quantity_estimate (@iefa/sisub-domain).
 * Maior arquivo do domínio (607 LOC). Congela o contrato ANTES da migração Drizzle:
 * defaults do draft, persistência multi-tabela + round-trip aninhado, ordenação,
 * soft-delete, transições de status e a agregação read-only de calculateQuantityEstimateNeeds.
 *
 * Limpeza: quantity_estimate_* têm ON DELETE CASCADE em quantity_estimate_id/quantity_estimate_kitchen_id,
 * então rastrear o quantity_estimate (hard delete) limpa cozinhas, seleções e itens.
 */

import { randomUUID } from "node:crypto"
import {
	procurementPesquisaPrecoInProcurement,
	procurementPesquisaPrecoItemInProcurement,
	quantityEstimateInProcurement,
	quantityEstimateItemInProcurement,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import {
	calculateQuantityEstimateNeeds,
	createQuantityEstimate,
	createQuantityEstimateDraft,
	deleteQuantityEstimate,
	fetchQuantityEstimateDetails,
	fetchQuantityEstimateList,
	saveQuantityEstimateDraftItems,
	updateQuantityEstimateDraft,
	updateQuantityEstimateItemDescription,
	updateQuantityEstimateItemPrices,
	updateQuantityEstimateLimits,
	updateQuantityEstimateStatus,
} from "@iefa/sisub-domain"
import { agentGetQuantityEstimate, agentListQuantityEstimates, agentUpdateQuantityEstimateStatus } from "@iefa/sisub-domain/agent"
import { eq } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("anexo operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("quantity_estimate")
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

	test("createQuantityEstimateDraft cria com defaults (title 'Sem nome', status 'draft', wizard_step 1)", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const { id } = await createQuantityEstimateDraft(db, ctx, { unitId })
		seeder.track("quantity_estimate", id)

		const details = await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: id })
		expect(details).not.toBeNull()
		expect(details?.title).toBe("Sem nome")
		expect(details?.status).toBe("draft")
		expect(details?.wizard_step).toBe(1)
	})

	test("createQuantityEstimate persiste anexo + cozinhas + seleções + itens; fetchQuantityEstimateDetails faz round-trip aninhado", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const { id: kitchenId } = await seeder.seedKitchen({ unitId })
		const templateId = await seeder.seedTemplate({ kitchenId })
		const ingredientId = await seeder.seedIngredient()

		const quantityEstimate = await createQuantityEstimate(db, ctx, {
			unitId,
			title: uid("[TEST] anexo "),
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
			items: [{ ingredient_id: ingredientId, ingredient_name: "Arroz", folder_description: "Grãos", measure_unit: "KG", estimated_quantity: 12.5 }],
		})
		seeder.track("quantity_estimate", quantityEstimate.id)

		const details = await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: quantityEstimate.id })
		expect(details?.kitchens).toHaveLength(1)
		expect(details?.kitchens[0].kitchen?.id).toBe(kitchenId)
		expect(details?.kitchens[0].selections).toHaveLength(1)
		expect(details?.kitchens[0].selections[0].template?.template_type).toBeDefined()
		expect(details?.items).toHaveLength(1)
		expect(details?.items[0].ingredient_name).toBe("Arroz")
		expect(Number(details?.items[0].estimated_quantity)).toBe(12.5)
	})

	test("fetchQuantityEstimateList ordena por created_at desc e exclui soft-deleted; fetchQuantityEstimateDetails de id inexistente → null", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const first = await createQuantityEstimateDraft(db, ctx, { unitId })
		seeder.track("quantity_estimate", first.id)
		const second = await createQuantityEstimateDraft(db, ctx, { unitId })
		seeder.track("quantity_estimate", second.id)

		const list = await fetchQuantityEstimateList(db, ctx, { unitId })
		expect(list.findIndex((a) => a.id === second.id)).toBeLessThan(list.findIndex((a) => a.id === first.id))

		await deleteQuantityEstimate(db, ctx, { quantityEstimateId: first.id }) // soft delete
		const after = await fetchQuantityEstimateList(db, ctx, { unitId })
		expect(after.map((a) => a.id)).not.toContain(first.id)
		expect(after.map((a) => a.id)).toContain(second.id)

		expect(await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: "00000000-0000-4000-8000-000000000000" })).toBeNull()
	})

	// ─── leituras e escrita do agente (tools do chat) ──────────────────────────
	test("agentListQuantityEstimates: filtra status no banco, pagina com total e deixa a lixeira de fora", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const make = async (title: string) => {
			const created = await createQuantityEstimate(db as SisubDb, ctx, { unitId, title: uid(title), kitchenSelections: [], items: [] })
			seeder?.track("quantity_estimate", created.id)
			return created.id
		}
		const completedId = await make("[TEST] anexo concluído ")
		await updateQuantityEstimateStatus(db, ctx, { quantityEstimateId: completedId, status: "completed" })
		const draftId = await make("[TEST] anexo rascunho ")
		const trashedId = await make("[TEST] anexo na lixeira ")
		await deleteQuantityEstimate(db, ctx, { quantityEstimateId: trashedId })

		const all = await agentListQuantityEstimates(db, ctx, { unitId, limit: 1 })
		expect(all).toMatchObject({ returned: 1, total: 2, limit: 1 })
		expect(all.items[0]?.id).toBe(draftId) // o mais recente primeiro

		const completed = await agentListQuantityEstimates(db, ctx, { unitId, status: "completed" })
		expect(completed.items.map((i) => [i.id, i.status])).toEqual([[completedId, "completed"]])
		expect(completed.total).toBe(1)

		// Quem só tem o analytics local da unidade também lê; outra unidade, não.
		const analytics = { ...ctx, permissions: [{ module: "local-analytics" as const, level: 1, unit_id: unitId, kitchen_id: null, mess_hall_id: null }] }
		expect((await agentListQuantityEstimates(db, analytics, { unitId })).total).toBe(2)
		await expect(agentListQuantityEstimates(db, analytics, { unitId: unitId + 1 })).rejects.toThrow()
	})

	test("agentGetQuantityEstimate projeta os itens, filtra por nome e confere a unidade pela linha", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const quantityEstimate = await createQuantityEstimate(db, ctx, {
			unitId,
			title: uid("[TEST] anexo "),
			kitchenSelections: [],
			items: [
				{ ingredient_name: "Arroz polido", measure_unit: "KG", estimated_quantity: 10 },
				{ ingredient_name: "Feijão preto", measure_unit: "KG", estimated_quantity: 5 },
				{ ingredient_name: "ARROZ parboilizado", measure_unit: "KG", estimated_quantity: 3 },
			],
		})
		seeder.track("quantity_estimate", quantityEstimate.id)

		const detail = await agentGetQuantityEstimate(db, ctx, { quantityEstimateId: quantityEstimate.id, itemSearch: "arroz", limit: 1 })
		expect(detail).toMatchObject({ id: quantityEstimate.id, status: "draft", items_returned: 1, items_matched: 2, items_total: 3, items_limit: 1 })
		expect(Object.keys(detail.items[0] ?? {}).sort()).toEqual(
			[
				"catmat_item_codigo",
				"delivery_cycle",
				"estimated_quantity",
				"id",
				"ingredient_id",
				"ingredient_name",
				"max_increase_percent",
				"measure_unit",
				"purchase_measure_unit",
				"purchase_quantity",
				"unit_price",
			].sort()
		)

		const otherUnit = { ...ctx, permissions: [{ module: "unit" as const, level: 3, unit_id: unitId + 1, kitchen_id: null, mess_hall_id: null }] }
		await expect(agentGetQuantityEstimate(db, otherUnit, { quantityEstimateId: quantityEstimate.id })).rejects.toThrow()
		await expect(agentGetQuantityEstimate(db, ctx, { quantityEstimateId: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow(/não encontrado/)
	})

	test("agentUpdateQuantityEstimateStatus não conclui anexo ainda no wizard, mas arquiva", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const { id } = await createQuantityEstimateDraft(db, ctx, { unitId })
		seeder.track("quantity_estimate", id)

		await expect(agentUpdateQuantityEstimateStatus(db, ctx, { quantityEstimateId: id, status: "completed" })).rejects.toMatchObject({
			code: "QUANTITY_ESTIMATE_IN_WIZARD",
		})
		await agentUpdateQuantityEstimateStatus(db, ctx, { quantityEstimateId: id, status: "archived" })
		expect((await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: id }))?.status).toBe("archived")
	})

	test("updateQuantityEstimateStatus transiciona e updateQuantityEstimateItemDescription persiste a descrição do item", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const quantityEstimate = await createQuantityEstimate(db, ctx, {
			unitId,
			title: uid("[TEST] anexo "),
			kitchenSelections: [],
			items: [{ ingredient_name: "Feijão", estimated_quantity: 5 }],
		})
		seeder.track("quantity_estimate", quantityEstimate.id)

		await updateQuantityEstimateStatus(db, ctx, { quantityEstimateId: quantityEstimate.id, status: "completed" })
		const detailsAfterStatus = await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: quantityEstimate.id })
		expect(detailsAfterStatus?.status).toBe("completed")

		const item = detailsAfterStatus?.items[0]
		if (!item) throw new Error("esperava um item no anexo após createQuantityEstimate")
		await updateQuantityEstimateItemDescription(db, ctx, { quantityEstimateItemId: item.id, description: "marca X" })
		const reloaded = await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: quantityEstimate.id })
		expect(reloaded?.items[0].item_description).toBe("marca X")
	})

	test("updateQuantityEstimateDraft substitui kitchenSelections (delete-all + re-insert)", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const { id: kitchenId } = await seeder.seedKitchen({ unitId })
		const templateA = await seeder.seedTemplate({ kitchenId })
		const templateB = await seeder.seedTemplate({ kitchenId })
		const { id: draftId } = await createQuantityEstimateDraft(db, ctx, { unitId })
		seeder.track("quantity_estimate", draftId)

		const mkSel = (templateId: string, repetitions: number) => ({
			kitchenId,
			kitchenName: "K",
			deliveryNotes: "",
			templateSelections: [{ templateId, templateName: "T", repetitions }],
			eventSelections: [],
			exceptionSelections: [],
		})

		await updateQuantityEstimateDraft(db, ctx, { draftId, kitchenSelections: [mkSel(templateA, 1)] })
		await updateQuantityEstimateDraft(db, ctx, { draftId, title: "Renomeada", kitchenSelections: [mkSel(templateB, 3)] })

		const details = await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: draftId })
		expect(details?.title).toBe("Renomeada")
		expect(details?.kitchens).toHaveLength(1)
		expect(details?.kitchens[0].selections).toHaveLength(1)
		expect(details?.kitchens[0].selections[0].template_id).toBe(templateB)
		expect(details?.kitchens[0].selections[0].repetitions).toBe(3)
	})

	test("saveQuantityEstimateDraftItems insere itens novos, seta wizard_step 5 e retorna savedIds", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const ingredientId = await seeder.seedIngredient()
		const { id: draftId } = await createQuantityEstimateDraft(db, ctx, { unitId })
		seeder.track("quantity_estimate", draftId)

		const { savedIds } = await saveQuantityEstimateDraftItems(db, ctx, {
			draftId,
			items: [{ ingredient_id: ingredientId, ingredient_name: "Óleo", estimated_quantity: 3 }],
		})
		expect(savedIds).toHaveLength(1)
		expect(savedIds[0].ingredientId).toBe(ingredientId)
		expect(savedIds[0].quantityEstimateItemId).toBeTruthy()

		const details = await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: draftId })
		expect(details?.wizard_step).toBe(5)
		expect(details?.items).toHaveLength(1)
		expect(details?.items[0].ingredient_name).toBe("Óleo")
	})

	// 20260926213000: `folder_id` virou uuid com FK para kitchen.folder, e a unidade do item do
	// anexo sai no formato do código do catálogo (a FK de unidade vem no contract).
	test("saveQuantityEstimateDraftItems grava a pasta como uuid com FK e a unidade como código do catálogo", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const folderId = await seeder.seedFolder()
		const ingredientId = await seeder.seedIngredient({ folderId })
		const { id: draftId } = await createQuantityEstimateDraft(db, ctx, { unitId })
		seeder.track("quantity_estimate", draftId)

		await saveQuantityEstimateDraftItems(db, ctx, {
			draftId,
			items: [
				{
					ingredient_id: ingredientId,
					ingredient_name: "Arroz",
					folder_id: folderId,
					folder_description: "Grãos",
					measure_unit: " kg ",
					estimated_quantity: 3,
				},
			],
		})
		const rows = await db
			.select({ folderId: quantityEstimateItemInProcurement.folderId, measureUnit: quantityEstimateItemInProcurement.measureUnit })
			.from(quantityEstimateItemInProcurement)
			.where(eq(quantityEstimateItemInProcurement.quantityEstimateId, draftId))
		expect(rows).toEqual([{ folderId, measureUnit: "KG" }])

		// Pasta que não existe: a FK recusa o save inteiro em vez de gravar um vínculo órfão.
		await expect(
			saveQuantityEstimateDraftItems(db, ctx, {
				draftId,
				items: [{ ingredient_name: "Sal", folder_id: randomUUID(), measure_unit: "", estimated_quantity: 1 }],
			})
		).rejects.toThrow()
	})

	test("calculateQuantityEstimateNeeds agrega net_quantity × (headcount/portion_yield) × repetitions", async () => {
		if (!reachable || !seeder || !db) return
		const { id: kitchenId } = await seeder.seedKitchen()
		const ingredientId = await seeder.seedIngredient({ measureUnit: "KG" })
		const recipeId = await seeder.seedRecipe({ kitchenId, portionYield: 100, ingredients: [{ ingredientId, netQuantity: 150 }] })
		const mealTypeId = await seeder.seedMealType({ kitchenId })
		const templateId = await seeder.seedTemplate({ kitchenId })
		await seeder.seedTemplateItem({ templateId, mealTypeId, recipeId, dayOfWeek: 1, headcountOverride: 200 })

		const needs = await calculateQuantityEstimateNeeds(db, ctx, {
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
		expect(need?.estimated_quantity).toBe(600)
		expect(need?.measure_unit).toBe("KG")
	})

	// ─── freeze-ata-snapshot-on-publish ──────────────────────────────────────────

	test("saveQuantityEstimateDraftItems é rejeitado após o anexo sair do rascunho (QUANTITY_ESTIMATE_NOT_DRAFT)", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const quantityEstimate = await createQuantityEstimate(db, ctx, {
			unitId,
			title: uid("[TEST] anexo "),
			kitchenSelections: [],
			items: [{ ingredient_name: "Arroz", estimated_quantity: 10 }],
		})
		seeder.track("quantity_estimate", quantityEstimate.id)
		await updateQuantityEstimateStatus(db, ctx, { quantityEstimateId: quantityEstimate.id, status: "completed" })

		await expect(
			saveQuantityEstimateDraftItems(db, ctx, { draftId: quantityEstimate.id, items: [{ ingredient_name: "Arroz", estimated_quantity: 99 }] })
		).rejects.toThrow(/imutáveis|QUANTITY_ESTIMATE_NOT_DRAFT|concluído/i)
	})

	test("updateQuantityEstimateStatus proíbe downgrade completed → draft (INVALID_STATUS_TRANSITION)", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const quantityEstimate = await createQuantityEstimate(db, ctx, { unitId, title: uid("[TEST] anexo "), kitchenSelections: [], items: [] })
		seeder.track("quantity_estimate", quantityEstimate.id)
		await updateQuantityEstimateStatus(db, ctx, { quantityEstimateId: quantityEstimate.id, status: "completed" })

		await expect(updateQuantityEstimateStatus(db, ctx, { quantityEstimateId: quantityEstimate.id, status: "draft" })).rejects.toThrow(
			/Transição inválida|INVALID_STATUS_TRANSITION/i
		)
	})

	test("concluir congela snapshot da composição; fetchQuantityEstimateDetails.meta.snapshot reflete os itens", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const quantityEstimate = await createQuantityEstimate(db, ctx, {
			unitId,
			title: uid("[TEST] anexo "),
			kitchenSelections: [],
			items: [
				{ ingredient_name: "Feijão", estimated_quantity: 5 },
				{ ingredient_name: "Sal", estimated_quantity: 2 },
			],
		})
		seeder.track("quantity_estimate", quantityEstimate.id)

		// Rascunho: sem snapshot.
		const draftDetails = await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: quantityEstimate.id })
		expect(draftDetails?.meta.snapshot).toBeNull()

		await updateQuantityEstimateStatus(db, ctx, { quantityEstimateId: quantityEstimate.id, status: "completed" })
		const pubDetails = await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: quantityEstimate.id })
		expect(pubDetails?.meta.snapshot).not.toBeNull()
		expect(pubDetails?.meta.snapshot?.components).toHaveLength(2)
		expect(pubDetails?.meta.snapshot?.components.every((c) => c.snapshot_source === "native")).toBe(true)
	})

	test("createQuantityEstimate carimba computed_at nos itens (base do detector de defasagem)", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const quantityEstimate = await createQuantityEstimate(db, ctx, {
			unitId,
			title: uid("[TEST] anexo "),
			kitchenSelections: [],
			items: [{ ingredient_name: "Açúcar", estimated_quantity: 4 }],
		})
		seeder.track("quantity_estimate", quantityEstimate.id)

		const details = await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: quantityEstimate.id })
		expect(details?.items[0].computed_at).toBeTruthy()
		// Sem edição de cardápio posterior → não está defasado.
		expect(details?.meta.is_stale).toBe(false)
	})

	test("anexo: acréscimo acima de 50% trava a conclusão até a justificativa única do anexo; o snapshot congela os limites", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const quantityEstimate = await createQuantityEstimate(db, ctx, {
			unitId,
			title: uid("[TEST] anexo "),
			kitchenSelections: [],
			items: [
				{ ingredient_name: "Frango", estimated_quantity: 1200 },
				{ ingredient_name: "Alface", estimated_quantity: 520 },
			],
		})
		seeder.track("quantity_estimate", quantityEstimate.id)

		const draft = await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: quantityEstimate.id })
		expect(draft?.max_increase_percent).toBe(20)
		const frango = draft?.items.find((i) => i.ingredient_name === "Frango")
		const alface = draft?.items.find((i) => i.ingredient_name === "Alface")
		if (!frango || !alface) throw new Error("itens não persistidos")

		await updateQuantityEstimateLimits(db, ctx, {
			quantityEstimateId: quantityEstimate.id,
			items: [
				{ quantityEstimateItemId: frango.id, maxIncreasePercent: 60 },
				{ quantityEstimateItemId: alface.id, deliveryCycle: "weekly", minOrderQuantity: 4 },
			],
		})

		await expect(updateQuantityEstimateStatus(db, ctx, { quantityEstimateId: quantityEstimate.id, status: "completed" })).rejects.toThrow(/justificativa/i)

		await updateQuantityEstimateLimits(db, ctx, {
			quantityEstimateId: quantityEstimate.id,
			maxQuantityJustification: "Histórico de falha de entrega de proteína.",
		})
		await updateQuantityEstimateStatus(db, ctx, { quantityEstimateId: quantityEstimate.id, status: "completed" })

		const published = await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: quantityEstimate.id })
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

		// Concluída: limites imutáveis.
		await expect(updateQuantityEstimateLimits(db, ctx, { quantityEstimateId: quantityEstimate.id, maxIncreasePercent: 30 })).rejects.toThrow(
			/ATA_NOT_DRAFT|imutáveis/i
		)

		// Arquivar não recongela: nem o acréscimo do anexo mudando por fora altera o documento concluído.
		await db.update(quantityEstimateInProcurement).set({ maxIncreasePercent: 90 }).where(eq(quantityEstimateInProcurement.id, quantityEstimate.id))
		await updateQuantityEstimateStatus(db, ctx, { quantityEstimateId: quantityEstimate.id, status: "archived" })
		const archived = await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: quantityEstimate.id })
		const archivedAlface = archived?.meta.snapshot?.components.find((c) => c.ingredient_name === "Alface")
		expect(Number(archivedAlface?.max_quantity)).toBe(624)
		// ~15 idas ao banco (concluir, arquivar, reler): no runner do CI passa dos 15 s padrão.
	}, 60_000)

	test("anexo: item de outro anexo não é atualizado pelo ajuste de limites", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const a = await createQuantityEstimate(db, ctx, {
			unitId,
			title: uid("[TEST] anexo "),
			kitchenSelections: [],
			items: [{ ingredient_name: "Arroz", estimated_quantity: 10 }],
		})
		seeder.track("quantity_estimate", a.id)
		const b = await createQuantityEstimate(db, ctx, {
			unitId,
			title: uid("[TEST] anexo "),
			kitchenSelections: [],
			items: [{ ingredient_name: "Feijão", estimated_quantity: 10 }],
		})
		seeder.track("quantity_estimate", b.id)
		const itemOfB = (await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: b.id }))?.items[0]
		if (!itemOfB) throw new Error("item não persistido")

		await expect(
			updateQuantityEstimateLimits(db, ctx, { quantityEstimateId: a.id, items: [{ quantityEstimateItemId: itemOfB.id, deliveryCycle: "weekly" }] })
		).rejects.toThrow(/não pertence/i)
		const after = (await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: b.id }))?.items[0]
		expect(after?.delivery_cycle).toBeNull()
	})

	// ─── o que o anexo CITA é conferido contra ele ─────────────────────────────────

	test("saveQuantityEstimateDraftItems não sequestra item de outro anexo (update amarrado ao quantity_estimate_id)", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const other = await createQuantityEstimate(db, ctx, {
			unitId,
			title: uid("[TEST] anexo "),
			kitchenSelections: [],
			items: [{ ingredient_name: "Feijão", estimated_quantity: 10 }],
		})
		seeder.track("quantity_estimate", other.id)
		const itemOfOther = (await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: other.id }))?.items[0]
		if (!itemOfOther) throw new Error("item não persistido")
		const { id: draftId } = await createQuantityEstimateDraft(db, ctx, { unitId })
		seeder.track("quantity_estimate", draftId)

		await expect(
			saveQuantityEstimateDraftItems(db, ctx, {
				draftId,
				items: [{ quantity_estimate_item_id: itemOfOther.id, ingredient_name: "Sequestro", estimated_quantity: 1 }],
			})
		).rejects.toThrow(/não pertence/i)
		const after = (await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: other.id }))?.items[0]
		expect(after?.ingredient_name).toBe("Feijão")
	})

	test("updateQuantityEstimateItemPrices não repreça item de outro anexo", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		const a = await createQuantityEstimate(db, ctx, {
			unitId,
			title: uid("[TEST] anexo "),
			kitchenSelections: [],
			items: [{ ingredient_name: "Arroz", estimated_quantity: 10 }],
		})
		seeder.track("quantity_estimate", a.id)
		const b = await createQuantityEstimate(db, ctx, {
			unitId,
			title: uid("[TEST] anexo "),
			kitchenSelections: [],
			items: [{ ingredient_name: "Feijão", estimated_quantity: 10 }],
		})
		seeder.track("quantity_estimate", b.id)
		const itemOfB = (await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: b.id }))?.items[0]
		if (!itemOfB) throw new Error("item não persistido")

		// Sem pesquisa, a conferência de suporte recusa antes; com o vínculo de outro anexo, o
		// predicado do list_id recusa. Nos dois casos o item de B continua sem preço.
		await expect(
			updateQuantityEstimateItemPrices(db, ctx, { quantityEstimateId: a.id, updates: [{ quantityEstimateItemId: itemOfB.id, price: 999 }] })
		).rejects.toThrow(/não pertence|sem pesquisa/i)
		expect((await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: b.id }))?.items[0]?.unit_price).toBeNull()
	})

	test("updateQuantityEstimateItemPrices só grava preço sustentado por pesquisa do mesmo item e mesmo valor", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()
		// CATMAT real (peito de frango): a pesquisa tem de ser do mesmo CATMAT do item.
		const catmat = 447599
		const quantityEstimate = await createQuantityEstimate(db, ctx, {
			unitId,
			title: uid("[TEST] anexo "),
			kitchenSelections: [],
			items: [
				{ ingredient_name: "Frango", estimated_quantity: 10, catmat_item_codigo: catmat },
				{ ingredient_name: "Arroz", estimated_quantity: 10, catmat_item_codigo: 463692 },
			],
		})
		seeder.track("quantity_estimate", quantityEstimate.id)
		const items = (await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: quantityEstimate.id }))?.items ?? []
		const item = items.find((i) => i.ingredient_name === "Frango")
		const otherItem = items.find((i) => i.ingredient_name === "Arroz")
		if (!item || !otherItem) throw new Error("item não persistido")

		// Memória de cálculo mínima, ligada ao anexo (ON DELETE CASCADE limpa junto com o anexo).
		const [research] = await db
			.insert(procurementPesquisaPrecoInProcurement)
			.values({
				quantityEstimateId: quantityEstimate.id,
				referenceMethod: "median",
				totalItems: 1,
				itemsWithPrice: 1,
				itemsWithoutCatmat: 0,
				nonCompliantItems: 0,
			})
			.returning({ id: procurementPesquisaPrecoInProcurement.id })
		const [researchItem] = await db
			.insert(procurementPesquisaPrecoItemInProcurement)
			.values({
				researchId: research.id,
				quantityEstimateItemId: item.id,
				catmatCodigo: catmat,
				productName: "Frango",
				totalRaw: 3,
				totalAfterDateFilter: 3,
				totalAfterPollutionFilter: 3,
				totalAfterOutlier: 3,
				referencePrice: 12.34,
				referenceMethod: "median",
			})
			.returning({ id: procurementPesquisaPrecoItemInProcurement.id })
		const link = { quantityEstimateItemId: item.id, researchId: research.id, researchItemId: researchItem.id }

		await expect(
			updateQuantityEstimateItemPrices(db, ctx, { quantityEstimateId: quantityEstimate.id, updates: [{ quantityEstimateItemId: item.id, price: 12.34 }] })
		).rejects.toMatchObject({
			code: "PRICE_WITHOUT_RESEARCH",
		})
		await expect(
			updateQuantityEstimateItemPrices(db, ctx, {
				quantityEstimateId: quantityEstimate.id,
				updates: [{ quantityEstimateItemId: item.id, price: 20 }],
				researchLinks: [link],
			})
		).rejects.toMatchObject({
			code: "PRICE_WITHOUT_RESEARCH",
		})

		// A pesquisa do frango não lastreia o preço do arroz, mesmo com o mesmo valor.
		await expect(
			updateQuantityEstimateItemPrices(db, ctx, {
				quantityEstimateId: quantityEstimate.id,
				updates: [{ quantityEstimateItemId: otherItem.id, price: 12.34 }],
				researchLinks: [{ ...link, quantityEstimateItemId: otherItem.id }],
			})
		).rejects.toMatchObject({ code: "PRICE_WITHOUT_RESEARCH" })

		await updateQuantityEstimateItemPrices(db, ctx, {
			quantityEstimateId: quantityEstimate.id,
			updates: [{ quantityEstimateItemId: item.id, price: 12.34 }],
			researchLinks: [link],
		})
		const after = (await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: quantityEstimate.id }))?.items ?? []
		expect(Number(after.find((i) => i.ingredient_name === "Frango")?.unit_price)).toBe(12.34)
		expect(after.find((i) => i.ingredient_name === "Arroz")?.unit_price).toBeNull()
	})

	test("createQuantityEstimate recusa cozinha de outra unidade e plano local de outra cozinha", async () => {
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
			createQuantityEstimate(db, ctx, { unitId, title: uid("[TEST] anexo "), kitchenSelections: [selection(foreignKitchen, foreignTemplate)], items: [] })
		).rejects.toMatchObject({ code: "KITCHEN_NOT_IN_UNIT" })
		await expect(
			createQuantityEstimate(db, ctx, { unitId, title: uid("[TEST] anexo "), kitchenSelections: [selection(ownKitchen, foreignTemplate)], items: [] })
		).rejects.toMatchObject({ code: "TEMPLATE_ACCESS_DENIED" })
	})
})
