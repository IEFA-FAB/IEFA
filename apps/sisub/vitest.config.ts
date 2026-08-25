import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { loadEnv } from "vite"
import { defineConfig } from "vitest/config"

// @supabase/phoenix is a transitive dep (supabase-js → realtime-js → phoenix)
// and is not directly resolvable from apps/sisub. Walk the dep chain to find it
// so the test setup file can import { Socket } from "@supabase/phoenix".
function resolvePhoenixPath(): string | undefined {
	try {
		const r1 = createRequire(import.meta.url)
		const r2 = createRequire(r1.resolve("@supabase/supabase-js"))
		const r3 = createRequire(r2.resolve("@supabase/realtime-js"))
		return r3.resolve("@supabase/phoenix")
	} catch {
		return undefined
	}
}

const phoenixResolved = resolvePhoenixPath()

/**
 * Env dos testes — credencial SÓ quando a integração está ligada.
 *
 * `loadEnv(..., "")` (prefixo vazio) despeja o `.env` inteiro no `process.env` do
 * run. Isso faz a suíte local MENTIR: um teste que importa `@/server/*` puxa
 * `env.server.ts`, que valida credencial na carga do módulo, e passa na máquina de
 * quem tem `.env` enquanto quebra no CI, que não tem. O modo de falha é o pior
 * possível — verde no PR, vermelho depois do merge.
 *
 * As credenciais são lidas em UM lugar só (`src/test/supabase.ts`), e esse arquivo já
 * se governa por `SISUB_RUN_INTEGRATION`. Então o run unitário — que é o que roda por
 * padrão e no CI — não recebe nenhuma delas e passa a enxergar exatamente o env do CI.
 *
 * O env inteiro sai quando QUALQUER suíte de opt-in que fala com backend real está
 * ligada. São duas, com flags independentes, e é preciso listar as duas: `test:ai`
 * liga só `SISUB_RUN_AI_SMOKE` e precisa das `MODULE_CHAT_AI_*`, senão o
 * `createAdapterFromEnv("MODULE_CHAT")` estoura com "Env vars obrigatórias ausentes".
 * Flag nova de suíte que precise de credencial entra AQUI.
 *
 * As flags em si sempre passam: são elas que decidem se a suíte roda, e lê-las do
 * `.env` é o que permite ligar sem exportar nada na linha de comando.
 */
const RUN_FLAGS = ["SISUB_RUN_INTEGRATION", "SISUB_INTEGRATION_REQUIRED", "SISUB_RUN_AI_SMOKE"]

/** Flags cujo `true` libera as credenciais. `SISUB_INTEGRATION_REQUIRED` não entra: ela só endurece um run já ligado. */
const CREDENTIAL_FLAGS = ["SISUB_RUN_INTEGRATION", "SISUB_RUN_AI_SMOKE"]

function testEnv(): Record<string, string> {
	const all = loadEnv("test", process.cwd(), "")
	// A flag pode vir do shell (é assim que os scripts do package.json a passam) ou do
	// arquivo; o shell vence, que é a precedência que o Vite já aplica.
	const optedIn = CREDENTIAL_FLAGS.some((k) => (process.env[k] ?? all[k]) === "true")
	if (optedIn) return all
	return Object.fromEntries(RUN_FLAGS.filter((k) => k in all).map((k) => [k, all[k]]))
}

export default defineConfig({
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
			...(phoenixResolved ? { "@supabase/phoenix": phoenixResolved } : {}),
		},
	},
	test: {
		environment: "node",
		globals: false,
		include: ["src/**/*.test.ts"],
		hookTimeout: 15_000,
		testTimeout: 15_000,
		env: testEnv(),
		setupFiles: ["./src/test/suppress-phoenix-cleanup-errors.ts"],
	},
})
