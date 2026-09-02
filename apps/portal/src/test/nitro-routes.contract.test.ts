/**
 * Contrato das rotas Nitro.
 *
 * Rota Nitro só existe se estiver declarada em `handlers` no `vite.config.ts`. Sem isso o
 * arquivo em `routes/` é compilado e nunca registrado: o pedido cai no catch-all do SSR do
 * TanStack Start e volta 307 para /auth — o endpoint responde REDIRECT em vez de SSE, e
 * nada no build acusa. Foi o que aconteceu com o chat do sucont.
 */
import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const APP_ROOT = resolve(import.meta.dir, "../..")

function routeFiles(): string[] {
	const out: string[] = []
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name)
			if (entry.isDirectory()) walk(full)
			else if (/\.(post|get|put|delete)\.ts$/.test(entry.name)) out.push(`./${relative(APP_ROOT, full)}`)
		}
	}
	walk(join(APP_ROOT, "routes"))
	return out.sort()
}

const viteConfig = readFileSync(join(APP_ROOT, "vite.config.ts"), "utf8")

describe("rotas Nitro declaradas", () => {
	const files = routeFiles()

	it("encontra as rotas conhecidas", () => {
		// Varredura vazia passaria calada e o contrato viraria decoração.
		expect(files).toEqual(["./routes/api/comunicacoes/chat.post.ts"])
	})

	it.each(files)("%s está declarada em handlers", (file) => {
		expect(viteConfig).toContain(`handler: "${file}"`)
	})

	it("toda rota declarada aponta para arquivo que existe", () => {
		const declared = [...viteConfig.matchAll(/handler: "([^"]+)"/g)].map((m) => m[1])
		expect(declared.length).toBeGreaterThan(0)
		for (const handler of declared) expect(files).toContain(handler)
	})
})
