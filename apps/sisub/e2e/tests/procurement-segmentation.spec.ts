import { expect as baseExpect, test } from "../fixtures/auth"
import { deleteProcurementRows, deleteTemplate, dismissLegalNotice, seedWeeklyTemplate } from "../helpers/procurement"
import { createE2EServiceClient } from "../helpers/service"

/**
 * Segmentação das contratações, pela tela (change `sisub-procurement-planning-flows`):
 * o chefe do rancho cria a contratação "Carnes", inclui a pasta Proteinas, e o anexo dessa
 * contratação leva só os itens dela — os outros aparecem como "ficaram fora".
 *
 * ESCREVE na OM e na cozinha sentinelas do treino. O cardápio de teste é montado com a chave de
 * serviço; contratação e anexo são criados pela tela e apagados no fim.
 */
const UNIT_ID = Number(process.env.E2E_BUDGET_UNIT_ID ?? 0)
const KITCHEN_ID = Number(process.env.E2E_KITCHEN_ID ?? process.env.E2E_STORAGE_KITCHEN_ID ?? 0)
const RUN = `E2E ${Date.now().toString(36)}`
const SEGMENT = `${RUN} Carnes`

let templateId: string | null = null
let draftId: string | null = null

test.describe.configure({ mode: "serial" })
test.use({ actionTimeout: 30_000 })
test.setTimeout(240_000)
const expect = baseExpect.configure({ timeout: 30_000 })

test.describe("Segmentação das contratações", () => {
	test.skip(!UNIT_ID || !KITCHEN_ID, "E2E_BUDGET_UNIT_ID/E2E_KITCHEN_ID ausentes: esta spec escreve e só roda na sentinela do treino")

	test.beforeAll(async () => {
		templateId = await seedWeeklyTemplate(KITCHEN_ID, `${RUN} Semana`)
	})

	test.afterAll(async () => {
		if (draftId) await deleteProcurementRows("procurement_list", [draftId])
		const db = createE2EServiceClient()
		const { data } = await db.schema("procurement").from("procurement_segment").select("id").eq("unit_id", UNIT_ID).like("name", `${RUN}%`)
		await deleteProcurementRows(
			"procurement_segment",
			(data ?? []).map((row) => row.id as string)
		)
		await deleteTemplate(templateId)
	})

	test("cria a contratação e inclui uma pasta do catálogo", async ({ authenticatedPage: page }) => {
		await page.goto(`/unit/${UNIT_ID}/segments`)
		await expect(page.getByRole("heading", { name: "Segmentação das contratações" })).toBeVisible()
		await dismissLegalNotice(page)

		await page.getByRole("button", { name: "Nova contratação" }).click()
		const dialog = page.getByRole("dialog")
		await dialog.getByLabel("Nome").fill(SEGMENT)
		await dialog.getByRole("button", { name: "Criar contratação" }).click()
		await expect(dialog).toBeHidden()

		const card = page.locator("[data-slot=card]", { has: page.getByText(SEGMENT, { exact: true }) })
		await expect(card).toBeVisible()
		await expect(card.getByText(/Nenhuma regra/)).toBeVisible()

		await card
			.getByRole("combobox", { name: /Pasta do catálogo/ })
			.or(card.locator("button[id^=segment-folder-]"))
			.first()
			.click()
		await page.getByRole("combobox", { name: "Buscar pasta" }).fill("Proteinas")
		await page
			.getByRole("option", { name: /Proteinas/ })
			.first()
			.click()

		await expect(card.getByText("Inclui")).toBeVisible()
		// O frango do cardápio de teste passa a ter contratação.
		await expect(card.getByText(/[1-9]\d* ite(m|ns) dos cardápios da OM/)).toBeVisible()
	})

	test("o anexo da contratação leva só os itens dela", async ({ authenticatedPage: page }) => {
		await page.goto(`/unit/${UNIT_ID}/procurement/new`)
		await page.waitForURL(/draft=/)
		draftId = new URL(page.url()).searchParams.get("draft")
		// O wizard cria o rascunho, troca a URL e remonta a tela ao carregá-lo: clicar antes disso
		// acerta a versão que vai sumir.
		await page.waitForLoadState("networkidle")
		await dismissLegalNotice(page)

		// A lista de contratações chega depois do SSR; o link "Ver a segmentação" só aparece com ela.
		await expect(page.getByRole("link", { name: "Ver a segmentação" })).toBeVisible()
		await page.locator("#ata-segment").click()
		await page.getByRole("option", { name: new RegExp(SEGMENT) }).click()
		await expect(page.getByText(new RegExp(`O cálculo leva só (o item|os \\d+ itens) de ${SEGMENT}`))).toBeVisible()

		await page.locator(`label[for="template-${templateId}"]`).click()
		await page.getByRole("button", { name: /Próximo: Eventos/ }).click()
		await page.getByRole("button", { name: /Próximo: Apoios/ }).click()
		await page.getByRole("button", { name: /Próximo: Resumo/ }).click()
		await page.getByRole("button", { name: /Calcular Lista/ }).click()

		await expect(page.getByText(new RegExp(`ficaram? fora de ${SEGMENT}`))).toBeVisible()
		await expect(page.getByRole("row", { name: /Filé de Peito de Frango/ })).toBeVisible()
		// Condimento (Alecrim) não é carne: ficou fora do anexo desta contratação.
		await expect(page.getByRole("row", { name: /Alecrim/ })).toHaveCount(0)
		await page.waitForLoadState("networkidle")
	})
})
