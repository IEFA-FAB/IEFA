import { expect, test } from "@playwright/test";

/** Aguarda React hidratar o elemento antes de interagir via UI. */
async function waitForReactHydration(page: import("@playwright/test").Page, selector: string) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      return Object.keys(el).some((k) => k.startsWith("__reactFiber"));
    },
    selector,
    { timeout: 30_000 },
  );
}

/**
 * Testes de autenticação — fluxo de login via UI.
 * Todos os testes rodam sem storageState (página não autenticada).
 */
test.describe("Auth — fluxo de login via UI", () => {
  // Garante que estes testes rodam sem sessão ativa
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login com credenciais válidas redireciona para /hub", async ({
    page,
  }) => {
    const email = process.env.E2E_TEST_USER_EMAIL;
    const password = process.env.E2E_TEST_USER_PASSWORD;

    if (!email || !password) {
      test.skip(true, "E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD não definidas");
    }

    await page.goto("/auth");
    await expect(page.locator("#login-email")).toBeVisible();
    await waitForReactHydration(page, "#login-email");

    await page.fill("#login-email", email!);
    await page.fill("#login-password", password!);
    await page.click('button[type="submit"]:has-text("Entrar")');

    // Aguarda redirecionamento para /hub
    await page.waitForURL("/hub", { timeout: 15_000 });
    expect(page.url()).toContain("/hub");
  });

  test("login com credenciais inválidas exibe mensagem de erro e permanece em /auth", async ({
    page,
  }) => {
    await page.goto("/auth");
    await expect(page.locator("#login-email")).toBeVisible();
    await waitForReactHydration(page, "#login-email");

    // Credenciais inválidas — email válido (formato @fab.mil.br) mas senha errada
    await page.fill("#login-email", "usuario.invalido@fab.mil.br");
    await page.fill("#login-password", "senhaerrada123");
    await page.click('button[type="submit"]:has-text("Entrar")');

    // Deve exibir erro (Alert destructive) e permanecer na página /auth
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain("/auth");
  });

  test("rota protegida /hub redireciona para /auth quando não autenticado", async ({
    page,
  }) => {
    const response = await page.goto("/hub");
    // TanStack Router redireciona antes de servir conteúdo, ou a página carrega /auth
    await expect(page).toHaveURL(/\/auth/);
    expect(response?.status()).toBe(200);
  });
});
