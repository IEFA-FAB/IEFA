import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"

import { tanstackStart } from "@tanstack/react-start/plugin/vite"

import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		devtools(),
		nitro({ rollupConfig: { external: [/^@sentry\//] } }),
		tailwindcss(),
		tanstackStart(),
		// @vitejs/plugin-react v6 (rolldown/oxc) no longer accepts a `babel` option.
		// React Compiler would need `@rolldown/plugin-babel` + `@babel/core` wired via
		// `reactCompilerPreset` (not installed here), so the previous `babel` block was
		// already a no-op at runtime. Dropping it keeps behavior identical.
		viteReact(),
	],
})

export default config
