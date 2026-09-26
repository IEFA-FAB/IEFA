/**
 * Imprevistos do Agendamento da Produção — contra o banco real.
 *
 * Cada caso é um edge case do catálogo `.claude/skills/edge-cases` (módulo Gestão Cozinha):
 * a viagem cancelada, adiada, adiada no próprio dia, a que surgiu; a preparação que faltou; o
 * substituto de insumo; o dia inteiro trocado por falta de luz/água; o evento que surgiu e o
 * que teve o cardápio trocado. O que se prova aqui é que o calendário absorve o imprevisto
 * sem obrigar o usuário a refazer o dia à mão.
 */

import { productionTaskInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import {
	applyEventTemplate,
	createTemplate,
	fetchDayDetails,
	getTrashItems,
	moveOriginToDate,
	removeOriginFromDay,
	replaceDayWithTemplate,
	replaceMenuItemRecipe,
	updateSubstitutions,
} from "@iefa/sisub-domain"
import { eq } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

type DayItem = {
	id: string
	recipe_origin_id: string | null
	planned_portion_quantity: number | string | null
	origin_template_id: string | null
	item_group: string | null
	substitutions: Record<string, { type?: string; rationale?: string; substitute_description?: string; from_recipe_id?: string }> | null
}
type DayMenu = { meal_type_id: string | null; menu_items: DayItem[] }

describeSupabaseIntegration("agendamento da produção — imprevistos", () => {
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

	/** Cozinha, refeição, duas preparações e um apoio de viagem (100 kits) e um cardápio de contingência. */
	async function scenario() {
		const sd = seeder
		const d = db
		if (!sd || !d) throw new Error("no seeder")
		const { id: kitchenId } = await sd.seedKitchen()
		sd.trackFn(() => sd.purgeKitchenMenus(kitchenId))
		sd.trackWhere("production_task", "kitchen_id", kitchenId)
		const mealTypeId = await sd.seedMealType({ kitchenId })
		const lanche = await sd.seedRecipe({ kitchenId: null, name: uid("[TEST] Sanduíche ") })
		const suco = await sd.seedRecipe({ kitchenId: null, name: uid("[TEST] Suco ") })
		const fria = await sd.seedRecipe({ kitchenId: null, name: uid("[TEST] Refeição fria ") })

		const viagem = await createTemplate(d, ctx, {
			name: uid("[TEST] Apoio viagem "),
			kitchenId,
			templateType: "exception",
			items: [
				{ dayOfWeek: 1, mealTypeId, recipeId: lanche, headcountOverride: 100, recommendedProportion: null },
				{ dayOfWeek: 1, mealTypeId, recipeId: suco, headcountOverride: 100, recommendedProportion: null },
			],
		})
		const contingencia = await createTemplate(d, ctx, {
			name: uid("[TEST] Contingência sem cocção "),
			kitchenId,
			templateType: "exception",
			items: [{ dayOfWeek: 1, mealTypeId, recipeId: fria, headcountOverride: 300, recommendedProportion: null }],
		})
		for (const id of [viagem.id, contingencia.id]) {
			sd.trackWhere("menu_template_items", "menu_template_id", id)
			sd.track("menu_template", id)
		}
		return { kitchenId, mealTypeId, lanche, suco, fria, viagemId: viagem.id, contingenciaId: contingencia.id }
	}

	async function day(kitchenId: number, date: string): Promise<DayItem[]> {
		if (!db) throw new Error("no db")
		const menus = (await fetchDayDetails(db, ctx, { kitchenId, date })) as unknown as DayMenu[]
		return menus.flatMap((m) => m.menu_items)
	}

	test("viagem cancelada: o apoio sai inteiro do dia, a rotina fica, e dá para restaurar", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, viagemId } = await scenario()
		const date = "2099-07-06"
		const rotina = await seeder.seedRecipe({ kitchenId })
		const { id: menuId } = await seeder.seedDailyMenu({ kitchenId, mealTypeId, serviceDate: date })
		await seeder.seedMenuItem({ dailyMenuId: menuId, recipeId: rotina, plannedPortionQuantity: 300 })
		await applyEventTemplate(db, ctx, { templateId: viagemId, kitchenId, dates: [date] })

		const result = await removeOriginFromDay(db, ctx, { kitchenId, date, originTemplateId: viagemId })
		expect(result.removed).toBe(2)
		expect((await day(kitchenId, date)).map((i) => i.recipe_origin_id)).toEqual([rotina])
		const trash = await getTrashItems(db, ctx, { kitchenId })
		expect(trash.length).toBeGreaterThanOrEqual(2)
	}, 30_000)

	test("viagem adiada: o apoio muda de data com o que foi ajustado no dia, e a tarefa pendente vai junto", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, viagemId, lanche } = await scenario()
		const from = "2099-07-13"
		const to = "2099-07-15"
		await applyEventTemplate(db, ctx, { templateId: viagemId, kitchenId, dates: [from] })
		const [sanduiche] = (await day(kitchenId, from)).filter((i) => i.recipe_origin_id === lanche)
		if (!sanduiche) throw new Error("apoio não aplicado")
		await db.insert(productionTaskInKitchen).values({ kitchenId, menuItemId: sanduiche.id, productionDate: from, status: "PENDING" })

		const result = await moveOriginToDate(db, ctx, { kitchenId, date: from, toDate: to, originTemplateId: viagemId })
		expect(result.moved).toBe(2)
		expect(await day(kitchenId, from)).toEqual([])
		const moved = await day(kitchenId, to)
		expect(moved.map((i) => i.id)).toContain(sanduiche.id)
		expect(moved.map((i) => Number(i.planned_portion_quantity))).toEqual([100, 100])
		const [task] = await db.select().from(productionTaskInKitchen).where(eq(productionTaskInKitchen.menuItemId, sanduiche.id))
		expect(task?.productionDate).toBe(to)

		// Adiar de novo para uma data que já tem o mesmo apoio é conflito, não soma.
		await applyEventTemplate(db, ctx, { templateId: viagemId, kitchenId, dates: [from] })
		await expect(moveOriginToDate(db, ctx, { kitchenId, date: from, toDate: to, originTemplateId: viagemId })).rejects.toThrow(/já está na data/)
	}, 30_000)

	test("viagem de hoje adiada depois que a produção começou: recusa, sem mover nada", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, viagemId, lanche } = await scenario()
		const today = "2099-07-20"
		await applyEventTemplate(db, ctx, { templateId: viagemId, kitchenId, dates: [today] })
		const [sanduiche] = (await day(kitchenId, today)).filter((i) => i.recipe_origin_id === lanche)
		if (!sanduiche) throw new Error("apoio não aplicado")
		await db.insert(productionTaskInKitchen).values({ kitchenId, menuItemId: sanduiche.id, productionDate: today, status: "IN_PROGRESS" })

		await expect(moveOriginToDate(db, ctx, { kitchenId, date: today, toDate: "2099-07-21", originTemplateId: viagemId })).rejects.toThrow(/em produção/)
		await expect(removeOriginFromDay(db, ctx, { kitchenId, date: today, originTemplateId: viagemId })).rejects.toThrow(/em produção/)
		expect(await day(kitchenId, today)).toHaveLength(2)
	}, 30_000)

	test("viagem que surgiu hoje: o apoio entra somando ao dia, sem apagar a rotina, e não duplica ao repetir", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, viagemId } = await scenario()
		const today = "2099-07-22"
		const rotina = await seeder.seedRecipe({ kitchenId })
		const { id: menuId } = await seeder.seedDailyMenu({ kitchenId, mealTypeId, serviceDate: today })
		await seeder.seedMenuItem({ dailyMenuId: menuId, recipeId: rotina, plannedPortionQuantity: 300 })

		await applyEventTemplate(db, ctx, { templateId: viagemId, kitchenId, dates: [today] })
		const again = await applyEventTemplate(db, ctx, { templateId: viagemId, kitchenId, dates: [today] })
		expect(again.itemsAlreadyApplied).toBe(2)
		expect(await day(kitchenId, today)).toHaveLength(3)
	}, 30_000)

	test("faltou um alimento: a preparação troca mantendo porções, grupo e origem, e o motivo fica no item", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, viagemId, lanche, fria } = await scenario()
		const date = "2099-07-27"
		await applyEventTemplate(db, ctx, { templateId: viagemId, kitchenId, dates: [date] })
		const [item] = (await day(kitchenId, date)).filter((i) => i.recipe_origin_id === lanche)
		if (!item) throw new Error("apoio não aplicado")

		await replaceMenuItemRecipe(db, ctx, { menuItemId: item.id, recipeId: fria, rationale: "Faltou pão francês" })
		const [swapped] = (await day(kitchenId, date)).filter((i) => i.id === item.id)
		expect(swapped?.recipe_origin_id).toBe(fria)
		expect(Number(swapped?.planned_portion_quantity)).toBe(100)
		expect(swapped?.origin_template_id).toBe(viagemId)
		expect(swapped?.substitutions?.recipe_swap?.from_recipe_id).toBe(lanche)
		expect(swapped?.substitutions?.recipe_swap?.rationale).toBe("Faltou pão francês")
	}, 30_000)

	test("faltou um insumo: o substituto fica registrado dentro da preparação, com o nome que o turno lê", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, viagemId, suco } = await scenario()
		const date = "2099-07-28"
		await applyEventTemplate(db, ctx, { templateId: viagemId, kitchenId, dates: [date] })
		const [item] = (await day(kitchenId, date)).filter((i) => i.recipe_origin_id === suco)
		if (!item) throw new Error("apoio não aplicado")
		const missing = "00000000-0000-4000-8000-00000000abcd"

		await updateSubstitutions(db, ctx, {
			menuItemId: item.id,
			substitutions: {
				[missing]: { type: "manual", rationale: "Laranja em falta", updated_at: new Date().toISOString(), substitute_description: "Polpa de acerola" },
			},
		})
		const [after] = (await day(kitchenId, date)).filter((i) => i.id === item.id)
		expect(after?.substitutions?.[missing]?.substitute_description).toBe("Polpa de acerola")
	}, 30_000)

	test("faltou luz ou água: o dia inteiro vira o cardápio de contingência, numa transação só", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, viagemId, contingenciaId, fria } = await scenario()
		const date = "2099-08-03"
		const rotina = await seeder.seedRecipe({ kitchenId })
		const { id: menuId } = await seeder.seedDailyMenu({ kitchenId, mealTypeId, serviceDate: date })
		await seeder.seedMenuItem({ dailyMenuId: menuId, recipeId: rotina, plannedPortionQuantity: 300 })
		await applyEventTemplate(db, ctx, { templateId: viagemId, kitchenId, dates: [date] })

		const result = await replaceDayWithTemplate(db, ctx, { kitchenId, date, templateId: contingenciaId })
		expect(result.removed).toBe(3)
		expect((await day(kitchenId, date)).map((i) => i.recipe_origin_id)).toEqual([fria])
	}, 30_000)

	test("evento que surgiu e depois teve o cardápio trocado por falta de luz antes do evento", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId, contingenciaId, fria, lanche } = await scenario()
		const date = "2099-08-10"
		const coquetelId = crypto.randomUUID()
		const evento = await createTemplate(db, ctx, {
			name: uid("[TEST] Evento surgido "),
			kitchenId,
			templateType: "event",
			eventMeals: [{ id: coquetelId, name: "Coquetel", mealTypeId, groups: [{ key: "volante", label: "Volantes" }], baseHeadcount: 150 }],
			items: [{ dayOfWeek: 1, mealTypeId, recipeId: lanche, itemGroup: "volante", recommendedProportion: null, eventMealId: coquetelId }],
		})
		seeder.trackWhere("menu_template_items", "menu_template_id", evento.id)
		seeder.track("menu_template", evento.id)

		await applyEventTemplate(db, ctx, { templateId: evento.id, kitchenId, dates: [date] })
		expect((await day(kitchenId, date)).map((i) => Number(i.planned_portion_quantity))).toEqual([150])

		// Só o evento troca: tira o que ele pôs e entra a contingência; a rotina do dia não é tocada.
		await removeOriginFromDay(db, ctx, { kitchenId, date, originTemplateId: evento.id })
		await applyEventTemplate(db, ctx, { templateId: contingenciaId, kitchenId, dates: [date] })
		expect((await day(kitchenId, date)).map((i) => i.recipe_origin_id)).toEqual([fria])
	}, 30_000)
})
