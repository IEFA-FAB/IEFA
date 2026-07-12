import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"

import { tanstackStart } from "@tanstack/react-start/plugin/vite"

import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		devtools(),
		nitro({ rollupConfig: { external: [/^@sentry\//] } }),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
		// React Compiler: no plugin-react v6 (oxc) o `babel` saiu de Options; o compiler roda
		// via o babel plugin do rolldown + reactCompilerPreset (React 19 = runtime default).
		babel({ presets: [reactCompilerPreset()] }),
	],
})

export default config
