import { defineConfig, devices } from "@playwright/test"
import { loadEnv } from "vite"

/**
 * Env do E2E — credencial SÓ quando a suíte está explicitamente ligada.
 *
 * O runner do Playwright era o último lugar do repo que lia o `.env` do disco sem
 * pedir licença: um `readFileSync(".env")` à mão despejava TODAS as chaves em
 * `process.env`. É a mesma armadilha que o `bun test` fechou com `--no-env-file` e
 * que o `vitest.config.ts` fechou com `loadEnv` sob flag — a suíte passava na
 * máquina de quem tem `.env` e falhava onde o arquivo não existe, sem que nada no
 * código dissesse de onde a credencial veio.
 *
 * Aqui o dano é maior que um verde falso: esta suíte autentica no Supabase de
 * PRODUÇÃO via UI e não tem seed. Carregar credencial por acidente é rodar contra
 * prod por acidente. Então a regra é a mesma do vitest, com a flag desta suíte:
 * sem `SISUB_RUN_E2E=true` o `.env` é IGNORADO, o `global-setup` não encontra
 * credencial e para com uma mensagem que diz o que falta.
 *
 * Injetar em `process.env` (e não devolver um objeto) é obrigatório: o Playwright
 * roda `globalSetup` e cada worker em processo separado, herdando o env do runner —
 * não existe um `test.env` como no vitest.
 *
 * A flag pode vir do shell (é assim que os scripts do `package.json` a passam) ou
 * do próprio arquivo; o shell vence, que é a precedência que o Vite já aplica.
 */
const RUN_FLAGS = ["SISUB_RUN_E2E"]

function applyE2eEnv(): boolean {
	const all = loadEnv("test", process.cwd(), "")
	const optedIn = RUN_FLAGS.some((key) => (process.env[key] ?? all[key]) === "true")
	const entries = optedIn ? Object.entries(all) : RUN_FLAGS.filter((key) => key in all).map((key) => [key, all[key]] as const)

	for (const [key, value] of entries) {
		// Só preenche o que o shell não definiu — export na linha de comando vence o arquivo.
		if (!(key in process.env)) process.env[key] = value
	}

	return optedIn
}

const e2eEnabled = applyE2eEnv()

const allBrowsers = !!process.env.ALL_BROWSERS

export default defineConfig({
	testDir: "./e2e/tests",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "html",

	globalSetup: "./e2e/global-setup.ts",

	use: {
		baseURL: "http://localhost:3000",
		trace: "on-first-retry",
		storageState: ".auth/user.json",
	},

	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		...(allBrowsers
			? [
					{
						name: "firefox",
						use: { ...devices["Desktop Firefox"] },
					},
					{
						name: "webkit",
						use: { ...devices["Desktop Safari"] },
					},
				]
			: []),
	],

	webServer: {
		command: "bunx --bun vite dev --port 3000",
		url: "http://localhost:3000",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		// Sem os dois pipes, um crash de boot do vite (env inválida, porta ocupada, erro
		// de import) chega como "Timed out waiting 120000ms for the web server" e a causa
		// real fica no stdout descartado. Com `pipe` o Playwright reemite a saída do
		// servidor no relatório, e o timeout volta a significar "subiu devagar".
		stdout: "pipe",
		stderr: "pipe",
	},

	metadata: {
		// Fica no relatório: quem abrir um HTML report antigo sabe se aquele run teve
		// credencial ou se a suíte estava desligada.
		sisubRunE2e: e2eEnabled,
	},
})
