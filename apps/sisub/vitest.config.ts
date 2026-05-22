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
		env: loadEnv("test", process.cwd(), ""),
		setupFiles: ["./src/test/suppress-phoenix-cleanup-errors.ts"],
	},
})
