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
		nitro({
			// Preset explícito, como nos demais apps. Sem ele o Nitro escolhe pelo runtime do
			// BUILD: com Node no PATH sai `node-server`, e o servidor vira `node:http`, que no Bun
			// fecha a conexão keep-alive ociosa em ~5 s (`keepAliveTimeout` do Node) e passa
			// `idleTimeout: 0` explícito ao `Bun.serve`, anulando o piso de 120 s do preload
			// `docker/bun-serve-idle-timeout.ts`. Servidor que fecha antes dos 60 s do ALB é o 502
			// que esse preload existe para evitar. O `--bun` do script de build fixa o runtime.
			preset: "bun",
			// Rota Nitro só existe se estiver declarada aqui. Sem isto o arquivo em
			// `routes/` é compilado e nunca registrado: o pedido cai no catch-all do SSR
			// do TanStack Start, que devolve 307 para /auth — foi o que aconteceu com o
			// `/api/chat/stream` do oráculo, que respondia redirect em vez de SSE.
			handlers: [
				{ route: "/api/chat/stream", method: "POST", handler: "./routes/api/chat/stream.post.ts", format: "web" },
				{ route: "/api/sacdgc/analyze", method: "POST", handler: "./routes/api/sacdgc/analyze.post.ts", format: "web" },
				{ route: "/api/auditor/report", method: "POST", handler: "./routes/api/auditor/report.post.ts", format: "web" },
			],
			// Baseline de headers de segurança dos apps SSR (ver `scripts/check-security-headers.ts`).
			// Sem `cache-control` de propósito: os demais apps o declaram junto com as regras de
			// `/assets/**` e `/fonts/**`, e trazer só o `no-cache` para cá mudaria o cache dos
			// assets deste app — mudança de desempenho que não é desta regra.
			routeRules: {
				"/**": {
					headers: {
						"x-content-type-options": "nosniff",
						"x-frame-options": "SAMEORIGIN",
						"referrer-policy": "strict-origin-when-cross-origin",
						"permissions-policy": "camera=(), microphone=(), geolocation=()",
						"strict-transport-security": "max-age=31536000; includeSubDomains",
						// CSP só com diretivas que não tocam script/estilo/imagem: o TanStack Start emite
						// script inline e os apps carregam imagem externa, e uma CSP estrita derrubaria
						// produção. `frame-ancestors` é o sucessor do X-Frame-Options (que fica para
						// navegador antigo); `base-uri` impede `<base>` injetado de sequestrar URL relativa.
						"content-security-policy": "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'",
					},
				},
			},
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact({ compiler: true }),
	],
})

export default config
