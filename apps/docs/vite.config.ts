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
			preset: "bun",
			compressPublicAssets: true,
			routeRules: {
				"/**": { headers: { "cache-control": "no-cache" } },
				"/assets/**": { headers: { "cache-control": "public, max-age=31536000, immutable" } },
			},
		}),
		react(),
	],
	resolve: {
		tsconfigPaths: true,
	},
})
