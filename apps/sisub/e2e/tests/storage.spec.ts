import { expect, test } from "../fixtures/auth"

/**
 * Smoke E2E do módulo Estoque (storage) — telas novas do ciclo de estoque.
 *
 * READ-ONLY de propósito: as mutações do ciclo (NF-e → recebimento → baixa →
 * fechamento) são cobertas pelo E2E transacional com rollback
 * (src/test/operations/inventory-cycle.e2e.operations.test.ts) — aqui o
 * objetivo é garantir que cada rota renderiza autenticada, com PBAC storage,
 * SSR sem erro e os cabeçalhos certos.
 *
 * Pré-requisito: usuário E2E com permissão `storage` nível 3 (global) —
 * concedida via seed (access_control.user_permissions).
 */

const KITCHEN_ID = process.env.E2E_STORAGE_KITCHEN_ID ?? "1"

const SCREENS: { path: string; heading: RegExp }[] = [
	{ path: `/storage/${KITCHEN_ID}/dashboard`, heading: /Painel de Estoque/i },
	{ path: `/storage/${KITCHEN_ID}/nfe`, heading: /Notas Fiscais/i },
	{ path: `/storage/${KITCHEN_ID}/supply-orders`, heading: /Ordens de Fornecimento/i },
	{ path: `/storage/${KITCHEN_ID}/receiving`, heading: /Recebimentos/i },
	{ path: `/storage/${KITCHEN_ID}/production-issue`, heading: /Baixa por Produção/i },
	{ path: `/storage/${KITCHEN_ID}/counts`, heading: /Contagem Física/i },
	{ path: `/storage/${KITCHEN_ID}/reports`, heading: /Relatórios MCASP/i },
	{ path: `/storage/${KITCHEN_ID}/replenishment`, heading: /Sugestões de Reposição/i },
]

test.describe("Storage — módulo de estoque", () => {
	test("hub /storage lista cozinhas para seleção de escopo", async ({ authenticatedPage }) => {
		const response = await authenticatedPage.goto("/storage")
		expect(response?.status()).toBe(200)
		await expect(authenticatedPage).toHaveURL(/\/storage/)
		expect(authenticatedPage.url()).not.toContain("/auth")
		await expect(authenticatedPage.getByText(/Selecionar Cozinha/i).first()).toBeVisible({ timeout: 15_000 })
	})

	for (const screen of SCREENS) {
		test(`renderiza ${screen.path}`, async ({ authenticatedPage }) => {
			const response = await authenticatedPage.goto(screen.path)
			expect(response?.status()).toBe(200)
			// não caiu no login nem foi devolvido ao /hub por falta de permissão
			expect(authenticatedPage.url()).not.toContain("/auth")
			await expect(authenticatedPage).toHaveURL(new RegExp(screen.path.replaceAll("/", "\\/")))
			await expect(authenticatedPage.getByRole("heading", { name: screen.heading }).first()).toBeVisible({ timeout: 20_000 })
		})
	}

	test("dashboard mostra os cards de resumo do ledger", async ({ authenticatedPage }) => {
		await authenticatedPage.goto(`/storage/${KITCHEN_ID}/dashboard`)
		await expect(authenticatedPage.getByText(/Itens em estoque/i).first()).toBeVisible({ timeout: 20_000 })
		await expect(authenticatedPage.getByText(/Vencendo em 30 dias/i).first()).toBeVisible()
	})

	test("relatórios MCASP mostram balancete e fechamentos", async ({ authenticatedPage }) => {
		await authenticatedPage.goto(`/storage/${KITCHEN_ID}/reports`)
		await expect(authenticatedPage.getByText(/Balancete/i).first()).toBeVisible({ timeout: 20_000 })
		await expect(authenticatedPage.getByText(/Empenho × Liquidação/i).first()).toBeVisible()
	})
})
