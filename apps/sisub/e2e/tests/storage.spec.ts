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

/**
 * As telas são escopadas por cozinha, então a suíte precisa de uma cozinha REAL onde
 * o usuário E2E tenha o módulo `storage`. O default silencioso que existia aqui ("1")
 * era pior que a ausência: onde a cozinha 1 não é a do usuário, o PBAC devolvia ao
 * /hub e a falha tinha cara de bug de tela; onde ela existia por coincidência, o teste
 * passava sem ninguém ter escolhido o alvo. Sem a var, agora é skip EXPLÍCITO — o
 * relatório mostra skipped, nunca verde vazio.
 *
 * O hub `/storage` não depende do id e roda de todo jeito? Não: o skip é do arquivo
 * inteiro, de propósito. Sem cozinha atribuída, "listar cozinhas para seleção" também
 * não tem o que provar.
 */
const KITCHEN_ID = process.env.E2E_STORAGE_KITCHEN_ID

test.skip(() => !KITCHEN_ID, "E2E_STORAGE_KITCHEN_ID não configurada — ver TESTING.md, seção E2E do sisub")

/** Só para o título do teste ficar legível quando a var falta e o run já está em skip. */
const KITCHEN_SEGMENT = KITCHEN_ID ?? "<E2E_STORAGE_KITCHEN_ID>"

const SCREENS: { path: string; heading: RegExp }[] = [
	{ path: `/storage/${KITCHEN_SEGMENT}/dashboard`, heading: /Painel de Estoque/i },
	{ path: `/storage/${KITCHEN_SEGMENT}/nfe`, heading: /Notas Fiscais/i },
	{ path: `/storage/${KITCHEN_SEGMENT}/supply-orders`, heading: /Ordens de Fornecimento/i },
	{ path: `/storage/${KITCHEN_SEGMENT}/receiving`, heading: /Recebimentos/i },
	{ path: `/storage/${KITCHEN_SEGMENT}/production-issue`, heading: /Baixa por Produção/i },
	{ path: `/storage/${KITCHEN_SEGMENT}/counts`, heading: /Contagem Física/i },
	{ path: `/storage/${KITCHEN_SEGMENT}/reports`, heading: /Relatórios MCASP/i },
	{ path: `/storage/${KITCHEN_SEGMENT}/replenishment`, heading: /Sugestões de Reposição/i },
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
		await authenticatedPage.goto(`/storage/${KITCHEN_SEGMENT}/dashboard`)
		await expect(authenticatedPage.getByText(/Itens em estoque/i).first()).toBeVisible({ timeout: 20_000 })
		await expect(authenticatedPage.getByText(/Vencendo em 30 dias/i).first()).toBeVisible()
	})

	test("relatórios MCASP mostram balancete e fechamentos", async ({ authenticatedPage }) => {
		await authenticatedPage.goto(`/storage/${KITCHEN_SEGMENT}/reports`)
		await expect(authenticatedPage.getByText(/Balancete/i).first()).toBeVisible({ timeout: 20_000 })
		await expect(authenticatedPage.getByText(/Empenho × Liquidação/i).first()).toBeVisible()
	})
})
