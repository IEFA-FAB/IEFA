import { expect, test } from "../fixtures/auth"

/**
 * Smoke E2E da execução orçamentária (Gestão Unidade) — telas novas do
 * ciclo crédito → empenho → liquidação → pagamento → SIAFI → conciliação.
 *
 * READ-ONLY: as mutações são cobertas pelo E2E transacional com rollback
 * (src/test/operations/budget-execution.operations.test.ts). Aqui garantimos
 * que cada rota renderiza autenticada, com PBAC `unit`, SSR sem erro.
 */

const UNIT_ID = process.env.E2E_BUDGET_UNIT_ID ?? "1"

const SCREENS: { path: string; heading: RegExp }[] = [
	{ path: `/unit/${UNIT_ID}/credit`, heading: /Crédito Disponível/i },
	{ path: `/unit/${UNIT_ID}/empenhos`, heading: /Empenhos/i },
	{ path: `/unit/${UNIT_ID}/liquidations`, heading: /Liquidações/i },
	{ path: `/unit/${UNIT_ID}/payments`, heading: /Pagamentos/i },
	{ path: `/unit/${UNIT_ID}/siafi`, heading: /SIAFI/i },
	{ path: `/unit/${UNIT_ID}/reconciliation`, heading: /Conciliação/i },
]

test.describe("Execução orçamentária — Gestão Unidade", () => {
	for (const screen of SCREENS) {
		test(`renderiza ${screen.path}`, async ({ authenticatedPage }) => {
			const response = await authenticatedPage.goto(screen.path)
			expect(response?.status()).toBe(200)
			expect(authenticatedPage.url()).not.toContain("/auth")
			await expect(authenticatedPage.getByRole("heading", { name: screen.heading }).first()).toBeVisible({ timeout: 20_000 })
		})
	}

	test("crédito explica as três grandezas separadamente", async ({ authenticatedPage }) => {
		await authenticatedPage.goto(`/unit/${UNIT_ID}/credit`)
		await expect(authenticatedPage.getByText(/Saldo \(SIAFI\)|Nenhum crédito importado/i).first()).toBeVisible({ timeout: 20_000 })
	})
})
