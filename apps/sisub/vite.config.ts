import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { nitro } from 'nitro/vite'

export default defineConfig({
	plugins: [
		// Path aliases must come first
		viteTsConfigPaths({
			projects: ["./tsconfig.json"],
		}),
		// DevTools before TanStack Start for proper HMR integration
		devtools(),
		// TanStack Start must come before viteReact
		tanstackStart(),
		// React plugin with compiler
		viteReact({
			babel: {
				plugins: ["babel-plugin-react-compiler"],
			},
		}),
		// Tailwind CSS
		tailwindcss(),
		nitro()
	],
	resolve: {
		// Dedupe critical dependencies to avoid multiple instances
		dedupe: [
			"react",
			"react-dom",
			"@tanstack/react-router",
			"@tanstack/react-query",
			"@tanstack/react-store",
		],
		alias: {
			"@iefa/auth": fileURLToPath(
				new URL("../../packages/auth/src", import.meta.url),
			),
			"@iefa/ui": fileURLToPath(
				new URL("../../packages/ui/src", import.meta.url),
			),
		},
	},
	server: {
		// Porta personalizada definida no package.json
		port: 3000,
		// Strict port to avoid port conflicts
		strictPort: false,
		// Allow access to monorepo packages
		fs: {
			allow: ["../.."],
		},
		// Improved HMR configuration
		hmr: {
			overlay: true,
			// Protocol for HMR WebSocket
			protocol: "ws",
		},
		// Better dev server performance
		watch: {
			// Ignore node_modules for better performance
			ignored: ["**/node_modules/**", "**/.git/**", "**/.tanstack/**"],
		},
	},
	// Optimize dependencies for faster dev server startup
	optimizeDeps: {
		// Exclude workspace packages to get proper HMR
		exclude: ["@iefa/ui", "@iefa/auth"],
		// Include heavy dependencies for pre-bundling
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
		// Force pre-bundle even if detected as ESM
		esbuildOptions: {
			target: "esnext",
		},
	},
	// SSR configuration for TanStack Start
	ssr: {
		// External packages that should be bundled for SSR
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
		// Optimize SSR build target
		target: "node",
	},
	// Build optimizations
	build: {
		// Target modern browsers for better bundle size
		target: "esnext",
		// Enable minification
		minify: "esbuild",
		// Source maps for production debugging
		sourcemap: false,
		// CSS code splitting
		cssCodeSplit: true,
		// Report compressed size
		reportCompressedSize: true,
		// Optimize chunks
		rollupOptions: {
			output: {
				// Nomes de arquivo com hash para cache busting
				entryFileNames: "assets/[name]-[hash].js",
				chunkFileNames: "assets/[name]-[hash].js",
				assetFileNames: "assets/[name]-[hash].[ext]",
			},
		},
		// Chunk size warnings
		chunkSizeWarningLimit: 1000,
	},
	// Type checking in dev mode
	esbuild: {
		logOverride: { "this-is-undefined-in-esm": "silent" },
		// Optimizações para produção
		legalComments: "none",
		treeShaking: true,
	},
	nitro: {preset: 'node-server'},
});
