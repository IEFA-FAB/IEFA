import { expect as baseExpect, test } from "../fixtures/auth"
import { waitForHydration } from "../helpers/fill-react-input"
import { createE2EServiceClient } from "../helpers/service"

/**
 * Catálogo global de eventos, do jeito que a cozinha o usa: o modelo da SDAB aparece no
 * catálogo e, adaptado para a cozinha, a cópia chega com as refeições próprias do evento —
 * nome, efetivo e a porcentagem de cada preparação.
 *
 * A EDIÇÃO do modelo global exige `global:2`, que a conta dedicada do e2e não tem; ela é
 * coberta pela suíte de integração (`templates.operations.test.ts`: evento global criado,
 * editado no escopo global e adaptado por cozinha, com ids novos na cópia).
 *
 * Escreve: um evento global de vida curta (montado e removido pela chave de serviço) e a
 * adaptação na cozinha sentinela, removida no fim.
 */
const KITCHEN_ID = Number(process.env.E2E_KITCHEN_ID ?? process.env.E2E_STORAGE_KITCHEN_ID ?? 0)
const RUN = `E2E ${Date.now().toString(36)}`
const MODEL = `${RUN} Evento modelo`
const expect = baseExpect.configure({ timeout: 20_000 })

let globalId: string | null = null

test.describe("Catálogo global — evento com refeições próprias", () => {
	test.skip(!KITCHEN_ID, "E2E_KITCHEN_ID ausente: esta spec escreve e só roda na cozinha sentinela do treino")

	test.beforeAll(async () => {
		const db = createE2EServiceClient()
		const { data: mealTypes } = await db
			.from("meal_type")
			.select("id")
			.is("kitchen_id", null)
			.is("deleted_at", null)
			.is("system_key", null)
			.ilike("name", "jantar%")
			.limit(1)
		const { data: recipes } = await db.from("recipes").select("id").is("kitchen_id", null).is("deleted_at", null).not("name", "ilike", "[TEST]%").limit(1)
		const mealTypeId = mealTypes?.[0]?.id
		const recipeId = recipes?.[0]?.id
		if (!mealTypeId || !recipeId) throw new Error("jantar global ou preparação global não encontrados")

		const { data: tpl, error } = await db.from("menu_template").insert({ name: MODEL, kitchen_id: null, template_type: "event" }).select("id").single()
		if (error) throw new Error(error.message)
		globalId = tpl.id as string
		const { data: meal, error: mError } = await db
			.from("menu_template_event_meal")
			.insert({
				menu_template_id: globalId,
				name: "Coquetel de gala",
				meal_type_id: mealTypeId,
				groups: [{ key: "volante", label: "Volantes" }],
				base_headcount: 200,
			})
			.select("id")
			.single()
		if (mError) throw new Error(mError.message)
		const { error: iError } = await db.from("menu_template_items").insert({
			menu_template_id: globalId,
			day_of_week: 1,
			meal_type_id: mealTypeId,
			recipe_id: recipeId,
			event_meal_id: meal.id,
			item_group: "volante",
			recommended_proportion: 50,
		})
		if (iError) throw new Error(iError.message)
	})

	test.afterAll(async () => {
		if (!globalId) return
		const db = createE2EServiceClient()
		const { data: forks } = await db.from("menu_template").select("id").eq("base_template_id", globalId)
		const ids = [...(forks ?? []).map((f) => f.id as string), globalId]
		await db.from("menu_template_items").delete().in("menu_template_id", ids)
		await db.from("menu_template").delete().in("id", ids)
	})

	test("o modelo aparece no catálogo global e a adaptação da cozinha herda refeição, efetivo e %", async ({ authenticatedPage: page }) => {
		test.setTimeout(180_000)

		await page.goto("/global/events")
		await expect(page.getByRole("heading", { name: "Eventos Modelo" })).toBeVisible()
		await expect(page.getByText(MODEL)).toBeVisible()

		await page.goto(`/kitchen/${KITCHEN_ID}/events`)
		const row = page.getByRole("row").filter({ hasText: MODEL })
		await expect(row).toBeVisible()
		await waitForHydration(page, "#main-content, main")
		await row.getByText("Adaptar").click()
		await page.waitForURL(/forkFrom=/)
		await waitForHydration(page, "#name")
		await page.getByRole("button", { name: "Criar Adaptação" }).click()
		await page.waitForURL(new RegExp(`/kitchen/${KITCHEN_ID}/events/[0-9a-f-]{36}$`))

		await expect(page.getByLabel("Efetivo de Coquetel de gala")).toHaveValue("200")
		await expect(page.getByLabel("Porcentagem do efetivo da refeição").first()).toHaveValue("50")
		await expect(page.getByText("= 100")).toBeVisible()
		await page.screenshot({ path: "test-results/global-catalog-fork.png" })
	})
})
