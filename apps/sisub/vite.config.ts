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
				"/assets/styles.css": { headers: { "cache-control": "no-cache" } },
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
		cssCodeSplit: false,
		chunkSizeWarningLimit: 800,
		rollupOptions: {
			output: {
				// Nome fixo (sem hash) para o CSS principal — previne mismatch de hash entre
				// o build SSR e o build client: Tailwind gera output diferente em cada pass.
				// Cache-busting feito server-side via Cache-Control: no-cache em /assets/styles.css.
				assetFileNames: (asset) => (asset.names?.includes("styles.css") ? "assets/styles.css" : "assets/[name]-[hash][extname]"),
			},
		},
	},
}))
