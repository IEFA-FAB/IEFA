/**
 * Demanda do requisitante, de ponta a ponta, contra o contrate e o α publicados.
 *
 * A pessoa cria a demanda, estrutura o problema (problema, objetivo fundamental, alternativas),
 * define solução, item, cotação e risco; a gravação automática persiste (recarregar mostra o
 * que foi escrito); o guia de preenchimento baixa; o envio gera ETP e TR, que passam pela
 * extração e pela verificação; e o processo mostra a demanda de origem.
 *
 * Tudo o que a spec cria é apagado no fim com a chave de serviço (execuções, submissões,
 * arquivos e a demanda), mesmo se ela falhar no meio.
 */

import { readFileSync } from "node:fs"
import { createServiceRoleClient } from "@iefa/supabase-kit"
import { expect, type Page, test } from "@playwright/test"

const TITLE = `E2E demanda ${new Date().toISOString().slice(0, 16)}`
const SUBMISSION_BUCKET = "alpha-submissions"

let demandId: string | null = null

function serviceClient() {
	const url = process.env.VITE_IEFA_SUPABASE_URL
	const secretKey = process.env.IEFA_SUPABASE_SECRET_KEY
	if (!url || !secretKey) throw new Error("limpeza do e2e precisa de VITE_IEFA_SUPABASE_URL e IEFA_SUPABASE_SECRET_KEY (apps/contrate/.env)")
	return createServiceRoleClient({ url, secretKey, schema: "alpha" })
}

test.afterAll(async () => {
	if (!demandId) return
	const alpha = serviceClient()
	const { data: submissions } = await alpha.from("submission").select("id, storage_path").eq("demand_id", demandId)
	const ids = (submissions ?? []).map((submission) => submission.id as string)
	if (ids.length) {
		// `compliance_run → extraction` é RESTRICT: a execução sai antes da submissão.
		const runs = await alpha.from("compliance_run").delete().in("submission_id", ids)
		if (runs.error) throw new Error(`limpeza das execuções: ${runs.error.message}`)
		const removed = await alpha.from("submission").delete().in("id", ids)
		if (removed.error) throw new Error(`limpeza das submissões: ${removed.error.message}`)
		const files = await alpha.storage.from(SUBMISSION_BUCKET).remove((submissions ?? []).map((submission) => submission.storage_path as string))
		if (files.error) throw new Error(`limpeza dos arquivos: ${files.error.message}`)
	}
	const demand = await alpha.from("demand").delete().eq("id", demandId)
	if (demand.error) throw new Error(`limpeza da demanda: ${demand.error.message}`)
})

async function waitSaved(page: Page) {
	await expect(page.getByText("tudo gravado")).toBeVisible({ timeout: 20_000 })
}

async function choose(page: Page, label: string, option: string | RegExp, nth = 0) {
	await page.getByLabel(label, { exact: true }).nth(nth).click()
	await page.getByRole("option", { name: option }).first().click({ timeout: 15_000 })
	// O Base UI mantém a lista montada enquanto anima o fechamento: sem esperar, a próxima escolha
	// acharia as opções desta.
	await expect(page.getByRole("listbox")).toHaveCount(0)
}

async function next(page: Page, stepLabel: string) {
	await page.getByRole("button", { name: stepLabel, exact: true }).last().click()
	await expect(page).toHaveURL(/passo=/)
}

test("do problema às peças, com envio à ACI", async ({ page }) => {
	test.setTimeout(15 * 60_000)

	// ── Criar ────────────────────────────────────────────────────────────────
	await page.goto("/requisitante/minhas/demandas")
	await page.getByRole("button", { name: "nova demanda" }).click()
	await page.getByLabel("Título").fill(TITLE)
	await page.locator("#demand-unit").click()
	await page
		.getByRole("option", { name: /^IEFA\b/ })
		.first()
		.click()
	await page.getByRole("button", { name: "começar" }).click()
	await page.waitForURL(/\/demandas\/[0-9a-f-]{36}/)
	demandId = page.url().match(/demandas\/([0-9a-f-]{36})/)?.[1] ?? null
	expect(demandId).not.toBeNull()

	// ── 1. Problema ──────────────────────────────────────────────────────────
	await page.getByLabel("Área requisitante").fill("Escritório do IEFA em São José dos Campos")
	await page
		.getByLabel("O que acontece hoje?")
		.fill("Os 21 vãos de janela do prédio E-102 têm esquadrias que não vedam chuva nem poeira e não permitem fechar o laboratório.")
	await page.getByLabel("O que acontece se nada for feito?").fill("Equipamentos expostos à umidade e bens patrimoniais sem guarda segura.")
	await waitSaved(page)

	// Recarregar prova a gravação no α (e não só o estado da tela).
	await page.reload()
	await expect(page.getByLabel("Área requisitante")).toHaveValue("Escritório do IEFA em São José dos Campos")

	// ── 2. Objetivos ─────────────────────────────────────────────────────────
	await next(page, "Objetivos")
	await page.getByRole("button", { name: "objetivo fundamental" }).click()
	await page.getByLabel("O que se quer de fato").fill("Proteger os equipamentos do laboratório")
	await page.getByLabel("Atributo").fill("vãos com vedação")
	await page.getByLabel("Meta").fill("21 de 21")

	// ── 3. Alternativas ──────────────────────────────────────────────────────
	await next(page, "Alternativas")
	await page.getByRole("button", { name: "contratar", exact: true }).click()
	await page.getByLabel("Alternativa", { exact: true }).nth(0).fill("Aquisição de janelas sob medida")
	await choose(page, "Proteger os equipamentos do laboratório", "Atende", 0)
	await page.getByLabel("Esta é a alternativa escolhida").first().check()
	await page.getByRole("button", { name: "não fazer nada" }).click()
	await page.getByLabel("Por que foi descartada").fill("Mantém os vãos sem vedação")
	await choose(page, "Proteger os equipamentos do laboratório", "Não atende", 1)
	await page.getByLabel("Por que a alternativa escolhida?").fill("Única que veda todos os vãos.")

	// ── 4. Solução ───────────────────────────────────────────────────────────
	await next(page, "Solução")
	await choose(page, "Natureza do objeto", "Bem (compra)")
	await page.getByLabel("Objeto em uma frase").fill("Aquisição de 21 janelas de alumínio maxim-ar sob medida para o prédio E-102 do IEFA-SJ.")
	await page.getByLabel("Descrição da solução como um todo").fill("Janelas fabricadas sob medida, com vidro temperado de 6 mm.")

	// ── 5. Itens ─────────────────────────────────────────────────────────────
	await next(page, "Itens e quantidades")
	await page.getByRole("button", { name: "item", exact: true }).click()
	await page.getByLabel("Descrição", { exact: true }).fill("Janela maxim-ar, 3 folhas, 2.780 x 970 mm")
	await page.getByLabel("Código").fill("610629")
	await page.getByLabel("Unidade").fill("UN")
	await page.getByLabel("Quantidade").fill("21")

	// ── 6. Preços ────────────────────────────────────────────────────────────
	await next(page, "Pesquisa de preços")
	await page.getByRole("button", { name: "cotação", exact: true }).click()
	await page.getByLabel("Fornecedor ou fonte").fill("Fornecedor E2E")
	await page.getByLabel("Data", { exact: true }).fill("2026-09-26")
	await page.getByLabel("Preço do item 1").fill("2.100,00")
	await page.getByLabel("Preço do item 1").blur()
	await expect(page.getByText("R$ 44.100,00").first()).toBeVisible()

	// ── 7. Riscos ────────────────────────────────────────────────────────────
	await next(page, "Riscos")
	await page.getByRole("button", { name: "risco", exact: true }).click()
	await page.getByLabel("Risco", { exact: true }).fill("Janelas fabricadas fora das medidas dos vãos, sem encaixe")
	await choose(page, "Probabilidade", /^3 ·/)
	await choose(page, "Impacto", /^3 ·/)

	// ── 9. Documentos ────────────────────────────────────────────────────────
	await page.getByRole("button", { name: "Documentos e envio" }).first().click()
	await waitSaved(page)
	await expect(page.getByText("Dispensa de licitação em razão do valor (art. 75, II)").first()).toBeVisible()

	const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "baixar o guia" }).click()])
	const guide = readFileSync((await download.path()) as string, "utf8")
	expect(guide).toContain(TITLE)
	expect(guide).toContain("Estudo Técnico Preliminar")
	expect(guide).toContain("44100,00")

	// ── Envio à ACI ──────────────────────────────────────────────────────────
	const send = page.getByRole("button", { name: "enviar à ACI" })
	await expect(send).toBeEnabled()
	await send.click()
	await expect(page.getByText("ETP", { exact: true }).first()).toBeVisible({ timeout: 60_000 })
	await expect(page.getByText(/na fila da ACI, verificado|falhou/)).toHaveCount(2, { timeout: 12 * 60_000 })
	await expect(page.getByText(/^falhou/)).toHaveCount(0)

	// ── Processo com a demanda de origem ─────────────────────────────────────
	await page.getByRole("link", { name: "abrir o processo" }).first().click()
	await page.getByRole("button", { name: "Demanda de origem" }).click()
	await expect(page.getByText(TITLE, { exact: true })).toBeVisible({ timeout: 30_000 })
	await expect(page.getByText("Proteger os equipamentos do laboratório").first()).toBeVisible()
})
