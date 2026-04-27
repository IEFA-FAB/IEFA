import { test as base, type Page } from "@playwright/test";

type AuthFixtures = {
  authenticatedPage: Page;
};

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
  authenticatedPage: async ({ page }, use) => {
    // storageState já injetado via playwright.config.ts → use.storageState
    await use(page);
  },
});

export { expect } from "@playwright/test";
