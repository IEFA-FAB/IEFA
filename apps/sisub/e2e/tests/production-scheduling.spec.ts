import type { Page } from "@playwright/test"
import { expect as baseExpect, test } from "../fixtures/auth"
import { waitForHydration } from "../helpers/fill-react-input"
import { createE2EServiceClient, isoDate } from "../helpers/service"

/**
 * Agendamento da Produção — os imprevistos do catálogo de edge cases (`.claude/skills/edge-cases`,
 * módulo Gestão Cozinha), feitos pela UI como a cozinha faria:
 *
 *   - viagem que SURGIU hoje (apoio de 100 kits entra somando ao dia);
 *   - a de hoje ADIOU (vai para a semana que vem), adiou de novo, e foi CANCELADA;
 *   - cardápio semanal: faltou um alimento (troca de preparação) e um insumo (substituto);
 *   - faltou luz/água: o dia INTEIRO vira o cardápio de contingência;
 *   - evento que surgiu e, com falta de luz antes dele, teve só o SEU cardápio trocado.
 *
 * ESCREVE na cozinha sentinela do treino (`E2E_KITCHEN_ID`). O cenário (apoio de viagem,
 * contingência, evento, semanal) é montado com a chave de serviço e desmontado no fim; toda
 * AÇÃO testada passa pela tela.
 */
const KITCHEN_ID = Number(process.env.E2E_KITCHEN_ID ?? process.env.E2E_STORAGE_KITCHEN_ID ?? 0)
const RUN = `E2E ${Date.now().toString(36)}`

type Recipe = { id: string; name: string; snapshot: Record<string, unknown> }
type Setup = {
	mealTypeId: string
	mealTypeName: string
	recipes: Recipe[]
	viagem: string
	contingencia: string
	evento: string
	semanal: string
	freeDates: string[]
	startedAt: string
}

let setup: Setup | null = null

test.describe.configure({ mode: "serial" })
// O dia recarrega do servidor depois de cada ajuste; no `vite dev` frio isso passa de 5s.
test.use({ actionTimeout: 20_000 })
const expect = baseExpect.configure({ timeout: 20_000 })

test.describe("Agendamento da Produção — imprevistos", () => {
	test.skip(!KITCHEN_ID, "E2E_KITCHEN_ID ausente: esta spec escreve e só roda na cozinha sentinela do treino")

	test.beforeAll(async () => {
		const db = createE2EServiceClient()
		const startedAt = new Date().toISOString()

		const { data: mealTypes, error: mtError } = await db
			.from("meal_type")
			.select("id, name")
			.is("kitchen_id", null)
			.is("deleted_at", null)
			.is("system_key", null)
			.ilike("name", "almo%")
			.limit(1)
		if (mtError || !mealTypes?.[0]) throw new Error(`tipo de refeição "almoço" global não encontrado: ${mtError?.message}`)
		const mealType = mealTypes[0]

		// Preparações globais com ficha (o substituto de insumo precisa de insumos no snapshot).
		const { data: rows, error: rError } = await db
			.from("recipes")
			.select("*, ingredients:recipe_ingredients(*, ingredient:ingredient(*))")
			.is("kitchen_id", null)
			.is("deleted_at", null)
			.not("name", "ilike", "[TEST]%")
			.order("name")
			.limit(80)
		if (rError) throw new Error(rError.message)
		const seen = new Set<string>()
		const recipes: Recipe[] = []
		for (const row of rows ?? []) {
			const name = String(row.name).trim()
			const lines = (row.ingredients as { ingredient_id: string | null; deleted_at: string | null }[]).filter((l) => l.ingredient_id && !l.deleted_at)
			if (seen.has(name) || lines.length < 2) continue
			seen.add(name)
			recipes.push({ id: row.id, name, snapshot: { ...row, ingredients: lines } })
			if (recipes.length === 4) break
		}
		if (recipes.length < 4) throw new Error("preparações globais com ficha insuficientes")
		const [a, b, c, d] = recipes as [Recipe, Recipe, Recipe, Recipe]

		const template = async (name: string, type: "weekly" | "event" | "exception") => {
			const { data, error } = await db.from("menu_template").insert({ name, kitchen_id: KITCHEN_ID, template_type: type }).select("id").single()
			if (error) throw new Error(error.message)
			return data.id as string
		}
		const viagem = await template(`${RUN} Apoio viagem`, "exception")
		const contingencia = await template(`${RUN} Contingência sem cocção`, "exception")
		const evento = await template(`${RUN} Evento surgido`, "event")
		const semanal = await template(`${RUN} Semana`, "weekly")

		const items = (templateId: string, list: { recipe: Recipe; pax: number; eventMealId?: string }[]) =>
			list.map(({ recipe, pax, eventMealId }) => ({
				menu_template_id: templateId,
				day_of_week: 1,
				meal_type_id: mealType.id,
				recipe_id: recipe.id,
				headcount_override: pax,
				...(eventMealId ? { event_meal_id: eventMealId, item_group: "volante" } : {}),
			}))
		const { data: meal, error: emError } = await db
			.from("menu_template_event_meal")
			.insert({ menu_template_id: evento, name: "Coquetel", meal_type_id: mealType.id, groups: [{ key: "volante", label: "Volantes" }], base_headcount: 150 })
			.select("id")
			.single()
		if (emError) throw new Error(emError.message)
		const { error: iError } = await db.from("menu_template_items").insert([
			...items(viagem, [
				{ recipe: a, pax: 100 },
				{ recipe: b, pax: 100 },
			]),
			...items(contingencia, [{ recipe: c, pax: 300 }]),
			...items(evento, [{ recipe: d, pax: 150, eventMealId: meal.id }]),
		])
		if (iError) throw new Error(iError.message)

		// Dias livres no futuro (sem cardápio na sentinela): "trocar o dia" não pode tocar planejamento alheio.
		const horizon = [...Array(60).keys()].map((i) => isoDate(20 + i))
		const { data: busy } = await db
			.from("daily_menu")
			.select("service_date")
			.eq("kitchen_id", KITCHEN_ID)
			.is("deleted_at", null)
			.gte("service_date", horizon[0] as string)
			.lte("service_date", horizon.at(-1) as string)
		const busyDates = new Set((busy ?? []).map((r) => r.service_date as string))
		const freeDates = horizon.filter((date) => !busyDates.has(date)).slice(0, 2)
		if (freeDates.length < 2) throw new Error("sem dias livres na sentinela")

		// Cardápio semanal aplicado no primeiro dia livre: duas preparações da rotina, 300 comensais.
		const { data: menu, error: dmError } = await db
			.from("daily_menu")
			.insert({ kitchen_id: KITCHEN_ID, service_date: freeDates[0], meal_type_id: mealType.id, status: "PLANNED", forecasted_headcount: 300 })
			.select("id")
			.single()
		if (dmError) throw new Error(dmError.message)
		const { error: miError } = await db.from("menu_items").insert(
			[a, b].map((recipe, index) => ({
				daily_menu_id: menu.id,
				recipe_origin_id: recipe.id,
				recipe: recipe.snapshot,
				planned_portion_quantity: 300,
				sort_order: index,
				origin_template_id: semanal,
				origin_template_type: "weekly",
			}))
		)
		if (miError) throw new Error(miError.message)

		setup = { mealTypeId: mealType.id, mealTypeName: mealType.name ?? "almoço", recipes, viagem, contingencia, evento, semanal, freeDates, startedAt }
	})

	test.afterAll(async () => {
		if (!setup) return
		const db = createE2EServiceClient()
		const ids = [setup.viagem, setup.contingencia, setup.evento, setup.semanal]
		const dates = [isoDate(0), isoDate(7), isoDate(9), ...setup.freeDates]
		// Só o que ESTA spec criou: itens das origens dela (inclusive os da lixeira) e, depois, os
		// cardápios do dia criados durante a execução que ficaram sem item nenhum. Cardápio de
		// outra pessoa na sentinela tem itens dela e não casa — nada alheio sai por data.
		const { data: touched } = await db.from("menu_items").select("daily_menu_id").in("origin_template_id", ids)
		await db.from("menu_items").delete().in("origin_template_id", ids)
		const candidates = [...new Set((touched ?? []).map((r) => r.daily_menu_id as string | null).filter((id): id is string => id != null))]
		if (candidates.length > 0) {
			const { data: created } = await db
				.from("daily_menu")
				.select("id, menu_items(id)")
				.eq("kitchen_id", KITCHEN_ID)
				.in("id", candidates)
				.in("service_date", dates)
				.gte("created_at", setup.startedAt)
			const empty = (created ?? []).filter((m) => ((m.menu_items as unknown[] | null) ?? []).length === 0).map((m) => m.id as string)
			if (empty.length > 0) await db.from("daily_menu").delete().in("id", empty)
		}
		await db.from("menu_template_items").delete().in("menu_template_id", ids)
		await db.from("menu_template").delete().in("id", ids)
	})

	test("viagem que surgiu hoje, adiou para a semana que vem, adiou de novo e foi cancelada", async ({ authenticatedPage: page }) => {
		test.setTimeout(240_000)
		const today = isoDate(0)
		const nextWeek = isoDate(7)
		const later = isoDate(9)
		const viagem = `${RUN} Apoio viagem`

		await gotoPlanning(page)

		// Surgiu hoje: entra somando ao dia.
		await openDay(page, today)
		await applyOccasion(page, "add", viagem)
		await expect(originRow(page, viagem)).toContainText("2 preparações")
		await page.screenshot({ path: "test-results/production-scheduling-trip-today.png" })

		// A de hoje adiou para a semana que vem.
		await postpone(page, viagem, nextWeek)
		await expect(originRow(page, viagem)).toHaveCount(0)
		await closeDay(page)

		await openDay(page, nextWeek)
		await expect(originRow(page, viagem)).toContainText("2 preparações")
		// Adiou de novo.
		await postpone(page, viagem, later)
		await closeDay(page)

		// Foi cancelada.
		await openDay(page, later)
		await expect(originRow(page, viagem)).toBeVisible()
		await originRow(page, viagem)
			.getByRole("button", { name: /^Tirar .* do dia$/ })
			.click()
		await page.getByRole("alertdialog").getByRole("button", { name: "Tirar do dia" }).click()
		await expect(originRow(page, viagem)).toHaveCount(0)
	})

	test("cardápio semanal: faltou um alimento, faltou um insumo e depois faltou luz no dia", async ({ authenticatedPage: page }) => {
		test.setTimeout(240_000)
		const s = setup as Setup
		const [a, b, c] = s.recipes as [Recipe, Recipe, Recipe]
		const day = s.freeDates[0] as string

		await gotoPlanning(page)
		await openDay(page, day)
		await expect(originRow(page, `${RUN} Semana`)).toContainText("2 preparações")
		await page
			.getByRole("button", { name: new RegExp(s.mealTypeName, "i") })
			.first()
			.click()

		// Faltou o alimento de A: troca pela C, com o motivo.
		await page.getByRole("button", { name: `Trocar preparação ${a.name}` }).click()
		const selector = page.locator('[data-slot="dialog-content"]')
		await selector.getByPlaceholder("Buscar por nome, código ou pasta...").fill(c.name.slice(0, 18))
		await selector.getByRole("checkbox").first().click()
		await selector.getByRole("button", { name: /Confirmar \(1\)/ }).click()
		const why = page.getByRole("alertdialog")
		await why.getByLabel("Motivo").fill("Faltou no fornecedor (E2E)")
		await why.getByRole("button", { name: "Trocar preparação" }).click()
		await expect(page.getByText(`Trocada (era ${a.name})`)).toBeVisible()

		// Faltou um insumo de B: substituto dentro da preparação.
		await page.getByRole("button", { name: `Substituir ingredientes de ${b.name}` }).click()
		const modal = page.locator('[data-slot="dialog-content"]')
		await modal.locator("button[aria-pressed]").first().click()
		await modal.locator("#substitute-name").fill("Substituto E2E")
		await modal.locator("#substitute-rationale").fill("Insumo em falta (E2E)")
		await modal.getByRole("button", { name: "Registrar substituição" }).click()
		await expect(page.getByText("1 insumo substituído")).toBeVisible()
		await page.screenshot({ path: "test-results/production-scheduling-weekly-adjusted.png" })

		// Faltou luz: o dia inteiro vira a contingência.
		await applyOccasion(page, "replace", `${RUN} Contingência sem cocção`)
		await expect(originRow(page, `${RUN} Contingência sem cocção`)).toContainText("1 preparação")
		await expect(originRow(page, `${RUN} Semana`)).toHaveCount(0)
	})

	test("evento que surgiu e, com falta de luz antes dele, teve só o seu cardápio trocado", async ({ authenticatedPage: page }) => {
		test.setTimeout(240_000)
		const s = setup as Setup
		const day = s.freeDates[1] as string
		const evento = `${RUN} Evento surgido`
		const contingencia = `${RUN} Contingência sem cocção`

		await gotoPlanning(page)
		await openDay(page, day)
		await applyOccasion(page, "add", evento)
		await expect(originRow(page, evento)).toContainText("1 preparação")

		await originRow(page, evento)
			.getByRole("button", { name: /^Tirar .* do dia$/ })
			.click()
		await page.getByRole("alertdialog").getByRole("button", { name: "Tirar do dia" }).click()
		await expect(originRow(page, evento)).toHaveCount(0)
		await applyOccasion(page, "add", contingencia)
		await expect(originRow(page, contingencia)).toBeVisible()
		await page.screenshot({ path: "test-results/production-scheduling-day.png" })
	})
})

async function gotoPlanning(page: Page) {
	await page.goto(`/kitchen/${KITCHEN_ID}/planning`)
	await expect(page.getByRole("heading", { name: "Agendamento da Produção" })).toBeVisible({ timeout: 30_000 })
}

/** Abre o dia no calendário, avançando o mês quando a data ainda não está na grade. */
async function openDay(page: Page, iso: string) {
	// Grade hidratada antes de navegar: o "Próximo mês" clicado antes disso não faz nada.
	await waitForHydration(page, "[data-date]")
	for (let attempt = 0; attempt < 4; attempt++) {
		const cell = page.locator(`[data-date="${iso}"]`).first()
		if ((await cell.count()) > 0) {
			// Clique antes da hidratação não abre o dia (o botão ainda não tem handler).
			await waitForHydration(page, `[data-date="${iso}"]`)
			await cell.click()
			await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible()
			return
		}
		const month = await page.locator("[data-date]").first().getAttribute("data-date")
		await page.getByRole("button", { name: "Próximo mês" }).click()
		await expect(page.locator("[data-date]").first()).not.toHaveAttribute("data-date", month ?? "")
	}
	throw new Error(`dia ${iso} não apareceu no calendário`)
}

async function closeDay(page: Page) {
	await page.keyboard.press("Escape")
	await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0)
}

function originRow(page: Page, name: string) {
	return page.getByRole("region", { name: "Cardápios neste dia" }).getByRole("listitem").filter({ hasText: name })
}

async function applyOccasion(page: Page, mode: "add" | "replace", name: string) {
	await page.getByRole("button", { name: mode === "add" ? "Aplicar evento ou apoio" : "Trocar o dia" }).click()
	const dialog = page.locator('[data-slot="dialog-content"]')
	await dialog.locator("#day-occasion").click()
	await page.getByRole("option", { name }).click()
	await dialog.getByRole("button", { name: mode === "add" ? "Aplicar neste dia" : "Trocar o dia" }).click()
	await expect(dialog).toHaveCount(0)
}

async function postpone(page: Page, name: string, toDate: string) {
	await originRow(page, name)
		.getByRole("button", { name: `Adiar ${name}` })
		.click()
	const dialog = page.getByRole("alertdialog")
	await dialog.locator("#origin-move-date").fill(toDate)
	await dialog.getByRole("button", { name: "Adiar" }).click()
	await expect(dialog).toHaveCount(0)
}
