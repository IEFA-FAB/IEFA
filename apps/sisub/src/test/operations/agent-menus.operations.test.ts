/**
 * Regressão — projeção de cardápio e template exposta a agentes (`@iefa/sisub-domain/agent`).
 *
 * O que estes testes seguram: o item de cardápio NÃO pode voltar a carregar a ficha técnica.
 * A coluna `menu_items.recipe` é um snapshot json da receita inteira (com ingredientes e a
 * linha completa de cada insumo); a leitura de calendário ainda embutia `recipe_origin`, a
 * receita atual, ao lado. Um dia com três refeições passava dos 60 mil caracteres de
 * `MAX_TOOL_RESULT_CHARS` e a tool devolvia erro de payload em vez do cardápio.
 *
 * Por isso o teste mede o tamanho, além de conferir os campos: um `select` que volte a trazer
 * coluna demais aparece aqui como bytes, mesmo que o nome do campo mude.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { addMenuItem } from "@iefa/sisub-domain"
import { agentFetchDayMenus, agentFetchMenus, agentGetTemplateItems, MAX_TOOL_RESULT_CHARS } from "@iefa/sisub-domain/agent"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, futureDate, makeSeeder, type Seeder, setupIntegration } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("leituras de cardápio para agente (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("daily_menu")
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

	async function scenario() {
		const sd = seeder
		if (!sd) throw new Error("no seeder")
		const { id: kitchenId } = await sd.seedKitchen()
		sd.trackFn(() => sd.purgeKitchenMenus(kitchenId))
		const mealTypeId = await sd.seedMealType({ kitchenId })
		const recipeId = await sd.seedRecipe({ kitchenId: null })
		const { id: dailyMenuId, serviceDate } = await sd.seedDailyMenu({ kitchenId, mealTypeId })
		return { kitchenId, mealTypeId, recipeId, dailyMenuId, serviceDate }
	}

	test("agentFetchMenus devolve o prato pelo nome e nenhum snapshot de ficha técnica", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, recipeId, dailyMenuId, serviceDate } = await scenario()
		await addMenuItem(db, ctx, { dailyMenuId, recipeId, plannedPortionQuantity: 120 })

		const menus = await agentFetchMenus(db, ctx, { kitchenId, startDate: serviceDate, endDate: serviceDate })
		const menu = menus.find((m) => m.id === dailyMenuId)

		expect(menu).toBeDefined()
		expect(menu?.meal_type).toBeTruthy() // nome da refeição, não o UUID
		expect(menu?.items).toHaveLength(1)
		const item = menu?.items[0]
		expect(item?.recipe).toBeTruthy() // nome do prato
		expect(item?.planned_portions).toBe(120)

		// A ficha técnica não pode estar aqui, sob nenhum nome.
		const serialized = JSON.stringify(menus)
		expect(serialized).not.toContain("recipe_ingredients")
		expect(serialized).not.toContain("cooking_factor")
		expect(Object.keys(item ?? {}).sort()).toEqual(["group", "id", "planned_portions", "recipe"])
	})

	test("agentFetchDayMenus é o mesmo recorte do calendário para uma data", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, recipeId, dailyMenuId, serviceDate } = await scenario()
		await addMenuItem(db, ctx, { dailyMenuId, recipeId })

		const [range, day] = await Promise.all([
			agentFetchMenus(db, ctx, { kitchenId, startDate: serviceDate, endDate: serviceDate }),
			agentFetchDayMenus(db, ctx, { kitchenId, date: serviceDate }),
		])
		expect(day).toEqual(range)
	})

	test("uma semana cheia de cardápio cabe no orçamento de resultado de tool", async () => {
		if (!reachable || !seeder || !db) return
		const sd = seeder
		// `db` é `let` do escopo do describe: dentro do callback do Promise.all o narrowing se
		// perde, então fixamos a referência aqui.
		const database = db
		const { id: kitchenId } = await sd.seedKitchen()
		sd.trackFn(() => sd.purgeKitchenMenus(kitchenId))
		const recipeId = await sd.seedRecipe({ kitchenId: null })

		// 7 dias × 3 refeições × 5 pratos: o volume que estourava o teto na leitura anterior.
		//
		// Data e refeição vão explícitas: `seedDailyMenu` sem `serviceDate` usa sempre a mesma
		// data, e o índice parcial `daily_menu_active_unique` cobre (data, refeição, cozinha) —
		// repetir o par estoura a constraint antes de o teste medir coisa alguma.
		const mealTypeIds = [await sd.seedMealType({ kitchenId }), await sd.seedMealType({ kitchenId }), await sd.seedMealType({ kitchenId })]
		const dates = Array.from({ length: 7 }, (_unused, day) => futureDate(day))

		// 105 escritas: sequenciais estouram o timeout padrão de 15 s contra o banco real. Os
		// itens de uma mesma refeição não dependem uns dos outros — vão juntos.
		for (const serviceDate of dates) {
			for (const mealTypeId of mealTypeIds) {
				const { id: dailyMenuId } = await sd.seedDailyMenu({ kitchenId, mealTypeId, serviceDate })
				await Promise.all(Array.from({ length: 5 }, () => addMenuItem(database, ctx, { dailyMenuId, recipeId })))
			}
		}

		const startDate = dates[0]
		const endDate = dates[dates.length - 1]
		const menus = await agentFetchMenus(db, ctx, { kitchenId, startDate, endDate })

		expect(menus.length).toBe(dates.length * mealTypeIds.length)
		expect(menus.every((m) => m.items.length === 5)).toBe(true)
		expect(JSON.stringify(menus).length).toBeLessThan(MAX_TOOL_RESULT_CHARS)
		// Timeout generoso: são 105 escritas contra o banco real, não um teste de latência.
	}, 120_000)

	test("agentGetTemplateItems traz dia, refeição e receita pelo nome", async () => {
		if (!reachable || !seeder || !db) return
		const sd = seeder
		const { id: kitchenId } = await sd.seedKitchen()
		const mealTypeId = await sd.seedMealType({ kitchenId })
		const recipeId = await sd.seedRecipe({ kitchenId: null })
		const templateId = await sd.seedTemplate({ kitchenId })
		await sd.seedTemplateItem({ templateId, mealTypeId, recipeId, dayOfWeek: 3 })

		const items = await agentGetTemplateItems(db, ctx, { templateId })

		expect(items).toHaveLength(1)
		expect(items[0].day_of_week).toBe(3)
		expect(items[0].meal_type).toBeTruthy()
		expect(items[0].recipe).toBeTruthy()
		expect(JSON.stringify(items)).not.toContain("cooking_factor")
	})
})
