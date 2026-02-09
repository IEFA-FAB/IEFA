import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import viteTsConfigPaths from "vite-tsconfig-paths"

export default defineConfig({
	plugins: [
		viteTsConfigPaths({
			projects: ["./tsconfig.json"],
		}),
		tailwindcss(),
		devtools(),
		tanstackStart(),
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
		exclude: ["@iefa/ui", "@iefa/auth"],
		include: [
			"react",
			"react-dom",
			"react/jsx-runtime",
			"@tanstack/react-router",
			"@tanstack/react-query",
			"@tanstack/react-table",
			"@tanstack/react-store",
			"lucide-react",
			"motion",
			"class-variance-authority",
			"clsx",
			"tailwind-merge",
		],
	},

	ssr: {
		noExternal: [
			"@iefa/ui",
			"@iefa/auth",
			"lucide-react",
			"motion",
			"qrcode.react",
			"qr-scanner",
			"react-markdown",
			"remark-gfm",
			"remark-breaks",
			"rehype-highlight",
			"rehype-raw",
			"rehype-sanitize",
			"highlight.js",
			"class-variance-authority",
			"clsx",
			"tailwind-merge",
		],
		target: "node",
	},

	build: {
		target: "esnext",
		minify: "oxc",
		sourcemap: false,
		cssCodeSplit: true,
	},
})
