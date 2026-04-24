import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

export default defineConfig(() => ({
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [
		tailwindcss(),
		devtools(),
		tanstackStart(),
		nitro({
			preset: "bun",
			compressPublicAssets: true,
			handlers: [
				{
					route: "/api/analytics/stream",
					method: "POST",
					handler: "./routes/api/analytics/stream.post.ts",
					format: "web",
				},
				{
					route: "/api/module-chat/stream",
					method: "POST",
					handler: "./routes/api/module-chat/stream.post.ts",
					format: "web",
				},
			],
			routeRules: {
				"/**": { headers: { "cache-control": "no-cache" } },
				"/assets/**": { headers: { "cache-control": "public, max-age=31536000, immutable" } },
				"/fonts/**": { headers: { "cache-control": "public, max-age=31536000, immutable" } },
			},
		}),

		react(),
		babel({ presets: [reactCompilerPreset()] }),
	],
	server: {
		port: 3000,
		fs: {
			allow: ["../.."],
		},
		watch: {
			ignored: ["**/node_modules/**", "**/.git/**", "**/.tanstack/**"],
		},
	},
	optimizeDeps: {
		include: [
			"react",
			"react-dom",
			"react/jsx-runtime",
			"@tanstack/react-router",
			"@tanstack/react-query",
			"@tanstack/react-table",
			"lucide-react",
			"motion",
			"class-variance-authority",
			"clsx",
			"tailwind-merge",
		],
	},
	ssr: {
		target: "node" as const,
	},
	build: {
		target: "esnext" as const,
		minify: "oxc" as const,
		sourcemap: false,
		// cssCodeSplit: false evita FOUC — sem isso o CSS é injetado por chunk de rota.
		// NÃO adicionar assetFileNames para style.css: o plugin start-manifest-plugin
		// (start-plugin-core ≥1.167.35) busca bundleEntry.name === "style.css" no bundle
		// do rolldown. Com rolldown, bundleEntry.name deriva do basename do output —
		// renomear para "styles.css" quebra a busca. O padrão com hash preserva name="style.css".
		cssCodeSplit: false,
		chunkSizeWarningLimit: 800,
	},
}))
