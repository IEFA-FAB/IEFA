import { devices, type Page } from "@playwright/test"
import { expect, test } from "../fixtures/auth"

/**
 * Shell no celular — a sidebar vira gaveta modal e o header divide 390px com a trilha.
 *
 * Os bugs, todos vistos em produção num iPhone:
 * - Na tela de escolher cozinha/unidade/refeitório o gatilho da gaveta sumia. No desktop a
 *   sidebar continua à vista; no celular não sobrava caminho para trocar de módulo nem sair.
 * - Tocar num item da gaveta navegava, mas a gaveta ficava aberta por cima da página nova.
 * - Trilha longa ("Unidade de Treinamento / Agendamento da Produção") empurrava a busca,
 *   os rascunhos e o tema para fora da tela.
 *
 * READ-ONLY: só navega. Precisa de uma cozinha REAL do usuário E2E (`E2E_KITCHEN_ID`).
 */

const KITCHEN_ID = process.env.E2E_KITCHEN_ID

// Viewport, toque e user agent do iPhone, no navegador do projeto: o preset traz
// `defaultBrowserType: "webkit"`, que trocaria o motor por baixo do `--project`.
const { defaultBrowserType: _, ...IPHONE } = devices["iPhone 13"]
test.use(IPHONE)

const drawer = (page: Page) => page.locator('[data-sidebar="sidebar"][data-mobile="true"]')
const trigger = (page: Page) => page.locator('[data-sidebar="trigger"]')
/** O header do shell — as páginas têm `<header>` próprios dentro do conteúdo. */
const SHELL_HEADER = '[data-slot="sidebar-inset"] > header'

/** Aguarda o React hidratar o gatilho — antes disso o toque não faz nada. */
async function waitForHydratedTrigger(page: Page) {
	await page.waitForFunction(() => {
		const el = document.querySelector('[data-sidebar="trigger"]')
		return !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber"))
	})
}

test.describe("Shell mobile", () => {
	test.skip(!KITCHEN_ID, "E2E_KITCHEN_ID ausente — o teste precisa de uma cozinha real do usuário E2E")

	test("tocar num item da gaveta navega e fecha a gaveta", async ({ authenticatedPage: page }) => {
		await page.goto(`/kitchen/${KITCHEN_ID}/weekly-menus`)
		await waitForHydratedTrigger(page)

		await trigger(page).tap()
		await expect(drawer(page)).toBeVisible()

		await drawer(page).locator(`a[href="/kitchen/${KITCHEN_ID}/events"]`).tap()
		await expect(page).toHaveURL(new RegExp(`/kitchen/${KITCHEN_ID}/events`))
		await expect(drawer(page)).toBeHidden()

		// E reabre — o gatilho não pode ficar coberto por uma gaveta que não fechou
		await trigger(page).tap()
		await expect(drawer(page)).toBeVisible()
	})

	test("o gatilho da gaveta existe na tela de escolher cozinha", async ({ authenticatedPage: page }) => {
		// Com uma cozinha só, o seletor escolhe sozinho e sai do hub; segurar as server fns
		// mantém o hub na tela (carregando) o tempo de conferir o header.
		await page.route("**/_serverFn/**", async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 4_000))
			await route.continue().catch(() => {})
		})
		await page.goto("/kitchen", { waitUntil: "commit" })
		await waitForHydratedTrigger(page)

		// Ainda no hub: o seletor carregando, sem ter escolhido a cozinha
		await expect(page.getByRole("heading", { name: "Selecionar Cozinha" })).toBeVisible()
		expect(new URL(page.url()).pathname).toBe("/kitchen")
		await expect(trigger(page)).toBeVisible()
		await trigger(page).tap()
		await expect(drawer(page)).toBeVisible()
		await page.unrouteAll({ behavior: "ignoreErrors" })
	})

	test("trilha longa não empurra as ações do header para fora da tela", async ({ authenticatedPage: page }) => {
		await page.goto(`/kitchen/${KITCHEN_ID}/planning`)
		await waitForHydratedTrigger(page)
		// A trilha só fica longa quando o nome da cozinha chega (escopo) e a página monta
		await expect(page.locator(SHELL_HEADER)).toContainText("Agendamento da Produção")
		await expect(page.getByRole("button", { name: "Alternar tema" })).toBeAttached()

		const overflow = await page.evaluate((selector) => {
			const header = document.querySelector(selector)
			if (!header) return null
			const viewport = window.innerWidth
			return Array.from(header.querySelectorAll("button, a"))
				.map((el) => el.getBoundingClientRect())
				.filter((rect) => rect.width > 0 && rect.right > viewport + 1).length
		}, SHELL_HEADER)
		expect(overflow).toBe(0)
	})
})
