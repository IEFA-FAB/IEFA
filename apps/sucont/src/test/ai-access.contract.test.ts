/**
 * Contrato exaustivo dos caminhos até o modelo.
 *
 * Os testes de unidade provam que a guarda funciona; este prova que **todo** caminho
 * passa por ela. A varredura é sobre o código-fonte porque o risco real não é a
 * guarda quebrar — é um caminho novo nascer sem ela, como o `/api/chat/stream`
 * nasceu: rota Nitro, fora do guard client-side do `__root`, chamando o Bedrock da
 * conta sem sessão, sem permissão e sem teto.
 *
 * Caminho novo entra na varredura sozinho: quem importar `@iefa/ai-provider` ou
 * `#/lib/ai.server` é cobrado aqui sem ninguém precisar lembrar de adicionar o teste.
 */
import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const APP_ROOT = resolve(import.meta.dir, "../..")
const SCAN_DIRS = ["src", "routes"]

/** O próprio ponto de guarda — ele define a cadeia, não a consome. */
const GUARD_MODULE = "src/lib/ai.server.ts"

function sourceFiles(): string[] {
	const out: string[] = []
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name)
			if (entry.isDirectory()) {
				if (entry.name !== "node_modules") walk(full)
			} else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) {
				out.push(full)
			}
		}
	}
	for (const dir of SCAN_DIRS) walk(join(APP_ROOT, dir))
	return out
}

type Source = { path: string; text: string }

const SOURCES: Source[] = sourceFiles().map((path) => ({ path: relative(APP_ROOT, path), text: readFileSync(path, "utf8") }))

/** Monta o adapter na mão — precisa da cadeia inteira no próprio arquivo. */
const DIRECT_ADAPTER = SOURCES.filter((s) => s.path !== GUARD_MODULE && s.text.includes("createAdapterFromEnv("))

/** Usa o ponto único das server functions — precisa do dono vindo do guard. */
const VIA_GUARD_MODULE = SOURCES.filter((s) => s.path !== GUARD_MODULE && /\b(generateText|generateJson)\s*[<(]/.test(s.text))

describe("varredura", () => {
	// Se um refactor renomear os símbolos, os describes abaixo passariam vazios e o
	// contrato viraria decoração. Este teste é o que denuncia a varredura vazia.
	it("encontra os caminhos conhecidos até o modelo", () => {
		expect(DIRECT_ADAPTER.map((s) => s.path).sort()).toEqual(["routes/api/chat/stream.post.ts", "routes/api/sacdgc/analyze.post.ts"])
		expect(VIA_GUARD_MODULE.map((s) => s.path).sort()).toEqual(["src/server/conta-generica.fn.ts", "src/server/document-ai.fn.ts"])
	})
})

describe.each(DIRECT_ADAPTER.map((s) => [s.path, s] as const))("adapter direto — %s", (_path, source) => {
	it("tem capability gate antes de montar o adapter", () => {
		expect(source.text).toContain("getServerCapabilities()")
		expect(source.text.indexOf("getServerCapabilities()")).toBeLessThan(source.text.indexOf("createAdapterFromEnv("))
	})

	it("exige sessão e permissão do módulo sucont", () => {
		expect(source.text).toMatch(/auth\.getUser\(\)|requireSucont/)
		expect(source.text).toMatch(/hasPermission\([^)]*"sucont"|requireSucont/)
	})

	it("aplica o teto de requisições antes de montar o adapter", () => {
		expect(source.text).toContain('enforceRequestRateLimit("SUCONT"')
		expect(source.text.indexOf("enforceRequestRateLimit(")).toBeLessThan(source.text.indexOf("createAdapterFromEnv("))
	})

	it("chaveia os tetos do adapter pelo usuário", () => {
		expect(source.text).toMatch(/createAdapterFromEnv\("SUCONT",\s*\{\s*rateLimitKey:/)
	})

	it("traduz o estouro de teto em 429 com Retry-After", () => {
		expect(source.text).toContain("RateLimitError")
		expect(source.text).toContain("Retry-After")
		expect(source.text).toContain("429")
	})

	// O h3 v2 monta a resposta de erro a partir de `error.headers`: um
	// `setResponseHeader` no event é descartado nesse caminho e o 429 chega sem a
	// espera. O header tem de nascer dentro do próprio createError.
	it("carrega o Retry-After dentro do createError, não pelo event", () => {
		expect(source.text).toMatch(/createError\(\{[\s\S]*?headers:\s*\{\s*"Retry-After"/)
		expect(source.text).not.toMatch(/setResponseHeader\(\s*event\s*,\s*"Retry-After"/)
	})
})

describe.each(VIA_GUARD_MODULE.map((s) => [s.path, s] as const))("via ai.server — %s", (_path, source) => {
	it("exige conta com grant do sucont", () => {
		expect(source.text).toMatch(/requireSucont(Access|Editor|Admin)\(\)/)
	})

	// O dono precisa vir do UserContext do guard. Aceitar `userId` do input validado
	// devolveria o teto ao cliente: bastaria mandar um id novo a cada chamada.
	it("passa o userId do guard em toda chamada ao modelo, nunca do input", () => {
		const calls = source.text.match(/\b(?:generateText|generateJson)\s*(?:<[^>]*>)?\(\{[^}]*\}/g) ?? []
		expect(calls.length).toBeGreaterThan(0)
		for (const call of calls) {
			expect(call).toMatch(/userId:\s*ctx\.userId/)
		}
		expect(source.text).not.toMatch(/userId:\s*data\./)
	})

	// `.validator(z.object(...))` com um userId aceito do cliente é o mesmo furo por
	// outra porta — o schema não pode sequer oferecer o campo.
	it("não aceita userId no schema de entrada", () => {
		expect(source.text).not.toMatch(/userId:\s*z\./)
	})
})
