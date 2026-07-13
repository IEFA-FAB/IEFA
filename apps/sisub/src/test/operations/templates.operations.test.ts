/**
 * Regressão happy-path — operations de TEMPLATES/CARDÁPIOS-MODELO (@iefa/sisub-domain).
 * Foco: contagens derivadas (item_count), escopo global vs cozinha, ordenação de itens,
 * fork (cópia de itens + base_template_id), substituição destrutiva de itens em update,
 * soft-delete/restore e materialização via applyTemplate (matemática de dia da semana).
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import {
	applyTemplate,
	createBlankTemplate,
	createTemplate,
	deleteTemplate,
	fetchDayDetails,
	forkTemplate,
	getTemplate,
	getTemplateItems,
	listDeletedTemplates,
	listTemplates,
	restoreTemplate,
	updateTemplate,
} from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("templates operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("menu_template")
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

	/** Cozinha + tipo de refeição + receita, base comum para itens de template. */
	async function base() {
		const sd = seeder
		if (!sd) throw new Error("no seeder")
		const { id: kitchenId } = await sd.seedKitchen()
		const mealTypeId = await sd.seedMealType({ kitchenId })
		const recipeId = await sd.seedRecipe({ kitchenId: null })
		return { kitchenId, mealTypeId, recipeId }
	}

	/** Rastreia template + itens criados por uma operation (não pelo seeder). */
	function trackTemplate(id: string) {
		seeder?.trackWhere("menu_template_items", "menu_template_id", id)
		seeder?.track("menu_template", id)
	}

	test("createTemplate com itens e listTemplates expõe item_count", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, recipeId } = await base()

		const tpl = await createTemplate(db, ctx, {
			name: uid("[TEST] Template "),
			kitchenId,
			templateType: "weekly",
			items: [
				{ dayOfWeek: 1, mealTypeId, recipeId, headcountOverride: 80 },
				{ dayOfWeek: 2, mealTypeId, recipeId },
			],
		})
		trackTemplate(tpl.id)

		const list = await listTemplates(db, ctx, { kitchenId })
		const found = list.find((t) => t.id === tpl.id)
		expect(found).toBeDefined()
		expect(found?.item_count).toBe(2)
		expect(found?.recipe_count).toBe(2)
	})

	test("exceção: monthly_headcount_total = Σ comensais × ocorrências; nulo em não-exceção", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, recipeId } = await base()

		// Exceção "Lanche de Bordo": 2 itens (200 + 100 comensais) × 30 ocorrências/mês = 9000.
		const exc = await createTemplate(db, ctx, {
			name: uid("[TEST] Lanche de Bordo "),
			kitchenId,
			templateType: "exception",
			expectedMonthlyOccurrences: 30,
			items: [
				{ dayOfWeek: 1, mealTypeId, recipeId, headcountOverride: 200 },
				{ dayOfWeek: 1, mealTypeId, recipeId, headcountOverride: 100 },
			],
		})
		trackTemplate(exc.id)

		// Exceção sem ocorrências informadas: nulo tratado como 1 → soma = 50.
		const excNoOcc = await createTemplate(db, ctx, {
			name: uid("[TEST] Café Reunião "),
			kitchenId,
			templateType: "exception",
			items: [{ dayOfWeek: 1, mealTypeId, recipeId, headcountOverride: 50 }],
		})
		trackTemplate(excNoOcc.id)

		// Semanal: monthly_headcount_total é nulo (usa avg_headcount_weekday).
		const weekly = await createTemplate(db, ctx, {
			name: uid("[TEST] Semanal "),
			kitchenId,
			templateType: "weekly",
			items: [{ dayOfWeek: 1, mealTypeId, recipeId, headcountOverride: 400 }],
		})
		trackTemplate(weekly.id)

		const list = await listTemplates(db, ctx, { kitchenId })
		expect(list.find((t) => t.id === exc.id)?.monthly_headcount_total).toBe(9000)
		expect(list.find((t) => t.id === excNoOcc.id)?.monthly_headcount_total).toBe(50)
		expect(list.find((t) => t.id === weekly.id)?.monthly_headcount_total).toBeNull()
	})

	test("getTemplate retorna itens ordenados por day_of_week; getTemplateItems idem", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, recipeId } = await base()
		const tpl = await createTemplate(db, ctx, {
			name: uid("[TEST] Ordem "),
			kitchenId,
			templateType: "weekly",
			items: [
				{ dayOfWeek: 3, mealTypeId, recipeId },
				{ dayOfWeek: 1, mealTypeId, recipeId },
			],
		})
		trackTemplate(tpl.id)

		const full = await getTemplate(db, ctx, { templateId: tpl.id })
		const days = full.items.map((i: { day_of_week: number | null }) => i.day_of_week)
		expect(days).toEqual([...days].sort((a, b) => (a ?? 0) - (b ?? 0)))

		const items = await getTemplateItems(db, ctx, { templateId: tpl.id })
		expect(items.length).toBe(2)
	})

	test("createBlankTemplate cria sem itens", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId } = await base()
		const tpl = await createBlankTemplate(db, ctx, { name: uid("[TEST] Vazio "), kitchenId, templateType: "event" })
		trackTemplate(tpl.id)

		const items = await getTemplateItems(db, ctx, { templateId: tpl.id })
		expect(items).toHaveLength(0)
	})

	test("forkTemplate copia itens e referencia base_template_id", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, recipeId } = await base()
		const src = await createTemplate(db, ctx, {
			name: uid("[TEST] Fonte "),
			kitchenId,
			templateType: "weekly",
			items: [{ dayOfWeek: 1, mealTypeId, recipeId }],
		})
		trackTemplate(src.id)

		const fork = await forkTemplate(db, ctx, { sourceTemplateId: src.id, targetKitchenId: kitchenId, newName: uid("[TEST] Fork ") })
		trackTemplate(fork.id)

		expect(fork.base_template_id).toBe(src.id)
		const forkItems = await getTemplateItems(db, ctx, { templateId: fork.id })
		expect(forkItems).toHaveLength(1)
	})

	test("updateTemplate renomeia e substitui itens (destrutivo)", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, recipeId } = await base()
		const tpl = await createTemplate(db, ctx, {
			name: uid("[TEST] Antes "),
			kitchenId,
			templateType: "weekly",
			items: [{ dayOfWeek: 1, mealTypeId, recipeId }],
		})
		trackTemplate(tpl.id)

		const novoNome = uid("[TEST] Depois ")
		const updated = await updateTemplate(db, ctx, {
			templateId: tpl.id,
			name: novoNome,
			items: [
				{ dayOfWeek: 2, mealTypeId, recipeId },
				{ dayOfWeek: 3, mealTypeId, recipeId },
			],
		})
		expect(updated.name).toBe(novoNome)

		const items = await getTemplateItems(db, ctx, { templateId: tpl.id })
		expect(items).toHaveLength(2) // substituição total
	})

	test("deleteTemplate (soft) some de listTemplates, entra em listDeletedTemplates; restore reverte", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId } = await base()
		const tpl = await createBlankTemplate(db, ctx, { name: uid("[TEST] Del "), kitchenId, templateType: "weekly" })
		trackTemplate(tpl.id)

		await deleteTemplate(db, ctx, { templateId: tpl.id })
		expect((await listTemplates(db, ctx, { kitchenId })).map((t) => t.id)).not.toContain(tpl.id)
		expect((await listDeletedTemplates(db, ctx, { kitchenId })).map((t) => t.id)).toContain(tpl.id)

		await restoreTemplate(db, ctx, { templateId: tpl.id })
		expect((await listTemplates(db, ctx, { kitchenId })).map((t) => t.id)).toContain(tpl.id)
	})

	test("applyTemplate materializa menus para os dias correspondentes do intervalo", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, recipeId } = await base()
		seeder.trackFn(() => seeder?.purgeKitchenMenus(kitchenId) ?? Promise.resolve())

		// Item no dia 1 do template; aplicamos a um único dia cuja semana = startDayOfWeek
		// → templateDay = 1, então o item materializa nesse dia.
		const tpl = await createTemplate(db, ctx, {
			name: uid("[TEST] Aplicar "),
			kitchenId,
			templateType: "weekly",
			items: [{ dayOfWeek: 1, mealTypeId, recipeId }],
		})
		trackTemplate(tpl.id)

		const date = "2099-04-06"
		const js = new Date(date).getDay()
		const startDayOfWeek = js === 0 ? 7 : js

		const result = await applyTemplate(db, ctx, { templateId: tpl.id, kitchenId, startDate: date, endDate: date, startDayOfWeek })

		expect(result.datesProcessed).toEqual([date])
		expect(result.menusCreated).toBe(1)
		expect(result.itemsCreated).toBe(1)
	})

	test("grupo + ordem + proporção fazem round-trip em createTemplate/getTemplateItems", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, recipeId } = await base()
		const tpl = await createTemplate(db, ctx, {
			name: uid("[TEST] Grupos "),
			kitchenId,
			templateType: "weekly",
			items: [
				{ dayOfWeek: 1, mealTypeId, recipeId, itemGroup: "guarnicao", sortOrder: 1, recommendedProportion: 30 },
				{ dayOfWeek: 1, mealTypeId, recipeId, itemGroup: "prato_principal", sortOrder: 0, recommendedProportion: 70 },
			],
		})
		trackTemplate(tpl.id)

		const items = (await getTemplateItems(db, ctx, { templateId: tpl.id })) as unknown as {
			item_group: string | null
			sort_order: number | null
			recommended_proportion: number | string | null
		}[]
		const principal = items.find((i) => i.item_group === "prato_principal")
		const guarnicao = items.find((i) => i.item_group === "guarnicao")
		expect(principal).toBeDefined()
		expect(guarnicao).toBeDefined()
		expect(principal?.sort_order).toBe(0)
		expect(Number(principal?.recommended_proportion)).toBe(70)
		expect(Number(guarnicao?.recommended_proportion)).toBe(30)
	})

	test("applyTemplate propaga grupo/ordem/proporção para os menu_items", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, recipeId } = await base()
		seeder.trackFn(() => seeder?.purgeKitchenMenus(kitchenId) ?? Promise.resolve())

		const tpl = await createTemplate(db, ctx, {
			name: uid("[TEST] Aplicar grupos "),
			kitchenId,
			templateType: "weekly",
			items: [{ dayOfWeek: 1, mealTypeId, recipeId, itemGroup: "prato_principal", sortOrder: 0, recommendedProportion: 65 }],
		})
		trackTemplate(tpl.id)

		const date = "2099-04-06"
		const js = new Date(date).getDay()
		const startDayOfWeek = js === 0 ? 7 : js
		await applyTemplate(db, ctx, { templateId: tpl.id, kitchenId, startDate: date, endDate: date, startDayOfWeek })

		const details = await fetchDayDetails(db, ctx, { kitchenId, date })
		const menuItems = details.flatMap((m) => m.menu_items) as unknown as {
			item_group: string | null
			sort_order: number | null
			recommended_proportion: number | string | null
		}[]
		expect(menuItems.length).toBe(1)
		expect(menuItems[0]?.item_group).toBe("prato_principal")
		expect(Number(menuItems[0]?.recommended_proportion)).toBe(65)
	})
})
