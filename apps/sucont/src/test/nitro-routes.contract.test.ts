/**
 * Toda rota Nitro em `routes/` está declarada em `handlers` do `vite.config.ts`.
 *
 * O plugin do Nitro não varre `routes/` por convenção neste setup: o arquivo é
 * compilado e nunca registrado, e o pedido cai no catch-all do SSR do TanStack
 * Start, que responde 307 para `/auth`. Foi o que aconteceu com o
 * `/api/chat/stream` do oráculo — o endpoint existia, tinha guarda, tinha teto, e
 * devolvia redirect em vez de SSE. Nada falhava; o recurso simplesmente não existia.
 *
 * Arquivo novo em `routes/` cai nesta varredura sozinho.
 */
import { describe, expect, it } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const APP_ROOT = resolve(import.meta.dir, "../..")
const ROUTES_DIR = join(APP_ROOT, "routes")
const VITE_CONFIG = readFileSync(join(APP_ROOT, "vite.config.ts"), "utf8")

function routeFiles(): string[] {
	if (!existsSync(ROUTES_DIR)) return []
	const out: string[] = []
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name)
			if (entry.isDirectory()) walk(full)
			else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) out.push(`./${relative(APP_ROOT, full)}`)
		}
	}
	walk(ROUTES_DIR)
	return out.sort()
}

const ROUTE_FILES = routeFiles()

describe("rotas Nitro", () => {
	// Varredura vazia passaria em tudo o que vem abaixo; este teste é o que a denuncia.
	it("encontra as rotas conhecidas", () => {
		expect(ROUTE_FILES).toEqual(["./routes/api/chat/stream.post.ts", "./routes/api/sacdgc/analyze.post.ts"])
	})
})

describe.each(ROUTE_FILES.map((path) => [path] as const))("%s", (path) => {
	it("está declarada em handlers do vite.config.ts", () => {
		expect(VITE_CONFIG).toContain(`handler: "${path}"`)
	})

	// `format: "web"` é o que faz o Nitro devolver a `Response` do handler intacta.
	// Sem ele o SSE é remontado e o corpo do stream se perde.
	it("é declarada com format web", () => {
		const declaration = VITE_CONFIG.split("\n").find((line) => line.includes(`handler: "${path}"`)) ?? ""
		expect(declaration).toContain('format: "web"')
	})
})
