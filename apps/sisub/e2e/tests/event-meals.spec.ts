import { expect, test } from "../fixtures/auth"
import { waitForHydration } from "../helpers/fill-react-input"

/**
 * Evento com refeições próprias — o fluxo inteiro, do jeito que a cozinha usa.
 *
 * Diferente das demais specs, esta ESCREVE: cria um evento, monta uma refeição com efetivo,
 * põe uma preparação em porcentagem, confere que tudo volta depois de recarregar e remove o
 * evento no fim (soft-delete, vai para a lixeira). Por isso roda só na cozinha sentinela do
 * treino (`E2E_KITCHEN_ID`, 920 para a conta dedicada), que o reset de treino limpa — sem a
 * variável, a spec inteira vira skip explícito.
 *
 * O que só o navegador prova: o diálogo da refeição grava nome, horário e efetivo; o
 * "Adicionar" do cabeçalho põe a preparação no primeiro grupo da composição; a porcentagem
 * digitada no quadro sobrevive ao auto-save e ao recarregamento.
 */
const KITCHEN_ID = process.env.E2E_KITCHEN_ID ?? process.env.E2E_STORAGE_KITCHEN_ID

test.describe("Evento — refeições próprias com efetivo e porcentagem", () => {
	test.skip(!KITCHEN_ID, "E2E_KITCHEN_ID ausente: esta spec escreve e só roda na cozinha sentinela do treino")

	test("cria refeição com efetivo, adiciona preparação em % e o conteúdo sobrevive ao recarregar", async ({ authenticatedPage: page }) => {
		test.setTimeout(180_000)
		const eventName = `[E2E] Evento ${Date.now()}`
		page.on("dialog", (dialog) => dialog.accept())

		// 1. Novo evento
		await page.goto(`/kitchen/${KITCHEN_ID}/events/new`)
		await waitForHydration(page, "#name")
		await page.locator("#name").fill(eventName)
		await page.getByRole("button", { name: "Criar Evento" }).click()
		await page.waitForURL(new RegExp(`/kitchen/${KITCHEN_ID}/events/(?!new)[0-9a-f-]{36}`), { timeout: 30_000 })
		const eventUrl = page.url()

		try {
			// 2. Refeição do evento: nome, horário e efetivo
			await expect(page.getByText("Este evento ainda não tem refeições.")).toBeVisible({ timeout: 30_000 })
			await page.getByRole("button", { name: "Nova refeição" }).first().click()
			const mealDialog = page.getByRole("dialog")
			await mealDialog.locator("#event-meal-name").fill("Coquetel")
			await mealDialog.locator("#event-meal-slot").click()
			await page.getByRole("option").first().click()
			await mealDialog.locator("#event-meal-base").fill("300")
			await mealDialog.getByRole("button", { name: "Adicionar refeição" }).click()
			await expect(mealDialog).toBeHidden()

			await expect(page.getByLabel("Efetivo de Coquetel")).toHaveValue("300")

			// 3. Preparação pelo "Adicionar" do cabeçalho da refeição
			await page.getByRole("button", { name: "Adicionar", exact: true }).first().click()
			const selector = page.getByRole("dialog")
			await expect(selector.getByText("Selecionar Preparações")).toBeVisible()
			await selector.getByRole("checkbox").first().click()
			await selector.getByRole("button", { name: /Confirmar \(1\)/ }).click()
			await expect(selector).toBeHidden()

			// 4. Porcentagem do efetivo: com efetivo, a preparação nova nasce medida em %
			const proportion = page.getByLabel("Porcentagem do efetivo da refeição").first()
			await expect(proportion).toBeVisible()
			await proportion.fill("60")

			// 5. Auto-save (1,5s de pausa) e recarregamento
			await expect(page.getByText("Salvo")).toBeVisible({ timeout: 30_000 })
			await page.goto(eventUrl)
			await expect(page.getByLabel("Efetivo de Coquetel")).toHaveValue("300", { timeout: 30_000 })
			await expect(page.getByLabel("Porcentagem do efetivo da refeição").first()).toHaveValue("60")
			await expect(page.getByText("Entradas").first()).toBeVisible()
		} finally {
			// Limpeza: o evento vai para a lixeira mesmo se uma asserção acima falhar.
			await page.goto(`/kitchen/${KITCHEN_ID}/events`)
			const row = page.getByRole("row", { name: new RegExp(eventName.replace(/[[\]]/g, "\\$&")) })
			await row.getByRole("button", { name: "Remover" }).click()
			await expect(row).toBeHidden({ timeout: 30_000 })
		}
	})
})
