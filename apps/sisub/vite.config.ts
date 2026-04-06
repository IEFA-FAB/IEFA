import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

export default defineConfig(({ command }) => ({
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
			routeRules: {
				"/**": { headers: { "cache-control": "no-cache" } },
				"/assets/**": { headers: { "cache-control": "public, max-age=31536000, immutable" } },
				"/assets/styles.css": { headers: { "cache-control": "no-cache" } },
				"/fonts/**": { headers: { "cache-control": "public, max-age=31536000, immutable" } },
			},
		}),
		viteReact({
			babel: {
				plugins: ["babel-plugin-react-compiler"],
			},
		}),
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
		exclude: [],
		include: [
			"react",
			"react-dom",
			"@tanstack/react-router",
			"@tanstack/react-query",
			"@tanstack/react-table",
			"@tanstack/react-store",
			"lucide-react",
			"motion",
			"class-variance-authority",
			"tailwind-merge",
		],
	},
	ssr: {
		noExternal: command === "build" ? true : undefined,
		target: "node",
	},
	build: {
		target: "esnext",
		minify: "oxc",
		sourcemap: false,
		cssCodeSplit: false,
		chunkSizeWarningLimit: 800,
		rollupOptions: {
			output: {
				// Fixed name (no hash) for the main app CSS to prevent SSR vs client
				// build hash mismatch — Tailwind generates different output in each pass.
				// Cache-busting is handled server-side via Cache-Control: no-cache.
				assetFileNames: (asset) => (asset.names?.includes("styles.css") ? "assets/styles.css" : "assets/[name]-[hash][extname]"),
			},
		},
	},
}))
