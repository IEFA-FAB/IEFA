import { existsSync, readFileSync } from "node:fs"
import { defineConfig, devices } from "@playwright/test"

// Carrega .env local. Em CI as vars vêm de secrets e já estão em process.env.
// O globalSetup roda em processo separado, então a injeção precisa ser aqui.
if (existsSync(".env")) {
	for (const line of readFileSync(".env", "utf-8").split("\n")) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith("#")) continue
		const eq = trimmed.indexOf("=")
		if (eq === -1) continue
		const key = trimmed.slice(0, eq).trim()
		let value = trimmed.slice(eq + 1).trim()
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
		if (key && !(key in process.env)) process.env[key] = value
	}
}

export default defineConfig({
	testDir: "./e2e/tests",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: process.env.CI ? "line" : "html",
	globalSetup: "./e2e/global-setup.ts",

	use: {
		baseURL: "http://localhost:3000",
		trace: "on-first-retry",
		storageState: ".auth/user.json",
	},

	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

	webServer: {
		command: "bunx --bun vite dev --port 3000",
		url: "http://localhost:3000/health",
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
	},
})
