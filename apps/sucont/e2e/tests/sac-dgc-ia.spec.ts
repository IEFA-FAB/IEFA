import { expect, test } from "@playwright/test"
import { countE2EAnalyses, purgeE2ERuns } from "../helpers/cleanup"
import { makePanelFixtures } from "../helpers/fixtures"
import { waitForHydration } from "../helpers/hydration"

/**
 * Análise de verdade: navegador → SSE → Bedrock → schema → banco → e de volta à tela.
 *
 * É o único teste que exercita a cadeia inteira, e por isso o único que pega o que
 * cada camada isolada não pega: prompt que o modelo não consegue responder no
 * formato, orçamento de tokens curto demais para a análise fechar o JSON, e
 * gravação que falha por permissão só quando o usuário real chega nela.
 *
 * Fica em skip sem `SUCONT_AI_*` — em CI sem credencial da AWS ele não roda, e isso
 * é esperado.
 *
 * É o único spec que ESCREVE no banco, então é o único com faxina: as planilhas vão
 * marcadas com `[TEST]` e o token da execução (ver `helpers/fixtures`), e o
 * `afterAll` apaga por esse token. Falha de limpeza REPROVA o teste — o banco é o de
 * produção e rodada vazada vira competência falsa na lista da SUCONT.
 */

const { files: PANEL_FILES, token: RUN_TOKEN } = makePanelFixtures()

const AI_CONFIGURED = !!process.env.SUCONT_AI_PROVIDER && !!process.env.SUCONT_AI_MODEL

test.skip(!AI_CONFIGURED, "SUCONT_AI_* não configurado — análise por IA indisponível neste ambiente")

test.afterAll(async () => {
	await purgeE2ERuns(RUN_TOKEN)
	// Conferir depois de apagar: o `on delete cascade` é o que leva as análises junto,
	// e um dia alguém pode trocá-lo por `set null` sem perceber que a faxina dependia dele.
	expect(await countE2EAnalyses(RUN_TOKEN), "faxina deixou análise órfã no banco").toBe(0)
})

test("analisa uma UG, grava a rodada e reabre do banco", async ({ page }) => {
	// Uma chamada real ao modelo leva dezenas de segundos.
	test.setTimeout(5 * 60_000)

	await page.goto("/sac-dgc")
	await waitForHydration(page, "#sacdgc-dropzone")
	await page.locator("#sacdgc-dropzone").setInputFiles(PANEL_FILES)
	await page.getByRole("button", { name: /carregar base/i }).click()
	await expect(page.getByTestId("dgc-ug-count")).toHaveText("4")

	await page.getByRole("combobox").click()
	await page.getByRole("option", { name: /^GAP/ }).click()

	const linhaGap = page.getByRole("row", { name: /120006/ })
	await expect(linhaGap).toBeVisible()
	await linhaGap.getByRole("button", { name: /analisar/i }).click()

	// Sem o keep-alive do SSE, uma geração longa é cortada pelo idle timeout e a UG
	// ficaria em "Erro" com a conexão encerrada.
	await expect(linhaGap.getByText("Concluída")).toBeVisible({ timeout: 4 * 60_000 })
	await expect(page.getByTestId("dgc-done-count")).toHaveText("1")
	// Gravação com o grant do usuário — nível 2 é o que a escrita exige.
	await expect(page.getByTestId("dgc-persist-error")).toHaveCount(0)

	await linhaGap.getByRole("button", { name: /ver análise/i }).click()
	await expect(page.getByRole("heading", { name: /GRUPAMENTO DE APOIO DE BRASILIA/i })).toBeVisible()

	// O checklist volta SEMPRE com as 20 perguntas: o normalizador completa o que o
	// modelo deixou de responder, senão a tela anunciaria "11 itens avaliados" como
	// se o resto tivesse sido dispensado.
	await page.getByRole("button", { name: /Checklist AEC/i }).click()
	await expect(page.getByText("Itens avaliados")).toBeVisible()
	await expect(page.getByTestId("dgc-aec-item")).toHaveCount(20)

	// O enunciado exibido é o da SUCONT, não o que o modelo eventualmente reescreveu.
	await expect(page.locator('[data-testid="dgc-aec-item"][data-item-id="4"]')).toContainText("Existe militar no Subcentro 98.00.92 (Efetivo sem Setor)?")

	await page.getByRole("button", { name: /voltar às unidades/i }).click()
	await page.getByRole("button", { name: /nova base/i }).click()

	// A rodada tem de estar no banco: a tela de carga volta com ela no histórico.
	const historico = page.getByRole("button", { name: /^Abrir$/ }).first()
	await expect(historico).toBeVisible({ timeout: 30_000 })
	await historico.click()

	await expect(page.getByTestId("dgc-panels")).toHaveText("rodada gravada")
	await expect(page.getByRole("cell", { name: "120006" })).toBeVisible()
	await expect(page.getByRole("row", { name: /120006/ }).getByText("Concluída")).toBeVisible()
})
