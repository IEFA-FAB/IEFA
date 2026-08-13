import { test as base, type Page } from "@playwright/test"

type AuthFixtures = {
	authenticatedPage: Page
}

/**
 * Fixture `authenticatedPage` — página já autenticada via storageState.
 * O storageState é configurado globalmente em playwright.config.ts,
 * portanto todos os testes que usam este fixture têm sessão ativa.
 *
 * Uso:
 *   import { test, expect } from "../fixtures/auth"
 *   test("meu teste", async ({ authenticatedPage }) => { ... })
 */
export const test = base.extend<AuthFixtures>({
	// eslint-disable-next-line react-hooks/rules-of-hooks
	authenticatedPage: async ({ page }, use) => {
		// storageState já injetado via playwright.config.ts → use.storageState
		await use(page)
	},
})

// Convenção do Playwright: o teste importa `test` e `expect` do mesmo módulo de
// fixture — senão o `test` estendido e o `expect` base saem de lugares diferentes
// e é fácil importar o `test` errado.
export { expect } from "@playwright/test"
