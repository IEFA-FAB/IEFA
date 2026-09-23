/**
 * Pedido de Lanche de Bordo/Apoio — integração contra o banco REAL.
 *
 * Prova o que só o banco prova: o ciclo inteiro com a trava da linha, a materialização no
 * quadro de produção (tipo de refeição de sistema + `origin_snack_request_id`), a disputa
 * aceite × recusa, o histórico apenas-inserção e o tipo de sistema fora dos seletores.
 * Depende da migration 20260922140000_kitchen_snack_requests.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import {
	advanceSnackRequest,
	applyEventTemplate,
	applyTemplate,
	cancelKitchenSnackRequest,
	closeSnackRequest,
	createSnackRequest,
	decideSnackRequest,
	fetchMealTypes,
	fetchProductionBoard,
	getKitchenSnackRequest,
	registerSnackMaterialReturn,
	registerSnackPickup,
	restoreMenuItem,
	setSnackClassification,
} from "@iefa/sisub-domain"
import { sql } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, futureDate, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

describeSupabaseIntegration("snack-requests operations", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("snack_request")
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

	/** Cozinha + padrão Bordo A pedível com 1 preparação por kit + usuário auth real (FK de requested_by). */
	async function setup() {
		if (!seeder || !db) throw new Error("no seeder")
		const { id: kitchenId } = await seeder.seedKitchen()
		const userId = await seeder.seedAuthUser()
		const ctx = fullAccessCtx(userId)
		const recipeId = await seeder.seedRecipe({ kitchenId, portionYield: 1, name: uid("[TEST] Água ") })
		const mealTypeId = await seeder.seedMealType({ kitchenId })
		const templateId = await seeder.seedTemplate({ kitchenId, templateType: "exception" })
		await seeder.seedTemplateItem({ templateId, mealTypeId, recipeId, dayOfWeek: 1, headcountOverride: 2 })
		await setSnackClassification(db, ctx, {
			templateId,
			classification: {
				family: "bordo",
				snackClass: "A",
				variant: "lanche",
				requiresGalley: false,
				requiresOven: false,
				reviewedAt: futureDate(-30),
				shelfLifeHours: null,
				orderable: true,
			},
		})
		// LIFO: roda ANTES do delete do template — itens de cardápio apontam para o pedido,
		// e as linhas do pedido apontam para o padrão.
		seeder.trackWhere("snack_request", "kitchen_id", kitchenId)
		seeder.trackFn(() => (seeder as Seeder).purgeKitchenMenus(kitchenId), "purge menus")
		return { kitchenId, ctx, templateId, recipeId }
	}

	function requestInput(kitchenId: number, templateId: string, crew = 4) {
		const day = futureDate(10)
		return {
			kitchenId,
			missionKind: "aerea" as const,
			departureAt: `${day}T15:00:00-03:00`,
			totalMinutes: 120,
			longestLegMinutes: null,
			stopsWithoutMess: false,
			groundMinutes: 0,
			isOperational: true,
			hasGalley: false,
			hasOven: false,
			crewCount: crew,
			paxCount: 0,
			requesterUnitLabel: "[TEST] 1º/1º GT",
			missionDescription: uid("[TEST] Missão "),
			missionOrderNumber: "OM-TEST",
			waterQuantity: crew,
			cupQuantity: crew * 2,
			iceQuantity: 0,
			coffeeQuantity: 1,
			includesNonMilitary: false,
			preference: "lanche" as const,
			pickupAt: `${day}T14:00:00-03:00`,
			pickupResponsible: "[TEST] Sgt Silva",
			fundingSource: "economia_om" as const,
			lines: [{ standardId: templateId, audience: "crew" as const, quantity: crew }],
		}
	}

	test("ciclo completo: aceite entra no quadro discriminado e o encerramento exige material devolvido", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, ctx, templateId, recipeId } = await setup()

		const created = await createSnackRequest(db, ctx, requestInput(kitchenId, templateId))
		expect(created.status).toBe("submitted")
		expect(created.requested_by).toBe(ctx.userId)
		expect(created.lines[0]?.standard_snapshot.items[0]?.portions).toBe(2)
		// Snapshot JSON sai em camelCase, como foi gravado — `toWire` não pode snake-izá-lo.
		expect(created.lines[0]?.standard_snapshot.snackClass).toBe("A")
		expect(created.lines[0]?.standard_snapshot.items[0]?.recipeId).toBe(recipeId)

		const lineId = created.lines[0]?.id as string
		const accepted = await decideSnackRequest(db, ctx, {
			requestId: created.id,
			decision: "accept",
			unitValue: 3.5,
			adjustments: [{ lineId, approvedQuantity: 3 }],
		})
		expect(accepted.status).toBe("accepted")
		expect(accepted.lines[0]?.approved_quantity).toBe(3)
		expect(accepted.production.total).toBe(1)
		// `details` do evento sai cru (camelCase): a tela casa `adjustments[].lineId`.
		const acceptEvent = accepted.events.find((e) => e.to_status === "accepted")
		expect((acceptEvent?.details as { adjustments?: { lineId: string }[] } | null)?.adjustments?.[0]?.lineId).toBe(lineId)

		const board = await fetchProductionBoard(db, ctx, { kitchenId, date: futureDate(10) })
		const snackItems = board.filter((i) => i.menuItem.snack_request?.id === created.id)
		expect(snackItems).toHaveLength(1)
		expect(snackItems[0]?.menuItem.recipe_origin_id).toBe(recipeId)
		// 3 kits aprovados × 2 porções por kit.
		expect(Number(snackItems[0]?.menuItem.planned_portion_quantity)).toBe(6)
		expect(snackItems[0]?.mealType?.name).toBe("Lanches de Bordo/Apoio")

		await advanceSnackRequest(db, ctx, { requestId: created.id, to: "in_production" })
		await expect(closeSnackRequest(db, ctx, { requestId: created.id })).rejects.toMatchObject({ code: "SNACK_INVALID_TRANSITION" })
		await advanceSnackRequest(db, ctx, { requestId: created.id, to: "ready", sampleCollectedAt: new Date().toISOString() })
		const delivered = await registerSnackPickup(db, ctx, {
			requestId: created.id,
			pickedUpByName: "[TEST] Cb Souza",
			materials: [{ item: "garrafa_termica", quantity: 2 }],
		})
		expect(delivered.status).toBe("delivered")

		await expect(closeSnackRequest(db, ctx, { requestId: created.id })).rejects.toMatchObject({ code: "SNACK_MATERIAL_PENDING" })
		const materialId = delivered.materials[0]?.id as string
		await registerSnackMaterialReturn(db, ctx, { requestId: created.id, returns: [{ materialId, returnedQuantity: 2 }] })
		const closed = await closeSnackRequest(db, ctx, { requestId: created.id })
		expect(closed.status).toBe("closed")
		expect(closed.events.map((e) => e.to_status)).toEqual(["submitted", "accepted", "in_production", "ready", "delivered", "delivered", "closed"])
	}, 60_000)

	test("cancelar depois do aceite tira os itens do quadro", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, ctx, templateId } = await setup()
		const created = await createSnackRequest(db, ctx, requestInput(kitchenId, templateId))
		await decideSnackRequest(db, ctx, { requestId: created.id, decision: "accept", unitValue: 0 })
		await cancelKitchenSnackRequest(db, ctx, { requestId: created.id, reason: "[TEST] missão cancelada" })

		const board = await fetchProductionBoard(db, ctx, { kitchenId, date: futureDate(10) })
		expect(board.filter((i) => i.menuItem.snack_request?.id === created.id)).toEqual([])
		expect((await getKitchenSnackRequest(db, ctx, { requestId: created.id })).status).toBe("cancelled")

		// O item cancelado não volta pela lixeira do planejamento.
		const [item] = (await db.execute(sql`select id::text as id from kitchen.menu_items where origin_snack_request_id = ${created.id} limit 1`)) as unknown as {
			id: string
		}[]
		await expect(restoreMenuItem(db, ctx, { menuItemId: item?.id as string })).rejects.toMatchObject({ code: "SNACK_ITEM_NOT_RESTORABLE" })
	}, 60_000)

	test("aplicar cardápio semanal com Substituir não apaga a produção de lanche aceita", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, ctx, templateId, recipeId } = await setup()
		const created = await createSnackRequest(db, ctx, requestInput(kitchenId, templateId))
		await decideSnackRequest(db, ctx, { requestId: created.id, decision: "accept", unitValue: 1 })

		const mealTypeId = await (seeder as Seeder).seedMealType({ kitchenId })
		const weekly = await (seeder as Seeder).seedTemplate({ kitchenId, templateType: "weekly" })
		for (let day = 1; day <= 7; day++)
			await (seeder as Seeder).seedTemplateItem({ templateId: weekly, mealTypeId, recipeId, dayOfWeek: day, headcountOverride: 10 })
		const date = futureDate(10)
		await applyTemplate(db, ctx, { templateId: weekly, kitchenId, startDate: date, endDate: date, startDayOfWeek: 1, conflictMode: "replace" })

		const board = await fetchProductionBoard(db, ctx, { kitchenId, date })
		expect(board.filter((i) => i.menuItem.snack_request?.id === created.id)).toHaveLength(1)
	}, 60_000)

	test("aceite e recusa simultâneos: exatamente uma transição vence", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, ctx, templateId } = await setup()
		const created = await createSnackRequest(db, ctx, requestInput(kitchenId, templateId))

		const results = await Promise.allSettled([
			decideSnackRequest(db, ctx, { requestId: created.id, decision: "accept", unitValue: 1 }),
			decideSnackRequest(db, ctx, { requestId: created.id, decision: "reject", reason: "[TEST] sem insumo" }),
		])
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
		const detail = await getKitchenSnackRequest(db, ctx, { requestId: created.id })
		expect(detail.events.filter((e) => e.from_status === "submitted")).toHaveLength(1)
	}, 60_000)

	test("histórico do pedido é apenas-inserção", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, ctx, templateId } = await setup()
		const created = await createSnackRequest(db, ctx, requestInput(kitchenId, templateId))
		await expect(db.execute(sql`update kitchen.snack_request_event set note = 'x' where request_id = ${created.id}`)).rejects.toThrow()
		await expect(db.execute(sql`delete from kitchen.snack_request_event where request_id = ${created.id}`)).rejects.toThrow()
	}, 60_000)

	test('guardas novas: padrão vazio não fica pedível, amostra não é do futuro, material "outro" exige descrição', async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, ctx, templateId } = await setup()

		// Padrão sem preparação não pode ser publicado — o aceite materializaria nada.
		const emptyStandard = await (seeder as Seeder).seedTemplate({ kitchenId, templateType: "exception" })
		await expect(
			setSnackClassification(db, ctx, {
				templateId: emptyStandard,
				classification: {
					family: "apoio",
					snackClass: "A",
					variant: "lanche",
					requiresGalley: false,
					requiresOven: false,
					reviewedAt: null,
					shelfLifeHours: null,
					orderable: true,
				},
			})
		).rejects.toMatchObject({ code: "SNACK_STANDARD_EMPTY" })

		const created = await createSnackRequest(db, ctx, requestInput(kitchenId, templateId))
		await decideSnackRequest(db, ctx, { requestId: created.id, decision: "accept", unitValue: 1 })
		await advanceSnackRequest(db, ctx, { requestId: created.id, to: "in_production" })

		// A coleta da amostra vira a data de fabricação da etiqueta.
		const future = new Date(Date.now() + 3 * 3_600_000).toISOString()
		await expect(advanceSnackRequest(db, ctx, { requestId: created.id, to: "ready", sampleCollectedAt: future })).rejects.toMatchObject({
			code: "SNACK_SAMPLE_IN_FUTURE",
		})
		const old = new Date(Date.now() - 48 * 3_600_000).toISOString()
		await expect(advanceSnackRequest(db, ctx, { requestId: created.id, to: "ready", sampleCollectedAt: old })).rejects.toMatchObject({
			code: "SNACK_SAMPLE_TOO_OLD",
		})
		await advanceSnackRequest(db, ctx, { requestId: created.id, to: "ready", sampleCollectedAt: new Date().toISOString() })

		// "outro" sem descrição bateria no CHECK do banco e derrubaria a retirada inteira.
		await expect(
			registerSnackPickup(db, ctx, { requestId: created.id, pickedUpByName: "[TEST] Cb Souza", materials: [{ item: "outro", quantity: 1 }] })
		).rejects.toMatchObject({ code: "SNACK_MATERIAL_DESCRIPTION_REQUIRED" })
		expect((await getKitchenSnackRequest(db, ctx, { requestId: created.id })).status).toBe("ready")
	}, 60_000)

	test("padrão de lanche não se aplica ao calendário — a produção vem do pedido", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, ctx, templateId } = await setup()
		await expect(applyEventTemplate(db, ctx, { templateId, kitchenId, dates: [futureDate(10)] })).rejects.toMatchObject({
			code: "SNACK_STANDARD_APPLY_BY_REQUEST",
		})
	}, 60_000)

	test("tipo de refeição de sistema não aparece no seletor de cardápio", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, ctx } = await setup()
		const types = await fetchMealTypes(db, ctx, { kitchenId })
		expect(types.some((t) => t.system_key != null)).toBe(false)
		expect(types.length).toBeGreaterThan(0)
	}, 60_000)
})
