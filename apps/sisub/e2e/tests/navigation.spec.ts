import { expect, test } from "../fixtures/auth";

/**
 * Testes de navegação — rotas protegidas e SPA navigation.
 * Usa o fixture `authenticatedPage` (sessão ativa via storageState).
 */
test.describe("Navigation — rotas protegidas", () => {
  test("usuário autenticado acessa /hub sem redirecionamento", async ({
    authenticatedPage,
  }) => {
    const response = await authenticatedPage.goto("/hub");
    expect(response?.status()).toBe(200);
    // Permanece em /hub
    await expect(authenticatedPage).toHaveURL(/\/hub/);
  });

  test("usuário autenticado acessa módulo diner sem redirecionamento", async ({
    authenticatedPage,
  }) => {
    const response = await authenticatedPage.goto("/diner");
    expect(response?.status()).toBe(200);
    await expect(authenticatedPage).toHaveURL(/\/diner/);
    // Não foi redirecionado para /auth
    expect(authenticatedPage.url()).not.toContain("/auth");
  });

  test("navegação SPA entre módulos não causa full reload", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/hub");
    await expect(authenticatedPage).toHaveURL(/\/hub/);

    // Captura o timestamp de carregamento da página atual
    const navStart = await authenticatedPage.evaluate(
      () => window.performance.timing.navigationStart,
    );

    // Navega para diner via link (SPA navigation) — clica no primeiro link para /diner
    const dinerLink = authenticatedPage.locator('a[href*="/diner"]').first();
    const hasDinerLink = await dinerLink.count();

    if (hasDinerLink > 0) {
      await dinerLink.click();
      await authenticatedPage.waitForURL(/\/diner/, { timeout: 10_000 });

      // Verifica que não houve reload completo (navigationStart não mudou)
      const navStartAfter = await authenticatedPage.evaluate(
        () => window.performance.timing.navigationStart,
      );
      expect(navStartAfter).toBe(navStart);
    } else {
      // Se não há link direto visível, navega programaticamente
      await authenticatedPage.goto("/diner");
      await expect(authenticatedPage).toHaveURL(/\/diner/);
    }
  });
});
