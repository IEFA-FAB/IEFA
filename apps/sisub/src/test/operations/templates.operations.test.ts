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
	getTrashItems,
	listDeletedTemplates,
	listTemplates,
	restoreMenuItem,
	restoreTemplate,
	saveTemplateEdit,
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

	test("saveTemplateEdit limpa description e expected_monthly_occurrences quando null", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId } = await base()

		const tpl = await createTemplate(db, ctx, {
			name: uid("[TEST] Limpar "),
			description: "descrição inicial",
			kitchenId,
			templateType: "exception",
			expectedMonthlyOccurrences: 12,
		})
		trackTemplate(tpl.id)
		expect(tpl.description).toBe("descrição inicial")
		expect(tpl.expected_monthly_occurrences).toBe(12)

		// null = limpar (não deve ser tratado como undefined/"não mexe")
		await saveTemplateEdit(db, ctx, { templateId: tpl.id, context: { scope: "kitchen", kitchenId }, description: null, expectedMonthlyOccurrences: null })

		const after = await getTemplate(db, ctx, { templateId: tpl.id })
		expect(after.description).toBeNull()
		expect(after.expected_monthly_occurrences).toBeNull()
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

	test("forkTemplate de exceção global leva o pax de cada item e a recorrência mensal", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, recipeId } = await base()
		// Template global só referencia tipo de refeição GLOBAL: o local de uma cozinha
		// vazaria para todas (`assertTemplateContentInScope`).
		const mealTypeId = await seeder.seedMealType({ kitchenId: null })
		// Modelo do catálogo global: sem efetivo base, o quantitativo mora no item.
		const src = await createTemplate(db, ctx, {
			name: uid("[TEST] Exceção global "),
			templateType: "exception",
			expectedMonthlyOccurrences: 30,
			items: [{ dayOfWeek: 1, mealTypeId, recipeId, headcountOverride: 45 }],
		})
		trackTemplate(src.id)

		const fork = await forkTemplate(db, ctx, { sourceTemplateId: src.id, targetKitchenId: kitchenId, newName: uid("[TEST] Exceção adaptada ") })
		trackTemplate(fork.id)

		expect(fork.kitchen_id).toBe(kitchenId)
		expect(fork.template_type).toBe("exception")
		expect(fork.expected_monthly_occurrences).toBe(30)
		const forkItems = await getTemplateItems(db, ctx, { templateId: fork.id })
		expect(forkItems.map((i) => i.headcount_override)).toEqual([45])
	})

	test("saveTemplateEdit forka template global editado no contexto de uma cozinha", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, recipeId } = await base()
		// Template global só referencia tipo de refeição GLOBAL (`assertTemplateContentInScope`).
		const mealTypeId = await seeder.seedMealType({ kitchenId: null })

		// Template GLOBAL (kitchenId ausente) — o catálogo da SDAB.
		const global = await createTemplate(db, ctx, {
			name: uid("[TEST] Global "),
			templateType: "weekly",
			items: [{ dayOfWeek: 1, mealTypeId, recipeId }],
		})
		trackTemplate(global.id)

		const { template: fork, forked } = await saveTemplateEdit(db, ctx, {
			templateId: global.id,
			context: { scope: "kitchen", kitchenId },
			name: uid("[TEST] Adaptado "),
		})
		trackTemplate(fork.id)

		expect(forked).toBe(true)
		expect(fork.id).not.toBe(global.id)
		expect(fork.kitchen_id).toBe(kitchenId)
		expect(fork.base_template_id).toBe(global.id)

		// O global permanece intacto — é a regra que motiva todo o copy-on-write.
		const globalAfter = await getTemplate(db, ctx, { templateId: global.id })
		expect(globalAfter.name).toBe(global.name)
		expect(globalAfter.kitchen_id).toBeNull()

		// Itens copiados para o fork, já que a edição não os informou.
		const forkItems = await getTemplateItems(db, ctx, { templateId: fork.id })
		expect(forkItems.length).toBe(1)

		// Segunda edição aplica NO fork existente, sem bifurcar de novo.
		const { template: again, forked: forkedAgain } = await saveTemplateEdit(db, ctx, {
			templateId: global.id,
			context: { scope: "kitchen", kitchenId },
			name: uid("[TEST] Readaptado "),
		})
		expect(forkedAgain).toBe(true)
		expect(again.id).toBe(fork.id)
	})

	test("saveTemplateEdit renomeia e substitui itens (destrutivo)", async () => {
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
		const { template: updated } = await saveTemplateEdit(db, ctx, {
			context: { scope: "kitchen", kitchenId },
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
		const js = new Date(`${date}T00:00:00Z`).getUTCDay()
		const startDayOfWeek = js === 0 ? 7 : js

		const result = await applyTemplate(db, ctx, { templateId: tpl.id, kitchenId, startDate: date, endDate: date, startDayOfWeek })

		expect(result.datesProcessed).toEqual([date])
		expect(result.menusCreated).toBe(1)
		expect(result.itemsCreated).toBe(1)
	})

	test("applyTemplate deriva forecasted_headcount + planned_portion_quantity do headcount_override", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, recipeId } = await base()
		seeder.trackFn(() => seeder?.purgeKitchenMenus(kitchenId) ?? Promise.resolve())

		// Dois itens na mesma refeição: um com override, outro sem → efetivo da refeição = média
		// dos overrides preenchidos (só o 80). A porção de cada item = seu override senão o efetivo.
		const tpl = await createTemplate(db, ctx, {
			name: uid("[TEST] Efetivo "),
			kitchenId,
			templateType: "weekly",
			items: [
				{ dayOfWeek: 1, mealTypeId, recipeId, headcountOverride: 80, recommendedProportion: null },
				{ dayOfWeek: 1, mealTypeId, recipeId, recommendedProportion: null },
			],
		})
		trackTemplate(tpl.id)

		const date = "2099-04-06"
		const js = new Date(`${date}T00:00:00Z`).getUTCDay()
		const startDayOfWeek = js === 0 ? 7 : js
		await applyTemplate(db, ctx, { templateId: tpl.id, kitchenId, startDate: date, endDate: date, startDayOfWeek })

		const details = (await fetchDayDetails(db, ctx, { kitchenId, date })) as unknown as {
			forecasted_headcount: number | null
			menu_items: { planned_portion_quantity: number | string | null }[]
		}[]
		expect(details.length).toBe(1)
		expect(details[0]?.forecasted_headcount).toBe(80)
		const portions = details[0]?.menu_items.map((m) => Number(m.planned_portion_quantity)).sort((a, b) => a - b)
		// item sem override herda o efetivo derivado (80); item com override mantém 80.
		expect(portions).toEqual([80, 80])
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
		// Sem `Number(...)`: a leitura tem que devolver number. String aqui é o que fazia o save
		// do plano semanal reprovar cada item em `recommendedProportion`.
		expect(principal?.recommended_proportion).toBe(70)
		expect(guarnicao?.recommended_proportion).toBe(30)
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
		const js = new Date(`${date}T00:00:00Z`).getUTCDay()
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

	test("efetivo base por refeição faz round-trip em createTemplate/getTemplate", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, recipeId } = await base()
		const tpl = await createTemplate(db, ctx, {
			name: uid("[TEST] Base "),
			kitchenId,
			templateType: "weekly",
			items: [{ dayOfWeek: 1, mealTypeId, recipeId, recommendedProportion: null }],
			meals: [{ dayOfWeek: 1, mealTypeId, baseHeadcount: 120 }],
		})
		trackTemplate(tpl.id)

		const full = (await getTemplate(db, ctx, { templateId: tpl.id })) as unknown as {
			meals: { day_of_week: number; meal_type_id: string; base_headcount: number | null }[]
		}
		const meal = full.meals.find((m) => m.day_of_week === 1 && m.meal_type_id === mealTypeId)
		expect(meal).toBeDefined()
		expect(Number(meal?.base_headcount)).toBe(120)
	})

	test("applyTemplate usa o efetivo base do template (base vence a média de overrides)", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, recipeId } = await base()
		seeder.trackFn(() => seeder?.purgeKitchenMenus(kitchenId) ?? Promise.resolve())

		// Base = 120; um item tem override 80 (exceção), outro não tem.
		const tpl = await createTemplate(db, ctx, {
			name: uid("[TEST] Base apply "),
			kitchenId,
			templateType: "weekly",
			items: [
				{ dayOfWeek: 1, mealTypeId, recipeId, headcountOverride: 80, recommendedProportion: null },
				{ dayOfWeek: 1, mealTypeId, recipeId, recommendedProportion: null },
			],
			meals: [{ dayOfWeek: 1, mealTypeId, baseHeadcount: 120 }],
		})
		trackTemplate(tpl.id)

		const date = "2099-04-06"
		const js = new Date(`${date}T00:00:00Z`).getUTCDay()
		const startDayOfWeek = js === 0 ? 7 : js
		await applyTemplate(db, ctx, { templateId: tpl.id, kitchenId, startDate: date, endDate: date, startDayOfWeek })

		const details = (await fetchDayDetails(db, ctx, { kitchenId, date })) as unknown as {
			forecasted_headcount: number | null
			menu_items: { planned_portion_quantity: number | string | null }[]
		}[]
		expect(details.length).toBe(1)
		// forecasted_headcount = base (120), não a média dos overrides.
		expect(details[0]?.forecasted_headcount).toBe(120)
		const portions = details[0]?.menu_items.map((m) => Number(m.planned_portion_quantity)).sort((a, b) => a - b)
		// item com override → 80; item sem override → base 120.
		expect(portions).toEqual([80, 120])
	})

	test("forkTemplate copia o efetivo base das refeições", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, recipeId } = await base()
		const src = await createTemplate(db, ctx, {
			name: uid("[TEST] Fork base "),
			kitchenId,
			templateType: "weekly",
			items: [{ dayOfWeek: 1, mealTypeId, recipeId, recommendedProportion: null }],
			meals: [{ dayOfWeek: 1, mealTypeId, baseHeadcount: 200 }],
		})
		trackTemplate(src.id)

		const forked = await forkTemplate(db, ctx, { sourceTemplateId: src.id, targetKitchenId: kitchenId, newName: uid("[TEST] Forked ") })
		trackTemplate(forked.id)

		const full = (await getTemplate(db, ctx, { templateId: forked.id })) as unknown as {
			meals: { day_of_week: number; base_headcount: number | null }[]
		}
		expect(Number(full.meals.find((m) => m.day_of_week === 1)?.base_headcount)).toBe(200)
	})

	// ── Materialização: quais datas são tocadas, e o que acontece com o que já estava lá ──

	test("applyTemplate com `dates` toca só as datas escolhidas — o dia do meio fica intacto", async () => {
		if (!reachable || !seeder || !db) return
		const sd = seeder
		const { kitchenId, mealTypeId, recipeId } = await base()
		sd.trackFn(() => sd.purgeKitchenMenus(kitchenId))

		const first = "2099-05-04"
		const gap = "2099-05-05"
		const last = "2099-05-06"
		const js = new Date(`${first}T00:00:00Z`).getUTCDay()
		const startDayOfWeek = js === 0 ? 7 : js

		const templateId = await sd.seedTemplate({ kitchenId, templateType: "weekly" })
		// Dia 1 do template cai em `first`; dia 3, em `last`.
		await sd.seedTemplateItem({ templateId, mealTypeId, recipeId, dayOfWeek: 1, headcountOverride: 50 })
		await sd.seedTemplateItem({ templateId, mealTypeId, recipeId, dayOfWeek: 3, headcountOverride: 50 })

		// O dia do meio está planejado à mão e NÃO foi escolhido: tem de sobreviver ao replace.
		const manualRecipe = await sd.seedRecipe({ kitchenId })
		const { id: gapMenu } = await sd.seedDailyMenu({ kitchenId, mealTypeId, serviceDate: gap })
		await sd.seedMenuItem({ dailyMenuId: gapMenu, recipeId: manualRecipe, plannedPortionQuantity: 33 })

		const result = await applyTemplate(db, ctx, {
			templateId,
			kitchenId,
			dates: [first, last],
			startDate: first,
			endDate: last,
			startDayOfWeek,
			conflictMode: "replace",
		})

		expect(result.datesProcessed).toEqual([first, last])

		const gapDetails = (await fetchDayDetails(db, ctx, { kitchenId, date: gap })) as unknown as { menu_items: { recipe_origin_id: string | null }[] }[]
		expect(gapDetails.flatMap((m) => m.menu_items).map((i) => i.recipe_origin_id)).toEqual([manualRecipe])
	})

	test("replace manda os itens apagados para a lixeira, não só o menu do dia", async () => {
		if (!reachable || !seeder || !db) return
		const sd = seeder
		const { kitchenId, mealTypeId, recipeId } = await base()
		sd.trackFn(() => sd.purgeKitchenMenus(kitchenId))

		const date = "2099-05-11"
		const js = new Date(`${date}T00:00:00Z`).getUTCDay()
		const startDayOfWeek = js === 0 ? 7 : js

		const templateId = await sd.seedTemplate({ kitchenId, templateType: "weekly" })
		await sd.seedTemplateItem({ templateId, mealTypeId, recipeId, dayOfWeek: 1, headcountOverride: 50 })

		const manualRecipe = await sd.seedRecipe({ kitchenId })
		const { id: menuId } = await sd.seedDailyMenu({ kitchenId, mealTypeId, serviceDate: date })
		await sd.seedMenuItem({ dailyMenuId: menuId, recipeId: manualRecipe, plannedPortionQuantity: 77 })

		await applyTemplate(db, ctx, { templateId, kitchenId, dates: [date], startDate: date, endDate: date, startDayOfWeek, conflictMode: "replace" })

		const trash = await getTrashItems(db, ctx, { kitchenId })
		const trashed = trash.find((t) => t.recipe_origin_id === manualRecipe)
		expect(trashed).toBeDefined()

		// Restaurar depois do Substituir: já existe um menu ativo na mesma data/refeição (o que o
		// template criou), então reativar o antigo violaria o índice único parcial. O item tem de
		// voltar para o menu ativo — visível no dia.
		await restoreMenuItem(db, ctx, { menuItemId: trashed?.id as string })
		const details = (await fetchDayDetails(db, ctx, { kitchenId, date })) as unknown as { menu_items: { recipe_origin_id: string | null }[] }[]
		expect(details.length).toBe(1)
		expect(details.flatMap((m) => m.menu_items).map((i) => i.recipe_origin_id)).toContain(manualRecipe)
	})

	test("sem conflictMode, o default preserva a refeição já planejada", async () => {
		if (!reachable || !seeder || !db) return
		const sd = seeder
		const { kitchenId, mealTypeId, recipeId } = await base()
		sd.trackFn(() => sd.purgeKitchenMenus(kitchenId))

		const date = "2099-05-18"
		const js = new Date(`${date}T00:00:00Z`).getUTCDay()
		const startDayOfWeek = js === 0 ? 7 : js

		const templateId = await sd.seedTemplate({ kitchenId, templateType: "weekly" })
		await sd.seedTemplateItem({ templateId, mealTypeId, recipeId, dayOfWeek: 1, headcountOverride: 50 })

		const manualRecipe = await sd.seedRecipe({ kitchenId })
		const { id: menuId } = await sd.seedDailyMenu({ kitchenId, mealTypeId, serviceDate: date })
		await sd.seedMenuItem({ dailyMenuId: menuId, recipeId: manualRecipe, plannedPortionQuantity: 77 })

		// Sem `conflictMode`: o default é preservador, então o item manual continua no lugar.
		const result = await applyTemplate(db, ctx, { templateId, kitchenId, dates: [date], startDate: date, endDate: date, startDayOfWeek })

		expect(result.datesSkipped).toEqual([date])
		const details = (await fetchDayDetails(db, ctx, { kitchenId, date })) as unknown as { menu_items: { recipe_origin_id: string | null }[] }[]
		expect(details.flatMap((m) => m.menu_items).map((i) => i.recipe_origin_id)).toEqual([manualRecipe])
	})

	// ── Refeições próprias do evento ───────────────────────────────────────────

	const EVENT_GROUPS = [
		{ key: "entrada", label: "Entradas" },
		{ key: "volante", label: "Volantes" },
	]

	test("evento: refeições fazem round-trip e o item sai com o horário da refeição", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, recipeId } = await base()
		const otherMealType = await seeder.seedMealType({ kitchenId })
		const coquetelId = crypto.randomUUID()

		const tpl = await createTemplate(db, ctx, {
			name: uid("[TEST] Evento "),
			kitchenId,
			templateType: "event",
			eventMeals: [{ id: coquetelId, name: "Coquetel", mealTypeId, groups: EVENT_GROUPS }],
			// O `mealTypeId` do item de evento é descartado: vale o horário da refeição.
			items: [{ dayOfWeek: 1, mealTypeId: otherMealType, recipeId, itemGroup: "volante", recommendedProportion: null, eventMealId: coquetelId }],
		})
		trackTemplate(tpl.id)

		const full = await getTemplate(db, ctx, { templateId: tpl.id })
		expect(full.event_meals).toEqual([expect.objectContaining({ id: coquetelId, name: "Coquetel", meal_type_id: mealTypeId, groups: EVENT_GROUPS })])
		expect(full.items).toHaveLength(1)
		expect(full.items[0]?.event_meal_id).toBe(coquetelId)
		expect(full.items[0]?.meal_type_id).toBe(mealTypeId)
		expect(full.items[0]?.item_group).toBe("volante")
	})

	test("evento: item sem refeição, ou em grupo fora da composição, é recusado", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, recipeId } = await base()
		const coquetelId = crypto.randomUUID()
		const eventMeals = [{ id: coquetelId, name: "Coquetel", mealTypeId, groups: EVENT_GROUPS }]

		await expect(
			createTemplate(db, ctx, {
				name: uid("[TEST] Evento "),
				kitchenId,
				templateType: "event",
				items: [{ dayOfWeek: 1, mealTypeId, recipeId, recommendedProportion: null }],
			})
		).rejects.toThrow(/refeição do evento/)
		await expect(
			createTemplate(db, ctx, {
				name: uid("[TEST] Evento "),
				kitchenId,
				templateType: "event",
				eventMeals,
				items: [{ dayOfWeek: 1, mealTypeId, recipeId, itemGroup: "sobremesa", recommendedProportion: null, eventMealId: coquetelId }],
			})
		).rejects.toThrow(/não existe na refeição/)
		await expect(createTemplate(db, ctx, { name: uid("[TEST] Semanal "), kitchenId, templateType: "weekly", eventMeals })).rejects.toThrow(/só em evento/)
	})

	test("evento: mudar o horário da refeição sem mandar itens move os itens; tirar a refeição leva os itens", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, recipeId } = await base()
		const almoco = await seeder.seedMealType({ kitchenId })
		const coquetelId = crypto.randomUUID()
		const galaId = crypto.randomUUID()
		const context = { scope: "kitchen" as const, kitchenId }

		const tpl = await createTemplate(db, ctx, {
			name: uid("[TEST] Evento "),
			kitchenId,
			templateType: "event",
			eventMeals: [
				{ id: coquetelId, name: "Coquetel", mealTypeId, groups: EVENT_GROUPS },
				{ id: galaId, name: "Gala", mealTypeId, groups: EVENT_GROUPS },
			],
			items: [
				{ dayOfWeek: 1, mealTypeId, recipeId, itemGroup: "entrada", recommendedProportion: null, eventMealId: coquetelId },
				{ dayOfWeek: 1, mealTypeId, recipeId, itemGroup: "entrada", recommendedProportion: null, eventMealId: galaId },
			],
		})
		trackTemplate(tpl.id)

		// Só as refeições: o coquetel vira almoço e a gala sai.
		await saveTemplateEdit(db, ctx, {
			templateId: tpl.id,
			context,
			eventMeals: [{ id: coquetelId, name: "Coquetel de boas-vindas", mealTypeId: almoco, groups: EVENT_GROUPS }],
		})

		const full = await getTemplate(db, ctx, { templateId: tpl.id })
		expect(full.event_meals.map((m) => [m.id, m.name, m.meal_type_id])).toEqual([[coquetelId, "Coquetel de boas-vindas", almoco]])
		expect(full.items.map((i) => [i.event_meal_id, i.meal_type_id])).toEqual([[coquetelId, almoco]])
	})

	test("evento global editado na cozinha: a cópia ganha refeições com ids novos, e o molde fica intacto", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, recipeId } = await base()
		const mealTypeId = await seeder.seedMealType({ kitchenId: null })
		const coquetelId = crypto.randomUUID()
		const eventMeals = [{ id: coquetelId, name: "Coquetel", mealTypeId, groups: EVENT_GROUPS }]
		const items = [{ dayOfWeek: 1, mealTypeId, recipeId, itemGroup: "volante", recommendedProportion: null, headcountOverride: 80, eventMealId: coquetelId }]

		const global = await createTemplate(db, ctx, { name: uid("[TEST] Evento global "), templateType: "event", eventMeals, items })
		trackTemplate(global.id)

		// O editor manda o conteúdo com os ids do MOLDE — a primeira vez cria a cópia, a segunda
		// aplica na cópia que já existe. Nas duas os ids precisam ser trocados.
		for (const name of ["Coquetel da cozinha", "Coquetel da cozinha (2)"]) {
			const { template: fork, forked } = await saveTemplateEdit(db, ctx, {
				templateId: global.id,
				context: { scope: "kitchen", kitchenId },
				eventMeals: [{ ...eventMeals[0], name } as (typeof eventMeals)[number]],
				items,
			})
			trackTemplate(fork.id)
			expect(forked).toBe(true)

			const copy = await getTemplate(db, ctx, { templateId: fork.id })
			expect(copy.event_meals).toHaveLength(1)
			const [meal] = copy.event_meals
			expect(meal?.id).not.toBe(coquetelId)
			expect(meal?.name).toBe(name)
			expect(copy.items.map((i) => [i.event_meal_id, i.headcount_override])).toEqual([[meal?.id, 80]])
		}

		const original = await getTemplate(db, ctx, { templateId: global.id })
		expect(original.event_meals.map((m) => [m.id, m.name])).toEqual([[coquetelId, "Coquetel"]])

		// forkTemplate direto segue a mesma regra.
		const fork = await forkTemplate(db, ctx, { sourceTemplateId: global.id, targetKitchenId: kitchenId, newName: uid("[TEST] Fork evento ") })
		trackTemplate(fork.id)
		const forked = await getTemplate(db, ctx, { templateId: fork.id })
		expect(forked.event_meals[0]?.id).not.toBe(coquetelId)
		expect(forked.items[0]?.event_meal_id).toBe(forked.event_meals[0]?.id)
	})
})
