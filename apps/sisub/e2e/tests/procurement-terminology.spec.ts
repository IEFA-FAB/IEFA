import { expect, test } from "../fixtures/auth"

/**
 * Vocabulário do planejamento da contratação alinhado à Lei 14.133/2021 (change
 * `sisub-procurement-planning-flows`, capability `procurement-terminology`). READ-ONLY.
 *
 * "Suprimentos" virou "Previsão de demanda" na Gestão Cozinha; o anexo quantitativo não se
 * "publica" (publicar é divulgar no PNCP), se conclui.
 */
const UNIT_ID = process.env.E2E_BUDGET_UNIT_ID
const KITCHEN_ID = process.env.E2E_KITCHEN_ID ?? process.env.E2E_STORAGE_KITCHEN_ID

test.describe("Terminologia do planejamento da contratação", () => {
	test("a cozinha envia a previsão de demanda, não 'suprimentos'", async ({ authenticatedPage: page }) => {
		test.skip(!KITCHEN_ID, "E2E_KITCHEN_ID ausente")
		await page.goto(`/kitchen/${KITCHEN_ID}/suprimentos`)
		await expect(page.getByRole("heading", { name: "Previsão de demanda" })).toBeVisible({ timeout: 20_000 })
		await expect(page.getByRole("link", { name: "Previsão de demanda" }).first()).toBeVisible()
		await expect(page.getByText("Suprimentos", { exact: true })).toHaveCount(0)
	})

	test("o anexo quantitativo não fala em publicar", async ({ authenticatedPage: page }) => {
		test.skip(!UNIT_ID, "E2E_BUDGET_UNIT_ID ausente")
		await page.goto(`/unit/${UNIT_ID}/dashboard`)
		await expect(page.getByText("Anexos concluídos").first()).toBeVisible({ timeout: 20_000 })
		await expect(page.getByText(/Anexos? publicad/)).toHaveCount(0)
	})
})
