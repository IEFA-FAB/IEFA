import * as fs from "node:fs"
import { chromium } from "@playwright/test"

const AUTH_FILE = ".auth/user.json"

/** Login pela tela, para o cliente do Supabase gravar sessão em localStorage e cookies. */
async function globalSetup() {
	const email = process.env.E2E_TEST_USER_EMAIL
	const password = process.env.E2E_TEST_USER_PASSWORD
	if (!email || !password) {
		throw new Error("E2E do contrate: faltam E2E_TEST_USER_EMAIL/E2E_TEST_USER_PASSWORD (bun run env:pull sisub) e CONTRATE_RUN_E2E=true.")
	}

	fs.mkdirSync(".auth", { recursive: true })
	const browser = await chromium.launch()
	const context = await browser.newContext()
	const page = await context.newPage()
	await page.goto(`${process.env.E2E_BASE_URL}/auth`)
	await page.waitForSelector("#login-email", { timeout: 30_000 })
	// Espera a hidratação: o HTML do SSR chega antes de o formulário ter onSubmit.
	await page.waitForFunction(() => {
		const input = document.querySelector("#login-email")
		return !!input && Object.keys(input).some((key) => key.startsWith("__reactFiber"))
	})
	await page.locator("#login-email").fill(email)
	await page.locator("#login-password").fill(password)
	await page.locator('form:has(#login-email) button[type="submit"]').click()
	await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 })
	await context.storageState({ path: AUTH_FILE })
	await browser.close()
}

export default globalSetup
