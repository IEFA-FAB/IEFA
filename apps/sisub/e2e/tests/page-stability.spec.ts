import { expect, test } from "../fixtures/auth"

/**
 * Páginas que quebravam em silêncio — nenhum erro na tela, só no console e na rede.
 *
 * - Agendamento da Produção: o painel do dia fica montado com o calendário e, sem dia
 *   escolhido, a chave da query era um `new Date()` novo a cada render. A mesma server fn
 *   rodava ~11 vezes por segundo enquanto a aba estivesse aberta.
 * - Presenças do refeitório: refeição e dia padrão saem do relógio local. No SSR o relógio
 *   era o do servidor (UTC), o HTML vinha com outra refeição e a hidratação quebrava
 *   (React #418). O navegador do teste roda em Tóquio, 12h à frente de Brasília: a faixa de
 *   refeição do cliente nunca coincide com a do servidor, então a divergência aparece sempre.
 *
 * - Agendamento da Produção: o grid começava no domingo e o cardápio semanal se aplica de
 *   segunda a domingo — tocar num domingo aplicava o cardápio na semana da linha de cima.
 *
 * READ-ONLY: só navega. Precisa de cozinha e refeitório REAIS do usuário E2E.
 */

const KITCHEN_ID = process.env.E2E_KITCHEN_ID
const MESS_HALL_ID = process.env.E2E_MESSHALL_ID

test.describe("Estabilidade das páginas", () => {
	test("Agendamento da Produção não refaz a mesma busca em laço", async ({ authenticatedPage: page }) => {
		test.skip(!KITCHEN_ID, "E2E_KITCHEN_ID ausente")

		await page.goto(`/kitchen/${KITCHEN_ID}/planning`)
		await expect(page.getByRole("heading", { name: "Agendamento da Produção" })).toBeVisible()
		// Deixa as buscas da carga assentarem antes de contar
		await page.waitForTimeout(3_000)

		// Conta por chamada (função + payload): a carga inicial ainda pode estar chegando, mas
		// nenhuma busca se repete sozinha. O laço repetia a mesma ~40 vezes nessa janela.
		const calls = new Map<string, number>()
		page.on("request", (request) => {
			if (!request.url().includes("/_serverFn/")) return
			// GET leva o payload na URL; POST, no corpo
			const key = `${request.url()} ${request.postData() ?? ""}`
			calls.set(key, (calls.get(key) ?? 0) + 1)
		})
		await page.waitForTimeout(4_000)

		expect(Math.max(0, ...calls.values())).toBeLessThanOrEqual(2)
	})

	test("aplicar cardápio num domingo usa a semana da linha do calendário", async ({ authenticatedPage: page }) => {
		test.skip(!KITCHEN_ID, "E2E_KITCHEN_ID ausente")

		await page.goto(`/kitchen/${KITCHEN_ID}/planning`)
		const cells = page.locator("button[data-date]")
		await expect(cells.first()).toBeVisible()

		// Cardápio semanal vai de segunda (dia 1) a domingo: o grid precisa começar na segunda,
		// senão o domingo tocado é a 1ª célula da linha e o cardápio cai na semana de cima.
		const dates = await cells.evaluateAll((els) => els.map((el) => el.getAttribute("data-date") as string))
		const sundayIndex = dates.findIndex((d, i) => i >= 7 && new Date(`${d}T12:00:00Z`).getUTCDay() === 0)
		expect(sundayIndex).toBeGreaterThan(0)
		const row = dates.slice(Math.floor(sundayIndex / 7) * 7, Math.floor(sundayIndex / 7) * 7 + 7)

		// Escolher o template só marca a paleta; o diálogo abre sem gravar nada
		await page.locator("button[aria-pressed]").first().click()
		await cells.nth(sundayIndex).click()
		const dialog = page.getByRole("dialog", { name: "Aplicar Template" })
		await expect(dialog).toBeVisible()

		const expected = row.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`)
		for (const day of expected) await expect(dialog).toContainText(day)
		await page.keyboard.press("Escape")
		await expect(dialog).toBeHidden()
	})

	test.describe("fuso diferente do servidor", () => {
		test.use({ timezoneId: "Asia/Tokyo" })

		test("Presenças do refeitório hidrata sem erro", async ({ authenticatedPage: page }) => {
			test.skip(!MESS_HALL_ID, "E2E_MESSHALL_ID ausente")

			// Build de produção lança o #418; o dev server só loga o erro recuperável no console
			const hydrationErrors: string[] = []
			page.on("pageerror", (error) => hydrationErrors.push(error.message))
			page.on("console", (message) => {
				if (message.type() === "error" && /hydrat/i.test(message.text())) hydrationErrors.push(message.text())
			})

			await page.goto(`/messhall/${MESS_HALL_ID}`)
			await page.waitForLoadState("networkidle")
			await expect(page.getByRole("tab", { name: /Scanner QR/ })).toBeVisible()

			expect(hydrationErrors).toEqual([])
		})
	})
})
