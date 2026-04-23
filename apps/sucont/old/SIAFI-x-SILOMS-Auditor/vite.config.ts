import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
	const _env = loadEnv(mode, ".", "")
	return {
		server: {
			port: 3000,
			host: "0.0.0.0",
		},
		plugins: [react(), tailwindcss()],
		build: {
			target: "esnext",
		},
		define: {
			"process.env.NODE_ENV": JSON.stringify(mode),
			"process.platform": JSON.stringify("browser"),
			"process.version": JSON.stringify("v18.0.0"),
			global: "globalThis",
		},
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "."),
			},
		},
	}
})
