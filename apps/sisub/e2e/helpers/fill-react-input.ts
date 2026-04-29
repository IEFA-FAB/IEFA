import type { Page } from "@playwright/test";

/**
 * Espera a hydration do React completar num elemento antes de interagir.
 *
 * React 19 com SSR (TanStack Start / Nitro) renderiza HTML no servidor,
 * mas os event handlers só são ativados após hydration. Se Playwright
 * preencher um input controlado antes disso, React re-renderiza e
 * reseta o valor para o state inicial (vazio).
 *
 * Detectamos hydration verificando a presença do React fiber no elemento.
 */
export async function waitForHydration(
  page: Page,
  selector: string,
  timeout = 30_000,
) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      // React 19 injects __reactFiber$ / __reactProps$ on hydrated elements
      return (
        el != null &&
        Object.keys(el).some(
          (k) =>
            k.startsWith("__reactFiber$") || k.startsWith("__reactProps$"),
        )
      );
    },
    selector,
    { timeout },
  );
}

/**
 * Preenche um input React controlado de forma confiável.
 *
 * 1. Espera hydration
 * 2. Foca o input
 * 3. Limpa e preenche via teclado (pressSequentially)
 * 4. Verifica que o valor persistiu (React state capturou)
 */
export async function fillReactInput(
  page: Page,
  selector: string,
  value: string,
) {
  await waitForHydration(page, selector);

  const locator = page.locator(selector);
  await locator.click();
  await locator.clear();
  await locator.pressSequentially(value, { delay: 10 });

  // Verifica que o valor persistiu após React processar
  await page.waitForTimeout(100);
  const actual = await locator.inputValue();
  if (actual !== value) {
    throw new Error(
      `fillReactInput(${selector}): expected "${value}" but got "${actual}"`,
    );
  }
}
