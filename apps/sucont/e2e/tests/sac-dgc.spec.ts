import { basename } from "node:path"
import { expect, test } from "@playwright/test"
import { makePanelFixtures } from "../helpers/fixtures"
import { waitForHydration } from "../helpers/hydration"

/**
 * Fluxo do SAC-DGC pelo navegador de verdade.
 *
 * O que só o E2E prova, e nenhum teste de unidade prova:
 *  - o guard de rota deixa a conta com grant `sucont` entrar em /sac-dgc;
 *  - o FileReader do navegador entrega os bytes windows-1252 que o parser espera
 *    (as fixtures são cp1252 de propósito — é o export real do Tesouro Gerencial);
 *  - a rota Nitro `/api/sacdgc/analyze` está REGISTRADA (ela já respondeu 307 para
 *    /auth por não estar declarada em `handlers`, sem nada falhar).
 */

// Este spec não analisa nada, então não escreve no banco e não precisa de faxina.
// Usa as mesmas cópias marcadas do spec de IA para não haver dois caminhos de fixture.
const { files: PANEL_FILES } = makePanelFixtures()

async function carregarBase(page: import("@playwright/test").Page) {
	await page.goto("/sac-dgc")
	await expect(page.getByRole("heading", { name: /SAC-DGC/i })).toBeVisible()
	await waitForHydration(page, "#sacdgc-dropzone")
	await page.locator("#sacdgc-dropzone").setInputFiles(PANEL_FILES)
	await expect(page.getByText(basename(PANEL_FILES[0]))).toBeVisible()
	await page.getByRole("button", { name: /carregar base/i }).click()
	await expect(page.getByText("Unidades na base")).toBeVisible({ timeout: 30_000 })
}

test("a rota exige sessão do sucont", async ({ browser }) => {
	// Contexto limpo: sem o storageState do globalSetup.
	const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } })
	const page = await anon.newPage()
	await page.goto("/sac-dgc")
	await expect(page).toHaveURL(/\/auth/)
	await anon.close()
})

test("carrega os quatro painéis e recorta a base por UG", async ({ page }) => {
	await carregarBase(page)

	// Competência lida das próprias planilhas. "JULHO/2026" só sai assim com o
	// windows-1252 decodificado E com a abreviação "JUL/2026" do Painel 4 unificada.
	await expect(page.getByTestId("dgc-competence")).toHaveText("JULHO/2026")
	await expect(page.getByTestId("dgc-panels")).toHaveText("1, 2, 3, 4")

	// A amostra tem 120002+120700 (fundidas numa DIREF só), 120004, 120006 e a
	// 120132, que aparece apenas como UG beneficiada do Painel 4.
	await expect(page.getByTestId("dgc-ug-count")).toHaveText("4")
	await expect(page.getByTestId("dgc-done-count")).toHaveText("0")
})

test("agrupa as UGs e mostra a contagem de linhas por painel", async ({ page }) => {
	await carregarBase(page)

	// O grupo inicial é o primeiro com UG na base.
	await expect(page.getByRole("columnheader", { name: /Unidade Gestora/i })).toBeVisible()
	await expect(page.getByRole("button", { name: /Analisar grupo/i })).toBeEnabled()

	// A 120004 (Bases Aéreas) tem 2 linhas no Painel 1 e 0 no Painel 4 na amostra.
	await page.getByRole("combobox").click()
	await page.getByRole("option", { name: /Bases Aéreas/i }).click()
	await expect(page.getByRole("cell", { name: "120004" })).toBeVisible()
	await expect(page.getByRole("row", { name: /120004/ }).getByTitle("Painel 1: 2 linha(s)")).toBeVisible()
	await expect(page.getByRole("row", { name: /120004/ }).getByTitle("Painel 4: 0 linha(s)")).toBeVisible()
})

test("a UG do Painel 4 é a beneficiada, não a emitente", async ({ page }) => {
	await carregarBase(page)

	// Na amostra o GAP 120006 EMITIU a energia cujo custo é da 120132 (Diretoria de
	// Ensino). Com índice de coluna fixo, essa linha cairia no GAP e a 120132 nem
	// apareceria na base.
	await page.getByRole("combobox").click()
	await page.getByRole("option", { name: /Diretorias e ODS/i }).click()
	await expect(page.getByRole("cell", { name: "120132" })).toBeVisible()
	await expect(page.getByRole("row", { name: /120132/ }).getByTitle("Painel 4: 1 linha(s)")).toBeVisible()
})

test("o endpoint de análise está registrado e exige sessão", async ({ page, request }) => {
	// Com a sessão do storageState: passa pela auth e para no que vier depois
	// (200 SSE, 429 de teto ou 503 sem IA configurada) — o que importa é NÃO ser o
	// 307 para /auth que a rota devolvia quando não estava declarada em `handlers`.
	await page.goto("/sac-dgc")
	const comSessao = await page.request.post("/api/sacdgc/analyze", { data: {}, failOnStatusCode: false })
	expect(comSessao.status(), "rota Nitro não registrada — caiu no catch-all do SSR").not.toBe(307)
	expect([400, 429, 503]).toContain(comSessao.status())

	// Sem cookie nenhum: 401 do guard, nunca um stream aberto.
	const semSessao = await request.post("http://localhost:3000/api/sacdgc/analyze", {
		data: {},
		headers: { cookie: "" },
		failOnStatusCode: false,
	})
	expect([401, 503]).toContain(semSessao.status())
})
