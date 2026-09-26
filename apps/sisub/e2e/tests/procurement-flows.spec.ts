import { expect as baseExpect, test } from "../fixtures/auth"
import { deleteProcurementRows, deleteTemplate, dismissLegalNotice, seedWeeklyTemplate } from "../helpers/procurement"
import { createE2EServiceClient } from "../helpers/service"

/**
 * Fluxos guiados, pela tela (change `sisub-procurement-planning-flows`), com os dois lados:
 *
 * 1. a nutricionista abre "Prever demanda para compra", segue o atalho, monta e envia a previsão
 *    e volta ao fluxo pelo "Voltar ao fluxo";
 * 2. o chefe do rancho vê a previsão no fluxo "Planejar contratação", segue para o anexo e a
 *    importa;
 * 3. o fluxo da cozinha passa a mostrar a previsão como recebida pela unidade.
 *
 * ESCREVE na OM e na cozinha sentinelas do treino. O cardápio é montado com a chave de serviço;
 * previsão e anexo são criados pela tela e apagados no fim.
 */
const UNIT_ID = Number(process.env.E2E_BUDGET_UNIT_ID ?? 0)
const KITCHEN_ID = Number(process.env.E2E_KITCHEN_ID ?? process.env.E2E_STORAGE_KITCHEN_ID ?? 0)
const RUN = `E2E ${Date.now().toString(36)}`
const FORECAST = `${RUN} Previsão`

let templateId: string | null = null
let annexId: string | null = null

test.describe.configure({ mode: "serial" })
test.use({ actionTimeout: 30_000 })
test.setTimeout(240_000)
const expect = baseExpect.configure({ timeout: 30_000 })

test.describe("Fluxos guiados — cozinha e unidade", () => {
	test.skip(!UNIT_ID || !KITCHEN_ID, "E2E_BUDGET_UNIT_ID/E2E_KITCHEN_ID ausentes: esta spec escreve e só roda na sentinela do treino")

	test.beforeAll(async () => {
		templateId = await seedWeeklyTemplate(KITCHEN_ID, `${RUN} Semana`)
	})

	test.afterAll(async () => {
		if (annexId) await deleteProcurementRows("procurement_list", [annexId])
		const db = createE2EServiceClient()
		const drafts = await db.schema("procurement").from("kitchen_ata_draft").delete().eq("kitchen_id", KITCHEN_ID).like("title", `${RUN}%`)
		if (drafts.error) throw new Error(`limpeza das previsões: ${drafts.error.message}`)
		await deleteTemplate(templateId)
	})

	test("a nutricionista segue o fluxo, envia a previsão e volta ao fluxo", async ({ authenticatedPage: page }) => {
		page.on("dialog", (dialog) => dialog.accept())
		await page.goto(`/kitchen/${KITCHEN_ID}/flows`)
		await dismissLegalNotice(page)
		await page.getByRole("link", { name: /Prever demanda para compra/ }).click()
		await expect(page.getByRole("heading", { name: "Prever demanda para compra" })).toBeVisible()

		const sendStep = page.getByRole("listitem").filter({ hasText: "Enviar a previsão à unidade" })
		// Os atalhos do fluxo são `Button` renderizando `Link`: o papel acessível é de botão.
		await sendStep.getByRole("button", { name: /Nova previsão|Previsões enviadas/ }).click()
		await expect(page.getByRole("button", { name: /Voltar ao fluxo: Prever demanda para compra/ })).toBeVisible()

		if (!/\/suprimentos\/new/.test(page.url())) await page.goto(`/kitchen/${KITCHEN_ID}/suprimentos/new`)
		await page.waitForLoadState("networkidle")
		await page.locator("#draft-title").fill(FORECAST)
		await page.locator(`label[for="draft-${templateId}"]`).click()
		await page.getByRole("button", { name: "Salvar previsão" }).click()
		await page.waitForURL(/\/suprimentos\/[0-9a-f-]{36}/)
		await page.waitForLoadState("networkidle")
		// O toast de "criada" fica sobre os botões do rodapé; espera ele sair.
		await expect(page.getByText(`Previsão "${FORECAST}" criada!`)).toBeHidden({ timeout: 20_000 })
		// A edição monta com as seleções salvas; antes disso o botão está desabilitado.
		const send = page.getByRole("button", { name: "Enviar à unidade" })
		await expect(send).toBeEnabled()
		await send.click()
		await expect(page.getByText("Previsão enviada à unidade!")).toBeVisible()
		await page.waitForURL(new RegExp(`/kitchen/${KITCHEN_ID}/suprimentos/?$`))

		// O atalho sobreviveu às navegações da etapa e leva de volta ao fluxo.
		await page.getByRole("button", { name: /Voltar ao fluxo: Prever demanda para compra/ }).click()
		await expect(page.getByText(new RegExp(`"${FORECAST}" enviada`))).toBeVisible()
	})

	test("o chefe do rancho vê a previsão no fluxo e a importa no anexo", async ({ authenticatedPage: page }) => {
		await page.goto(`/unit/${UNIT_ID}/flows/procurement-planning`)
		await dismissLegalNotice(page)
		const forecasts = page.getByRole("listitem").filter({ hasText: "Previsão de demanda das cozinhas" })
		await expect(forecasts.getByText(new RegExp(`enviou "${FORECAST}"`))).toBeVisible()

		const annexStep = page.getByRole("listitem").filter({ hasText: "Anexo quantitativo" }).first()
		await annexStep.getByRole("button", { name: /Novo anexo/ }).click()
		await page.waitForURL(/draft=/)
		annexId = new URL(page.url()).searchParams.get("draft")
		await page.waitForLoadState("networkidle")
		await expect(page.getByRole("button", { name: /Voltar ao fluxo: Planejar contratação/ })).toBeVisible()

		await expect(page.getByText("Previsão de demanda enviada pela cozinha")).toBeVisible()
		await page.getByRole("button", { name: "Importar previsão" }).click()
		await expect(page.getByText(/Já importada neste anexo/)).toBeVisible()
	})

	test("a cozinha vê a previsão recebida pela unidade, com o anexo", async ({ authenticatedPage: page }) => {
		await page.goto(`/kitchen/${KITCHEN_ID}/flows/demand-forecast`)
		await dismissLegalNotice(page)
		await expect(page.getByText(new RegExp(`"${FORECAST}" recebida pela unidade`))).toBeVisible()
	})
})
