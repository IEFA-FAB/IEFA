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
			routeRules: {
				"/**": { headers: { "cache-control": "no-cache" } },
				"/assets/**": { headers: { "cache-control": "public, max-age=31536000, immutable" } },
				"/assets/styles.css": { headers: { "cache-control": "no-cache" } },
				"/fonts/**": { headers: { "cache-control": "public, max-age=31536000, immutable" } },
			},
		}),
		react(),
		babel({ presets: [reactCompilerPreset()] }),
		{
			name: "forms:fix-rolldown-css-name",
			generateBundle(_options, bundle) {
				if (this.environment?.name !== "client") return
				for (const fileName in bundle) {
					const asset = bundle[fileName]
					if (asset.type !== "asset" || !fileName.endsWith(".css")) continue
					const cssAsset = asset as unknown as { name: string; names?: string[] }
					cssAsset.name = "style.css"
					if (Array.isArray(cssAsset.names)) cssAsset.names = ["style.css"]
				}
			},
		},
	],

	server: {
		port: 3001,
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
			"iconoir-react",
			"@tanstack/react-router",
			"@tanstack/react-query",
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
		cssCodeSplit: false,
		rollupOptions: {
			output: {
				assetFileNames: (asset) => (asset.names?.includes("style.css") ? "assets/styles.css" : "assets/[name]-[hash][extname]"),
			},
		},
	},
}))
