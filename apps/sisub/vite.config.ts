import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import viteTsConfigPaths from "vite-tsconfig-paths"

export default defineConfig(({ command }) => ({
	plugins: [
		tailwindcss(),
		viteTsConfigPaths({
			projects: ["./tsconfig.json"],
		}),

		devtools(),
		tanstackStart(),
		nitro({
			preset: "bun",
			compressPublicAssets: true,
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
		cssCodeSplit: true,
		chunkSizeWarningLimit: 800,
	},
}))
