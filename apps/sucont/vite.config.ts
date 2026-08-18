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
		nitro({
			rollupConfig: { external: [/^@sentry\//] },
			// Rota Nitro só existe se estiver declarada aqui. Sem isto o arquivo em
			// `routes/` é compilado e nunca registrado: o pedido cai no catch-all do SSR
			// do TanStack Start, que devolve 307 para /auth — foi o que aconteceu com o
			// `/api/chat/stream` do oráculo, que respondia redirect em vez de SSE.
			handlers: [
				{ route: "/api/chat/stream", method: "POST", handler: "./routes/api/chat/stream.post.ts", format: "web" },
				{ route: "/api/sacdgc/analyze", method: "POST", handler: "./routes/api/sacdgc/analyze.post.ts", format: "web" },
			],
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
		// React Compiler: no plugin-react v6 (oxc) o `babel` saiu de Options; o compiler roda
		// via o babel plugin do rolldown + reactCompilerPreset (React 19 = runtime default).
		babel({ presets: [reactCompilerPreset()] }),
	],
})

export default config
