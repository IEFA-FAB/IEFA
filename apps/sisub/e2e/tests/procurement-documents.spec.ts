import { expect as baseExpect, test } from "../fixtures/auth"
import { deleteProcurementRows, deleteTemplate, dismissLegalNotice, seedWeeklyTemplate } from "../helpers/procurement"

/**
 * Documentos do anexo quantitativo, pela tela (change `sisub-procurement-planning-flows`, D6/D7):
 * o chefe do rancho monta o anexo com um preço pesquisado, copia a tabela para o TR (com e sem
 * orçamento sigiloso), abre a memória de cálculo e gera o relatório de pesquisa de preços como
 * emissão registrada, com a integridade conferida e a série em CSV.
 *
 * ESCREVE na OM e na cozinha sentinelas do treino. Consulta a API pública do Compras.gov.br.
 */
const UNIT_ID = Number(process.env.E2E_BUDGET_UNIT_ID ?? 0)
const KITCHEN_ID = Number(process.env.E2E_KITCHEN_ID ?? process.env.E2E_STORAGE_KITCHEN_ID ?? 0)
const RUN = `E2E ${Date.now().toString(36)}`

let templateId: string | null = null
let annexId: string | null = null

test.describe.configure({ mode: "serial" })
test.use({ actionTimeout: 30_000, permissions: ["clipboard-read", "clipboard-write"] })
test.setTimeout(300_000)
const expect = baseExpect.configure({ timeout: 30_000 })

test.describe("Anexo quantitativo — documentos do processo", () => {
	test.skip(!UNIT_ID || !KITCHEN_ID, "E2E_BUDGET_UNIT_ID/E2E_KITCHEN_ID ausentes: esta spec escreve e só roda na sentinela do treino")

	test.beforeAll(async () => {
		templateId = await seedWeeklyTemplate(KITCHEN_ID, `${RUN} Semana`)
	})

	test.afterAll(async () => {
		if (annexId) await deleteProcurementRows("procurement_list", [annexId])
		await deleteTemplate(templateId)
	})

	test("monta o anexo com um preço pesquisado", async ({ authenticatedPage: page }) => {
		await page.goto(`/unit/${UNIT_ID}/procurement/new`)
		await page.waitForURL(/draft=/)
		annexId = new URL(page.url()).searchParams.get("draft")
		await page.waitForLoadState("networkidle")
		await dismissLegalNotice(page)

		await page.locator(`label[for="template-${templateId}"]`).click()
		await page.getByRole("button", { name: /Próximo: Eventos/ }).click()
		await page.getByRole("button", { name: /Próximo: Apoios/ }).click()
		await page.getByRole("button", { name: /Próximo: Resumo/ }).click()
		await page.locator("#ata-title").fill(`${RUN} Anexo`)
		await page.getByRole("button", { name: /Calcular Lista/ }).click()

		await page
			.getByRole("row", { name: /Filé de Peito de Frango/ })
			.getByRole("button", { name: "Ações" })
			.click()
		await page.getByRole("menuitem", { name: "Pesquisar preço" }).click()
		const dialog = page.getByRole("dialog")
		await expect(dialog.getByRole("button", { name: /^Preço \/ KG/ })).toBeVisible({ timeout: 90_000 })
		await dialog
			.locator("div", { has: page.getByText("Mediana", { exact: true }) })
			.getByRole("button", { name: "Usar" })
			.last()
			.click()
		await expect(dialog).toBeHidden()
		await page.waitForLoadState("networkidle")

		await page.getByRole("button", { name: "Salvar anexo" }).click()
		await page.waitForURL(new RegExp(`/procurement/${annexId}$`))
		await expect(page.getByText("Documentos do processo")).toBeVisible()
	})

	test("copia a tabela para o TR, com e sem orçamento sigiloso", async ({ authenticatedPage: page }) => {
		await page.goto(`/unit/${UNIT_ID}/procurement/${annexId}`)
		await dismissLegalNotice(page)
		await page.getByRole("button", { name: "Copiar tabela para o TR" }).click()
		await expect(page.getByText(/Tabela copiada: cole no Anexo do TR/)).toBeVisible()
		let copied = ""
		await expect.poll(async () => (copied = await page.evaluate(() => navigator.clipboard.readText()))).toContain("Preço unitário estimado (R$)")
		expect(copied.split("\n")[0]).toContain("Preço unitário estimado (R$)")
		expect(copied).toContain("Quantidade mínima a ser cotada")

		await page.getByRole("switch", { name: "Orçamento sigiloso" }).click()
		await expect(page.getByRole("switch", { name: "Orçamento sigiloso" })).toBeChecked()
		await page.waitForLoadState("networkidle")
		await page.getByRole("button", { name: "Copiar tabela para o TR" }).click()
		// A cópia é assíncrona: espera a área de transferência mudar em vez de ler na hora.
		await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).not.toContain("Preço unitário estimado")
		copied = await page.evaluate(() => navigator.clipboard.readText())
		expect(copied.split("\n")[0]).toContain("Quantidade mínima a ser cotada")
	})

	test("abre a memória de cálculo das quantidades", async ({ authenticatedPage: page }) => {
		await page.goto(`/unit/${UNIT_ID}/procurement/${annexId}`)
		await dismissLegalNotice(page)
		await page.getByRole("button", { name: "Memória de cálculo das quantidades" }).click()
		await expect(page.getByRole("heading", { name: "Memória de cálculo das quantidades" }).first()).toBeVisible()
		// A parcela do cardápio de teste: 100 comensais.
		await expect(page.getByRole("cell", { name: `${RUN} Semana (semanal)` }).first()).toBeVisible()
		await expect(page.getByRole("button", { name: "Imprimir / Salvar PDF" })).toBeVisible()
	})

	test("gera o relatório de pesquisa de preços como emissão conferível", async ({ authenticatedPage: page }) => {
		await page.goto(`/unit/${UNIT_ID}/procurement/${annexId}`)
		await dismissLegalNotice(page)
		await page.getByRole("button", { name: "Relatório de pesquisa de preços" }).click()
		await page.getByRole("button", { name: /Gerar nova emissão/ }).click()
		await expect(page.getByRole("heading", { name: "Relatório de pesquisa de preços" }).first()).toBeVisible()
		await expect(page.getByText(/Emissão nº 1/).first()).toBeVisible()
		await expect(page.getByText("Integridade conferida", { exact: false }).first()).toBeVisible()
		await expect(page.getByText(/^[0-9a-f]{64}$/).first()).toBeVisible()

		const download = page.waitForEvent("download")
		await page.getByRole("button", { name: "Série de preços (CSV)" }).click()
		expect((await download).suggestedFilename()).toBe("serie-precos-emissao-1.csv")
	})
})
