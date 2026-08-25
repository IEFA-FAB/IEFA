import { expect, test } from "../fixtures/auth"

/**
 * Ficha técnica — os dois campos que a tela de preenchimento passou a ter.
 *
 * O que só o navegador prova: o pré-preparo é um campo SEPARADO do modo de preparo (e
 * não um segundo rótulo do mesmo `<textarea>`), e a base de digitação converte nos dois
 * sentidos sem perder o dado — a conversão acontece a cada tecla, então um resíduo de
 * ponto flutuante apareceria aqui e em lugar nenhum na suíte unitária.
 *
 * Nada é SALVO: o formulário é exercitado em modo "criar" e abandonado. A escrita da
 * coluna nova é coberta pela suíte de integração (`recipes.operations.test.ts`), contra
 * o banco real e com rollback.
 */

/** Espera o React hidratar o elemento — input controlado preenchido antes disso é resetado. */
async function waitForHydration(page: import("@playwright/test").Page, selector: string) {
	await page.waitForFunction(
		(sel) => {
			const el = document.querySelector(sel)
			return el != null && Object.keys(el).some((k) => k.startsWith("__reactFiber"))
		},
		selector,
		{ timeout: 30_000 }
	)
}

test.describe("Ficha técnica — preenchimento da preparação", () => {
	test("pré-preparo e modo de preparo são campos independentes", async ({ authenticatedPage: page }) => {
		await page.goto("/global/recipes/new?tab=preparo")

		const prePreparo = page.getByLabel("Pré-preparo", { exact: true })
		const modoPreparo = page.getByLabel("Modo de preparo", { exact: true })

		await expect(prePreparo).toBeVisible()
		await expect(modoPreparo).toBeVisible()

		await waitForHydration(page, "#pre-prep")
		await prePreparo.fill("Dessalgar por 12 h, trocando a água 3 vezes.")
		await modoPreparo.fill("Refogar e cozinhar por 40 min.")

		// O ponto do teste: um campo não escreve no outro.
		await expect(prePreparo).toHaveValue("Dessalgar por 12 h, trocando a água 3 vezes.")
		await expect(modoPreparo).toHaveValue("Refogar e cozinhar por 40 min.")
	})

	test("base de digitação converte porção ↔ rendimento sem alterar o dado", async ({ authenticatedPage: page }) => {
		await page.goto("/global/recipes/new?tab=detalhes")

		// Rendimento primeiro: é o fator da conversão.
		await waitForHydration(page, "#portion_yield")
		const rendimento = page.locator("#portion_yield")
		await rendimento.fill("100")
		await expect(rendimento).toHaveValue("100")

		await page.getByRole("tab", { name: "Ingredientes" }).click()

		// Um insumo qualquer do catálogo — a linha é o que importa, não qual insumo é.
		await page.getByRole("button", { name: "Adicionar", exact: true }).click()
		const dialog = page.getByRole("dialog")
		await dialog.getByPlaceholder("Buscar insumo...").fill("arroz")
		// Linhas de INSUMO trazem 📦; as de pasta vêm desabilitadas.
		const primeiroInsumo = dialog.locator('button:has-text("📦")').first()
		await expect(primeiroInsumo).toBeEnabled({ timeout: 30_000 })
		await primeiroInsumo.click()

		// Base "Rendimento": o campo é o PL total.
		await page.getByRole("button", { name: /^Digitar a quantidade do rendimento inteiro$/ }).click()
		const plTotal = page.getByLabel(/^Peso líquido total de /)
		await expect(plTotal).toBeVisible()
		await plTotal.fill("50")
		await expect(plTotal).toHaveValue("50")

		// Base "Porção": o campo passa a ser o per capita, com 50 ÷ 100 = 0,5 — e o total
		// gravado aparece derivado ao lado.
		await page.getByRole("button", { name: /^Digitar a quantidade de uma porção$/ }).click()
		const porPorcao = page.getByLabel(/^Peso líquido por porção de /)
		await expect(porPorcao).toBeVisible()
		await expect(porPorcao).toHaveValue("0.5")
		await expect(page.getByRole("cell", { name: "50", exact: true }).first()).toBeVisible()

		// Digitar por porção multiplica pelo rendimento: 0,25 × 100 = 25.
		await porPorcao.fill("0.25")
		await expect(porPorcao).toHaveValue("0.25")
		await expect(page.getByRole("cell", { name: "25", exact: true }).first()).toBeVisible()

		// De volta à base "Rendimento": o campo mostra o total, sem resíduo de ponto flutuante.
		await page.getByRole("button", { name: /^Digitar a quantidade do rendimento inteiro$/ }).click()
		await expect(page.getByLabel(/^Peso líquido total de /)).toHaveValue("25")
	})
})
