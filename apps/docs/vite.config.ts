import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import mdx from "fumadocs-mdx/vite"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

export default defineConfig({
	server: {
		port: 3000,
	},
	plugins: [
		mdx(await import("./source.config")),
		tailwindcss(),
		tanstackStart(),
		nitro({
			// Só `.output/public` é publicado: o site é servido estático por S3 +
			// CloudFront, sem servidor em runtime. Tudo que antes era rota de servidor
			// (índice do site, índice de busca) vira arquivo materializado no build.
			//
			// O preset ideal seria "static", mas o plugin Vite do nitro 3 beta ignora
			// `options.static` e constrói o ambiente servidor mesmo assim, colidindo
			// com a entrada SSR do TanStack Start. Mantemos um preset de servidor: o
			// prerender roda igual, e o bundle de servidor gerado é simplesmente
			// descartado no deploy. Trocar para "static" quando o plugin suportar.
			preset: "node",
			// Pré-comprimir não serve para nada aqui: o S3 não faz content negotiation
			// (não escolhe o .br pelo Accept-Encoding), e o CloudFront já comprime na
			// borda. Manter ligado só multiplicaria por quatro os arquivos enviados.
			compressPublicAssets: false,
			prerender: {
				// A home linka /docs/ e as páginas de cada sistema, e a partir daí a
				// sidebar do fumadocs linka o resto — o crawler alcança o site inteiro.
				crawlLinks: true,
				// Um erro de prerender viraria uma página faltando no CDN sem ninguém
				// perceber, já que não existe servidor para gerá-la sob demanda depois.
				failOnError: true,
				// Rotas sem link apontando para elas: o crawler não as descobre sozinho.
				routes: ["/", "/docs/", "/api/docs-index", "/api/search"],
			},
			// Cache-control aqui não vale mais nada: quem serve os arquivos é o
			// CloudFront, e a política de cache vive na distribuição (infra/docs).
		}),
		react(),
	],
	resolve: {
		tsconfigPaths: true,
	},
})
