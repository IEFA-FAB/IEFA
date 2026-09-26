import type { Page } from "@playwright/test"
import { expect, test } from "../fixtures/auth"

/**
 * Troca de módulo pelo ModuleSwitcher — a sidebar não pode andar na frente da página.
 *
 * O bug: o `useLocation` troca no clique, os `matches` (de onde o AppShell tira o
 * `scopeContext`) só quando a rota nova termina de carregar. Nessa janela a sidebar
 * mostrava os itens do módulo NOVO com o id de escopo do ANTIGO — de `/storage/920/…`,
 * trocar para "Gestão Unidade" desenhava `/unit/920/dashboard`. Clicar ali caía no
 * `requirePermission` de uma unidade que não existe e voltava ao `/hub?denied=unit`.
 *
 * A janela é curta demais para um clique humano reproduzir sempre, então o teste a
 * alarga: segura o chunk da rota de destino (a rota é code-split, e o router só
 * confirma os `matches` depois de carregar o componente). Um MutationObserver grava
 * todo href que passou pela sidebar, inclusive os de um frame só.
 *
 * Os três tipos de escopo (cozinha, OM, refeitório) e níveis diferentes do perfil da conta
 * dedicada: `storage:3`, `unit:2`, `kitchen:2`, `messhall:2`, `local-analytics:2`.
 *
 * READ-ONLY: só navega. Precisa de cozinha, unidade e refeitório REAIS do usuário E2E —
 * `E2E_STORAGE_KITCHEN_ID`, `E2E_BUDGET_UNIT_ID` e `E2E_MESSHALL_ID`; cada cenário sem a
 * sua var faz skip explícito.
 */

const KITCHEN_ID = process.env.E2E_STORAGE_KITCHEN_ID
const UNIT_ID = process.env.E2E_BUDGET_UNIT_ID
const MESS_HALL_ID = process.env.E2E_MESSHALL_ID

/** Quanto o chunk da rota de destino fica retido — a janela em que o bug aparecia. */
const HOLD_MS = 2_500

type Scenario = {
	name: string
	scopeId: string | undefined
	missingVar: string
	/** Página de partida, dentro de um escopo */
	from: (id: string) => string
	/** Nome do módulo de destino no ModuleSwitcher */
	targetModule: RegExp
	/** Id do módulo de destino — prefixo das URLs da sidebar dele */
	targetModuleId: string
	/** Título do hub de destino, para saber que a navegação terminou */
	targetHeading: RegExp
}

const SCENARIOS: Scenario[] = [
	{
		name: "cozinha → unidade",
		scopeId: KITCHEN_ID,
		missingVar: "E2E_STORAGE_KITCHEN_ID",
		from: (id) => `/storage/${id}/dashboard`,
		targetModule: /Gestão Unidade/,
		targetModuleId: "unit",
		targetHeading: /Selecionar Unidade/i,
	},
	{
		name: "unidade → cozinha",
		scopeId: UNIT_ID,
		missingVar: "E2E_BUDGET_UNIT_ID",
		from: (id) => `/unit/${id}/dashboard`,
		targetModule: /Gestão Cozinha/,
		targetModuleId: "kitchen",
		targetHeading: /Selecionar Cozinha/i,
	},
	{
		name: "refeitório → análises da unidade",
		scopeId: MESS_HALL_ID,
		missingVar: "E2E_MESSHALL_ID",
		from: (id) => `/messhall/${id}/`,
		targetModule: /Análises da Unidade/,
		targetModuleId: "local-analytics",
		targetHeading: /Análises da Unidade/i,
	},
]

const sidebar = (page: Page) => page.locator('[data-sidebar="sidebar"]')

/** Espera o React hidratar a sidebar — antes disso o clique no switcher não abre menu. */
async function waitForSidebarHydration(page: Page) {
	await page.waitForFunction(
		() => {
			const el = document.querySelector('[data-sidebar="sidebar"] [data-sidebar="menu-button"]')
			return !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber"))
		},
		undefined,
		{ timeout: 30_000 }
	)
}

/**
 * Grava todo href que passou pela sidebar. Lê os REGISTROS de mutação, não só o DOM do
 * momento: um link inserido e trocado na mesma task já saiu do DOM quando o callback roda,
 * mas continua no `addedNodes` do registro (e o `target` diz onde ele foi inserido).
 */
async function recordSidebarHrefs(page: Page) {
	await page.evaluate(() => {
		const SIDEBAR = '[data-sidebar="sidebar"]'
		const seen = new Set<string>()
		const add = (a: Element) => {
			const href = a.getAttribute("href")
			if (href) seen.add(href)
		}
		for (const a of document.querySelectorAll(`${SIDEBAR} a[href]`)) add(a)
		new MutationObserver((records) => {
			for (const record of records) {
				if (!(record.target instanceof Element) || !record.target.closest(SIDEBAR)) continue
				if (record.type === "attributes") {
					if (record.target.matches("a[href]")) add(record.target)
					continue
				}
				for (const node of record.addedNodes) {
					if (!(node instanceof Element)) continue
					if (node.matches("a[href]")) add(node)
					for (const a of node.querySelectorAll("a[href]")) add(a)
				}
			}
		}).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["href"] })
		;(window as unknown as { __sidebarHrefs: Set<string> }).__sidebarHrefs = seen
	})
	return () => page.evaluate(() => [...(window as unknown as { __sidebarHrefs: Set<string> }).__sidebarHrefs])
}

/**
 * Retém os módulos JS da rota de destino. Devolve quantas requisições foram retidas —
 * zero significa que o chunk já estava carregado e a janela não foi reproduzida.
 */
async function holdTargetRouteChunk(page: Page, moduleId: string) {
	let held = 0
	await page.route(
		(url) => url.pathname.includes(`/routes/_protected/_modules/${moduleId}/`),
		async (route) => {
			held++
			await new Promise((resolve) => setTimeout(resolve, HOLD_MS))
			// O teste pode terminar (e fechar a página) antes do fim da retenção — o clique na
			// sidebar cancela a navegação que pediu o chunk. Continuar numa página fechada não
			// é falha do teste.
			await route.continue().catch(() => {})
		}
	)
	return () => held
}

async function switchModule(page: Page, target: RegExp) {
	// O primeiro menu-button do cabeçalho é o gatilho do ModuleSwitcher
	await sidebar(page).locator('[data-sidebar="header"] [data-sidebar="menu-button"]').first().click()
	await page.getByRole("menuitem", { name: target }).click()
}

for (const s of SCENARIOS) {
	test.describe(`ModuleSwitcher — ${s.name}`, () => {
		test.skip(() => !s.scopeId, `${s.missingVar} não configurada — ver TESTING.md, seção E2E do sisub`)

		const scopeId = s.scopeId ?? `<${s.missingVar}>`
		/** O link que o bug desenhava: módulo novo com o escopo do antigo */
		const wrongPrefix = `/${s.targetModuleId}/${scopeId}`

		test("sidebar não mistura o módulo novo com o escopo antigo durante a navegação", async ({ authenticatedPage: page }) => {
			await page.goto(s.from(scopeId))
			await waitForSidebarHydration(page)
			// Sidebar já no escopo de partida. O item da rota index sai sem a barra final
			// (`/messhall/237`), então o seletor aceita o prefixo exato e o prefixo com barra.
			const fromPrefix = s.from(scopeId).split("/").slice(0, 3).join("/")
			await expect(sidebar(page).locator(`a[href="${fromPrefix}"], a[href^="${fromPrefix}/"]`).first()).toBeVisible({ timeout: 15_000 })

			const readHrefs = await recordSidebarHrefs(page)
			const heldCount = await holdTargetRouteChunk(page, s.targetModuleId)

			await switchModule(page, s.targetModule)

			// A URL já é a do hub de destino enquanto o chunk está retido: é a janela do bug
			await expect(page).toHaveURL(new RegExp(`/${s.targetModuleId}/?$`))
			await expect(page.getByRole("heading", { name: s.targetHeading })).toBeVisible({ timeout: 15_000 })

			expect(heldCount(), "nenhum chunk da rota de destino foi retido — a janela pendente não foi reproduzida").toBeGreaterThan(0)

			const hrefs = await readHrefs()
			const wrong = hrefs.filter((h) => h === wrongPrefix || h.startsWith(`${wrongPrefix}/`))
			expect(wrong, `a sidebar desenhou links de ${s.targetModuleId} com o escopo ${scopeId} do módulo anterior`).toEqual([])
		})

		test("clicar na sidebar logo após trocar de módulo não cai em página negada", async ({ authenticatedPage: page }) => {
			await page.goto(s.from(scopeId))
			await waitForSidebarHydration(page)

			await holdTargetRouteChunk(page, s.targetModuleId)
			await switchModule(page, s.targetModule)
			await expect(page).toHaveURL(new RegExp(`/${s.targetModuleId}/?$`))

			// Ainda dentro da janela pendente: clica no primeiro item de navegação da sidebar. O
			// link do escopo ("<nome> — trocar") é o único com aria-label e aponta para o hub —
			// fica de fora, senão o teste clicaria nele e passaria sem tocar nos itens.
			const navLink = sidebar(page).locator('[data-sidebar="content"] a[href]:not([aria-label])').first()
			await expect(navLink).toBeVisible()
			const href = (await navLink.getAttribute("href")) ?? ""
			// soft: com o link errado o clique ainda acontece, e o relatório mostra também onde ele leva
			expect.soft(href, "o item clicado aponta para o módulo novo com o escopo antigo").not.toMatch(new RegExp(`^${wrongPrefix}(/|$)`))
			await navLink.click()

			// O link errado não dava erro na tela: o PBAC negava o escopo alheio e devolvia ao
			// /hub (que limpa o `?denied`). Então a prova é chegar exatamente onde o link apontava.
			const trim = (path: string) => path.replace(/\/+$/, "")
			const landing = trim(new URL(href, page.url()).pathname)
			await expect(page).toHaveURL((url) => trim(url.pathname) === landing, { timeout: 15_000 })
			await expect(page.getByText(/Página não encontrada|Algo deu errado/)).toHaveCount(0)
		})
	})
}
