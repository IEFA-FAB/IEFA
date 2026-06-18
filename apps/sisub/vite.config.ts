import faroUploader from "@grafana/faro-rollup-plugin"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(async ({ mode, isSsrBuild }) => {
	// Source map upload do Faro — habilitado só quando FARO_SOURCEMAP_API_KEY existe
	// (vem do shell/CI ou do .env). Sem a key: não gera nem envia maps; o build não
	// quebra e as stacks no Grafana ficam ofuscadas (mesmo princípio opcional do resto).
	// A key é o único secret aqui — appId/stackId/endpoint são identificadores públicos.
	const env = loadEnv(mode, process.cwd(), "")
	const faroSourcemapApiKey = env.FARO_SOURCEMAP_API_KEY
	// Só faz upload dos maps do bundle do browser — erros de servidor vão via OTel, não Faro.
	const uploadSourcemaps = Boolean(faroSourcemapApiKey) && !isSsrBuild

	return {
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
				// Sink central de exceptions server-side (SSR + server fns) → OTel/OTLP.
				plugins: ["./src/lib/observability/nitro-otel.ts"],
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
			(await babel({ presets: [reactCompilerPreset()] })) as unknown as import("vite").Plugin,
			// Gera bundleId + faz upload das sourcemaps do browser para o Faro (stacks
			// desofuscadas no Grafana). keepSourcemaps:false → maps apagados após upload,
			// nunca servidos ao cliente. Só ativo quando há API key (e fora do build SSR).
			...(uploadSourcemaps
				? [
						faroUploader({
							appName: "sisub",
							endpoint: "https://faro-api-prod-sa-east-1.grafana.net/faro/api/v1",
							appId: "1224",
							stackId: "1668213",
							apiKey: faroSourcemapApiKey,
							gzipContents: true,
							keepSourcemaps: false,
						}) as unknown as import("vite").Plugin,
					]
				: []),
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
			// "hidden" gera os .map sem comentário sourceMappingURL no JS — o Faro plugin
			// envia e apaga; sem upload configurado fica false (comportamento atual).
			sourcemap: uploadSourcemaps ? ("hidden" as const) : false,
			// cssCodeSplit: false evita FOUC — sem isso o CSS é injetado por chunk de rota.
			cssCodeSplit: false,
			chunkSizeWarningLimit: 800,
			rollupOptions: {
				output: {
					// Nome fixo (sem hash) para o CSS principal — previne mismatch de hash entre
					// o build SSR e o build client: Tailwind gera output diferente em cada pass.
					// Cache-busting feito server-side via Cache-Control: no-cache em /assets/styles.css.
					assetFileNames: (asset: { names: string[] }) => (asset.names?.includes("styles.css") ? "assets/styles.css" : "assets/[name]-[hash][extname]"),
				},
			},
		},
	}
})
