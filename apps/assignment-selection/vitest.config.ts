import { fileURLToPath } from "node:url"
import { loadEnv } from "vite"
import { defineConfig } from "vitest/config"

export default defineConfig({
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	test: {
		environment: "node",
		globals: false,
		include: ["src/**/*.test.ts"],
		hookTimeout: 15_000,
		testTimeout: 15_000,
		// Carrega o .env da app (mesmas vars do dev) para os testes de integração.
		env: loadEnv("test", process.cwd(), ""),
	},
})
