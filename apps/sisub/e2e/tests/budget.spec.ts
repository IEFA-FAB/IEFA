import { expect, test } from "../fixtures/auth"

/**
 * Smoke E2E da execução orçamentária (Gestão Unidade) — telas novas do
 * ciclo crédito → empenho → liquidação → pagamento → SIAFI → conciliação.
 *
 * READ-ONLY: as mutações são cobertas pelo E2E transacional com rollback
 * (src/test/operations/budget-execution.operations.test.ts). Aqui garantimos
 * que cada rota renderiza autenticada, com PBAC `unit`, SSR sem erro.
 */

/**
 * A tela é escopada por unidade, então a suíte precisa de uma unidade REAL onde o
 * usuário E2E tenha o módulo `unit`. O default silencioso que existia aqui ("1") era
 * pior que a ausência: em base onde a unidade 1 não é a do usuário, o PBAC devolvia
 * ao /hub e a falha tinha cara de bug de tela; onde ela existia por coincidência, o
 * teste passava sem ninguém ter escolhido o alvo. Sem a var, agora é skip EXPLÍCITO —
 * aparece como skipped no relatório, nunca como verde vazio.
 */
const UNIT_ID = process.env.E2E_BUDGET_UNIT_ID

test.skip(() => !UNIT_ID, "E2E_BUDGET_UNIT_ID não configurada — ver TESTING.md, seção E2E do sisub")

/** Só para o título do teste ficar legível quando a var falta e o run já está em skip. */
const UNIT_SEGMENT = UNIT_ID ?? "<E2E_BUDGET_UNIT_ID>"

const SCREENS: { path: string; heading: RegExp }[] = [
	{ path: `/unit/${UNIT_SEGMENT}/credit`, heading: /Crédito Disponível/i },
	{ path: `/unit/${UNIT_SEGMENT}/empenhos`, heading: /Empenhos/i },
	{ path: `/unit/${UNIT_SEGMENT}/liquidations`, heading: /Liquidações/i },
	{ path: `/unit/${UNIT_SEGMENT}/payments`, heading: /Pagamentos/i },
	{ path: `/unit/${UNIT_SEGMENT}/siafi`, heading: /SIAFI/i },
	{ path: `/unit/${UNIT_SEGMENT}/reconciliation`, heading: /Conciliação/i },
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
		await authenticatedPage.goto(`/unit/${UNIT_SEGMENT}/credit`)
		await expect(authenticatedPage.getByText(/Saldo \(SIAFI\)|Nenhum crédito importado/i).first()).toBeVisible({ timeout: 20_000 })
	})
})
