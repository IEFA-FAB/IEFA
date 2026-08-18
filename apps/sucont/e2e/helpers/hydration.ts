import type { Page } from "@playwright/test"

/**
 * Espera o React montar sobre o HTML do SSR.
 *
 * O TanStack Start com Nitro entrega a marcação pronta: o seletor existe no
 * primeiro byte, mas `onChange`/`onClick` só passam a existir depois da
 * hidratação. Um `setInputFiles` antes disso é aceito pelo DOM e ignorado pelo
 * React — o teste falha depois, num lugar que não é o do defeito.
 */
export async function waitForHydration(page: Page, selector: string): Promise<void> {
	await page.waitForSelector(selector, { state: "attached", timeout: 60_000 })
	await page.waitForFunction(
		(sel) => {
			const element = document.querySelector(sel)
			return !!element && Object.keys(element).some((key) => key.startsWith("__reactFiber"))
		},
		selector,
		{ timeout: 60_000 }
	)
}
