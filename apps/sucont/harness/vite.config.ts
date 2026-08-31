import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Config mínima do harness: sem TanStack Start, sem Nitro, sem env do app.
// O alias e o Tailwind apontam para o `src` real, então o que renderiza são os
// componentes e a folha de estilo de produção.
export default defineConfig({
	root: __dirname,
	plugins: [react(), tailwindcss()],
	resolve: { alias: { "#": resolve(__dirname, "../src") } },
})
