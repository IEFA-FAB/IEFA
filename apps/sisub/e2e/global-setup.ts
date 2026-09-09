import * as fs from "node:fs"
import * as path from "node:path"
import { chromium } from "@playwright/test"

const AUTH_FILE = ".auth/user.json"

const REQUIRED_ENV = ["E2E_TEST_USER_EMAIL", "E2E_TEST_USER_PASSWORD"] as const

/**
 * Credencial do usuário de teste, ou um erro que diz exatamente o que falta.
 *
 * A mensagem enumera as vars ausentes e o caminho para ligá-las porque o modo de
 * falha anterior ("Missing E2E credentials") era indistinguível de dois problemas
 * diferentes: não ter as vars, e tê-las no `.env` sem a flag que autoriza o
 * `playwright.config.ts` a carregá-lo.
 */
function readCredentials(): { email: string; password: string } {
	const missing = REQUIRED_ENV.filter((key) => !process.env[key])

	if (missing.length > 0) {
		throw new Error(
			[
				`E2E do sisub abortado — variáveis ausentes: ${missing.join(", ")}.`,
				"",
				"Onde configurar: apps/sisub/.env (arquivo local, fora do git — o .env.schema",
				"lista as chaves) ou export no shell.",
				"",
				"Como rodar: cd apps/sisub && bun run test:e2e",
				"O script liga SISUB_RUN_E2E=true, e é essa flag que autoriza o",
				"playwright.config.ts a carregar o .env. Sem a flag o arquivo é ignorado de",
				"propósito, para o runner enxergar o mesmo env de uma máquina limpa.",
				"",
				"ATENÇÃO: esta suíte autentica no Supabase de PRODUÇÃO. Ver TESTING.md na raiz.",
			].join("\n")
		)
	}

	// O filtro acima já provou que as duas existem; o cast evita repetir a checagem.
	return {
		email: process.env.E2E_TEST_USER_EMAIL as string,
		password: process.env.E2E_TEST_USER_PASSWORD as string,
	}
}

/**
 * Global setup: faz login via UI para que o createBrowserClient (@supabase/ssr)
 * persista a sessão em localStorage E cookies.
 *
 * O app usa getServerSessionFn() (lê cookies) para autenticação SSR.
 * Injetar só localStorage não é suficiente — o servidor nunca receberia o cookie.
 * Login via UI garante que cookies e localStorage ficam corretamente definidos.
 */
async function globalSetup() {
	const { email, password } = readCredentials()

	// Garante que o diretório .auth existe
	const authDir = path.dirname(AUTH_FILE)
	if (!fs.existsSync(authDir)) {
		fs.mkdirSync(authDir, { recursive: true })
	}

	const browser = await chromium.launch()
	const context = await browser.newContext()
	const page = await context.newPage()

	// Navega para a página de login
	await page.goto("http://localhost:3000/auth")

	// Aguarda o formulário estar visível no DOM (pode ser SSR)
	await page.waitForSelector("#login-email", { timeout: 30_000 })

	// Aguarda React hidratar — o formulário só tem onSubmit funcional após hydration.
	// TanStack Start com Nitro SSR serve HTML pré-renderizado: o seletor é encontrado
	// imediatamente, mas React ainda não montou seus event handlers no cliente.
	// React 18 atribui __reactFiber$* nos elementos DOM após montar.
	await page.waitForFunction(
		() => {
			const input = document.querySelector("#login-email")
			if (!input) return false
			return Object.keys(input).some((k) => k.startsWith("__reactFiber"))
		},
		{ timeout: 30_000 }
	)

	// Preenche credenciais e submete
	await page.locator("#login-email").fill(email)
	await page.locator("#login-password").fill(password)
	await page.click('button[type="submit"]')

	// Aguarda redirect para /hub após login bem-sucedido
	// O createBrowserClient vai setar localStorage + cookies durante este processo
	await page.waitForURL("**/hub", { timeout: 30_000 })

	// Salva storageState com cookies + localStorage já definidos pelo createBrowserClient
	await context.storageState({ path: AUTH_FILE })
	await browser.close()

	console.log(`✓ E2E auth: sessão salva em ${AUTH_FILE}`)
}

export default globalSetup
