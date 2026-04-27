import { expect, test } from "@playwright/test";

/**
 * Smoke tests — carregamento básico do app.
 * Não requerem autenticação.
 */
test.describe("Smoke — carregamento básico", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("página inicial carrega com status 200", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
  });

  test("página inicial não tem erros de JavaScript no console", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    // Aguarda carregamento — networkidle nunca resolve em apps com React Query/realtime
    await page.waitForLoadState("load");

    expect(errors).toHaveLength(0);
  });

  test("SSR: HTML da resposta contém conteúdo renderizado pelo servidor", async ({
    page,
  }) => {
    const response = await page.goto("/");
    const body = await response?.text();

    // Verifica que o HTML não é apenas um shell vazio — deve conter conteúdo real
    expect(body).toContain("SISUB");
    expect(body).not.toMatch(/<body>\s*<\/body>/);
  });

  test("página /auth carrega corretamente", async ({ page }) => {
    const response = await page.goto("/auth");
    expect(response?.status()).toBe(200);
    // Formulário de login visível
    await expect(page.locator("#login-email")).toBeVisible();
  });
});
