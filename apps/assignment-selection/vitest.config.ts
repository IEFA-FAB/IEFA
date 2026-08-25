import { fileURLToPath } from "node:url"
import { loadEnv } from "vite"
import { defineConfig } from "vitest/config"

/**
 * Env dos testes — credencial SÓ quando a integração está ligada.
 *
 * `loadEnv(..., "")` (prefixo vazio) despeja o `.env` inteiro no `process.env` do run,
 * e com isso a suíte local passa a enxergar credencial que o CI não tem. Um teste que
 * toque a camada server fica verde aqui e vermelho lá — depois do merge.
 *
 * O run unitário (padrão, e o do CI) recebe só as flags; `ASSIGNMENT_SELECTION_RUN_INTEGRATION=true`
 * libera o env inteiro para os testes que precisam do banco real. Mesmo desenho do sisub.
 */
const RUN_FLAGS = ["ASSIGNMENT_SELECTION_RUN_INTEGRATION", "ASSIGNMENT_SELECTION_INTEGRATION_REQUIRED"]

function testEnv(): Record<string, string> {
	const all = loadEnv("test", process.cwd(), "")
	const integration = (process.env.ASSIGNMENT_SELECTION_RUN_INTEGRATION ?? all.ASSIGNMENT_SELECTION_RUN_INTEGRATION) === "true"
	if (integration) return all
	return Object.fromEntries(RUN_FLAGS.filter((k) => k in all).map((k) => [k, all[k]]))
}

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
		env: testEnv(),
	},
})
