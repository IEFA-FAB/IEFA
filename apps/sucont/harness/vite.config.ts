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
	// O grafo do catálogo passa por `#/env`, que valida as variáveis do cliente na
	// carga do módulo. Valores fictícios de propósito: o harness não fala com o
	// Supabase (sessão semeada, server functions stubadas), então credencial real
	// aqui seria risco sem contrapartida.
	define: {
		"import.meta.env.VITE_SUCONT_SUPABASE_URL": JSON.stringify("https://harness.invalid"),
		"import.meta.env.VITE_SUCONT_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("sb_publishable_harness_stub"),
	},
	// Alias em forma de lista porque a ORDEM importa: o stub de `auth.fn` tem de
	// casar antes da regra generica `#/`.
	resolve: {
		alias: [
			{ find: /^#\/server\/auth\.fn$/, replacement: resolve(__dirname, "./stubs/auth.fn.ts") },
			{ find: /^#\/server\/legal\.fn$/, replacement: resolve(__dirname, "./stubs/legal.fn.ts") },
			{ find: /^#\//, replacement: `${resolve(__dirname, "../src")}/` },
		],
	},
})
