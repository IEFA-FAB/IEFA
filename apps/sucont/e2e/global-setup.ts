import * as fs from "node:fs"
import * as path from "node:path"
import { chromium } from "@playwright/test"
import { purgeE2ERuns } from "./helpers/cleanup"

const AUTH_FILE = ".auth/user.json"

/**
 * Login pela UI, não injeção de token: o SSR do sucont autentica pelo COOKIE
 * (getSucontAuthClient lê o header), e a rota Nitro `/api/sacdgc/analyze` também.
 * Injetar só o localStorage daria uma sessão que o navegador enxerga e o servidor
 * não — os testes passariam na tela e a análise voltaria 401.
 */
async function globalSetup() {
	const email = process.env.E2E_TEST_USER_EMAIL
	const password = process.env.E2E_TEST_USER_PASSWORD
	if (!email || !password) {
		throw new Error("Credenciais E2E ausentes: E2E_TEST_USER_EMAIL e/ou E2E_TEST_USER_PASSWORD")
	}

	fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })

	// Varredura de entrada: o `afterAll` do spec não roda quando o processo morre de
	// repente (job cancelado, Ctrl+C), e o que ficou está em PRODUÇÃO. Recolhe aqui,
	// antes de a suíte criar mais.
	const leftovers = await purgeE2ERuns()
	if (leftovers.length > 0) console.log(`✓ E2E: ${leftovers.length} rodada(s) marcada(s) de execuções anteriores removida(s)`)

	const browser = await chromium.launch()
	const context = await browser.newContext()
	const page = await context.newPage()

	await page.goto("http://localhost:3000/auth")
	await page.waitForSelector("#email", { timeout: 60_000 })

	// O formulário só tem handler depois da hidratação: o SSR entrega o HTML antes
	// de o React montar, e um fill/click aqui seria descartado em silêncio.
	await page.waitForFunction(
		() => {
			const input = document.querySelector("#email")
			return !!input && Object.keys(input).some((key) => key.startsWith("__reactFiber"))
		},
		{ timeout: 60_000 }
	)

	await page.locator("#email").fill(email)
	await page.locator("#password").fill(password)
	await page.getByRole("button", { name: /entrar/i }).click()

	await page.waitForURL("http://localhost:3000/", { timeout: 60_000 })
	await context.storageState({ path: AUTH_FILE })
	await browser.close()

	console.log(`✓ E2E auth: sessão salva em ${AUTH_FILE}`)
}

export default globalSetup
