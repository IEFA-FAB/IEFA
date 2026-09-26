import { defineConfig, devices } from "@playwright/test"
import { loadEnv } from "vite"

/**
 * E2E do contrate. Mesma regra do sisub (`apps/sisub/playwright.config.ts`): o `.env` só entra
 * com a flag `CONTRATE_RUN_E2E=true`. Sem ela, nada de credencial chega ao runner.
 *
 * A suíte roda contra o contrate e o α PUBLICADOS (`E2E_BASE_URL`, padrão produção): é o que
 * prova que o fluxo está no ar. Ela escreve (demanda, submissões) e desmonta tudo no fim com a
 * chave de serviço. A conta é a do e2e do sisub (`E2E_TEST_USER_*`, em `/iefa/dev/sisub`).
 */
function applyE2eEnv(): boolean {
	const own = loadEnv("test", process.cwd(), "")
	const optedIn = (process.env.CONTRATE_RUN_E2E ?? own.CONTRATE_RUN_E2E) === "true"
	if (!optedIn) return false
	// A conta do e2e mora no `.env` do sisub (`bun run env:pull sisub`).
	const sisub = loadEnv("test", `${process.cwd()}/../sisub`, "E2E_TEST_USER_")
	for (const [key, value] of Object.entries({ ...sisub, ...own })) {
		if (!(key in process.env)) process.env[key] = value
	}
	return true
}

const e2eEnabled = applyE2eEnv()
process.env.E2E_BASE_URL ??= "https://contrate.iefa.com.br"

export default defineConfig({
	testDir: "./e2e/tests",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
	globalSetup: e2eEnabled ? "./e2e/global-setup.ts" : undefined,
	use: {
		baseURL: process.env.E2E_BASE_URL,
		storageState: e2eEnabled ? ".auth/user.json" : undefined,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		acceptDownloads: true,
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
