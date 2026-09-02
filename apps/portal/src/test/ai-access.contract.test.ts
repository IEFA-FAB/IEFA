/**
 * Contrato dos caminhos até o modelo, no portal.
 *
 * Os testes de unidade provam que a guarda funciona; este prova que **todo** caminho
 * passa por ela — e cobra caminho novo sem ninguém precisar lembrar de adicioná-lo,
 * porque a varredura é sobre o código-fonte. É o mesmo contrato que o sucont mantém, e
 * ele existe lá porque uma rota nasceu chamando o Bedrock da conta sem sessão, sem
 * permissão e sem teto.
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

/** Quem monta o adapter na mão precisaria da cadeia inteira no próprio arquivo. */
const DIRECT_ADAPTER = SOURCES.filter((s) => s.path !== GUARD_MODULE && s.text.includes("createAdapterFromEnv("))

/** Quem usa o ponto único precisa do dono vindo do guard de sessão. */
const VIA_GUARD_MODULE = SOURCES.filter((s) => s.path !== GUARD_MODULE && /\bgenerateJson\s*[<(]/.test(s.text))

describe("varredura", () => {
	// Se um refactor renomear os símbolos, os describes abaixo passariam vazios e o
	// contrato viraria decoração. Este teste é o que denuncia a varredura vazia.
	it("encontra os caminhos conhecidos até o modelo", () => {
		expect(VIA_GUARD_MODULE.map((s) => s.path).sort()).toEqual(["src/server/documents-ai.fn.ts", "src/server/documents-import.fn.ts"])
	})

	// A rota Nitro monta o adapter na mão porque o stream não passa por server function.
	// Quem faz isso precisa da cadeia inteira dentro do próprio arquivo — é o que os testes
	// abaixo cobram.
	it("só a rota de conversa monta adapter fora do ponto de guarda", () => {
		expect(DIRECT_ADAPTER.map((s) => s.path)).toEqual(["routes/api/comunicacoes/chat.post.ts"])
	})
})

describe("ponto de guarda — src/lib/ai.server.ts", () => {
	const guard = SOURCES.find((s) => s.path === GUARD_MODULE)

	it("existe", () => {
		expect(guard).toBeDefined()
	})

	it("aplica o capability gate antes de montar o adapter", () => {
		const text = guard?.text ?? ""
		expect(text).toContain("getServerCapabilities()")
		expect(text.indexOf("getServerCapabilities()")).toBeLessThan(text.indexOf("createAdapterFromEnv("))
	})

	it("aplica o teto de requisições antes de montar o adapter", () => {
		const text = guard?.text ?? ""
		expect(text).toContain('enforceRequestRateLimit("PORTAL"')
		expect(text.indexOf("enforceRequestRateLimit(")).toBeLessThan(text.indexOf("createAdapterFromEnv("))
	})

	it("chaveia os tetos do adapter pelo usuário", () => {
		expect(guard?.text).toMatch(/createAdapterFromEnv\("PORTAL",\s*\{\s*rateLimitKey:/)
	})

	// `throw Response` numa server function do Start resolve como DADO: o status precisa
	// sair por `setResponseStatus`, senão o 503 e o 429 chegam à tela como sucesso.
	it("marca o status por setResponseStatus, não por throw Response", () => {
		expect(guard?.text).toContain("setResponseStatus(503)")
		expect(guard?.text).toContain("setResponseStatus(429)")
		expect(guard?.text).not.toMatch(/throw\s+new\s+Response\(/)
	})
})

describe.each(DIRECT_ADAPTER.map((s) => [s.path, s] as const))("adapter direto — %s", (_path, source) => {
	it("tem capability gate antes de montar o adapter", () => {
		expect(source.text).toContain("getServerCapabilities()")
		expect(source.text.indexOf("getServerCapabilities()")).toBeLessThan(source.text.indexOf("createAdapterFromEnv("))
	})

	it("exige sessão — o guard de rota do app é client-side e não alcança rota Nitro", () => {
		expect(source.text).toMatch(/requirePortalUser\(/)
		expect(source.text.indexOf("requirePortalUser(")).toBeLessThan(source.text.indexOf("createAdapterFromEnv("))
	})

	it("aplica o teto ANTES de abrir o SSE", () => {
		expect(source.text).toContain('enforceRequestRateLimit("PORTAL"')
		expect(source.text.indexOf("enforceRequestRateLimit(")).toBeLessThan(source.text.indexOf("createAdapterFromEnv("))
	})

	it("chaveia os tetos do adapter pelo usuário", () => {
		expect(source.text).toMatch(/createAdapterFromEnv\("PORTAL",\s*\{\s*rateLimitKey:/)
	})

	// O h3 v2 monta a resposta de erro a partir de `error.headers`: um `setResponseHeader`
	// no event é descartado nesse caminho e o 429 chega sem a espera.
	it("carrega o Retry-After dentro do HTTPError, não pelo event", () => {
		expect(source.text).toMatch(/new HTTPError\(\{[\s\S]*?headers:\s*\{\s*"Retry-After"/)
		expect(source.text).not.toMatch(/setResponseHeader\(\s*event\s*,\s*"Retry-After"/)
	})

	it("recusa documento classificado antes de montar o adapter", () => {
		expect(source.text).toContain('document.classification !== "ostensivo"')
		expect(source.text.indexOf('document.classification !== "ostensivo"')).toBeLessThan(source.text.indexOf("createAdapterFromEnv("))
	})
})

describe.each(VIA_GUARD_MODULE.map((s) => [s.path, s] as const))("via ai.server — %s", (_path, source) => {
	it("exige sessão", () => {
		expect(source.text).toMatch(/requireUserId\(\)/)
	})

	// O dono precisa vir da sessão. Aceitar `userId` do input devolveria o teto ao
	// cliente: bastaria mandar um id novo a cada chamada.
	it("passa o userId da sessão em toda chamada ao modelo, nunca do input", () => {
		const calls = source.text.match(/\bgenerateJson\s*(?:<[^>]*>)?\(\{[\s\S]{0,200}?\}/g) ?? []
		expect(calls.length).toBeGreaterThan(0)
		for (const call of calls) expect(call).toMatch(/userId,|userId:\s*userId/)
		expect(source.text).not.toMatch(/userId:\s*data\./)
	})

	it("não aceita userId no schema de entrada", () => {
		expect(source.text).not.toMatch(/userId:\s*z\./)
	})

	// Documento classificado não pode chegar a provider nenhum: a recusa tem de vir antes
	// da chamada, não depois de o texto já ter saído.
	it("recusa grau de sigilo diferente de ostensivo antes de chamar o modelo", () => {
		expect(source.text).toContain('data.classification !== "ostensivo"')
		// Contra a CHAMADA, não contra o import: `indexOf("generateJson")` acharia a linha
		// de import lá em cima e o teste passaria com a recusa depois da geração.
		expect(source.text.indexOf('data.classification !== "ostensivo"')).toBeLessThan(source.text.indexOf("await generateJson"))
	})
})

describe("persistência dos documentos", () => {
	const fns = SOURCES.filter((s) => /^src\/server\/(documents.*|chat-history|writer-profile)\.fn\.ts$/.test(s.path))

	it("encontra as server functions de documento", () => {
		expect(fns.map((s) => s.path).sort()).toEqual([
			"src/server/chat-history.fn.ts",
			"src/server/documents-ai.fn.ts",
			"src/server/documents-import.fn.ts",
			"src/server/documents.fn.ts",
			"src/server/writer-profile.fn.ts",
		])
	})

	it("toda server function de documento exige sessão", () => {
		for (const source of fns) {
			expect(source.text, source.path).toMatch(/requireUserId\(\)/)
		}
	})

	// O client é service role e bypassa RLS; `/_serverFn/<id>` é endpoint HTTP cru. Sem o
	// dono no WHERE (ou no INSERT, no caso da criação), um id de documento alheio bastaria.
	it("toda leitura ou escrita de documento amarra o dono da sessão", () => {
		const crud = SOURCES.find((s) => s.path === "src/server/documents.fn.ts")
		const accesses = crud?.text.match(/\.from\("official_document"\)[\s\S]*?(?=\n\n|\n\t\treturn)/g) ?? []
		expect(accesses.length).toBe(5)
		for (const acesso of accesses) {
			expect(acesso).toMatch(/\.eq\("owner_id", userId\)|owner_id: userId/)
		}
	})

	it("o dono nunca vem do payload do cliente", () => {
		for (const source of fns) {
			expect(source.text, source.path).not.toMatch(/owner_id:\s*data\./)
		}
	})
})

describe("ciclo de vida da conversa", () => {
	const crud = SOURCES.find((s) => s.path === "src/server/documents.fn.ts")
	const history = SOURCES.find((s) => s.path === "src/server/chat-history.fn.ts")

	// A conversa guarda pedido em linguagem natural, às vezes mais revelador que o próprio
	// expediente. Ela morre com o documento, ainda que o documento só saia de vista.
	it("excluir o documento apaga a conversa dele", () => {
		expect(crud?.text).toMatch(/from\("chat_message"\)[\s\S]{0,80}\.delete\(\)/)
		expect(crud?.text).toMatch(/\.delete\(\)[\s\S]{0,120}\.eq\("owner_id", userId\)/)
	})

	// `document_id` vem do cliente e não prova nada: sem conferir o dono do documento, um id
	// alheio penduraria mensagens na conversa de outra pessoa.
	it("gravar mensagem confere o dono do documento antes de inserir", () => {
		expect(history?.text).toContain('.from("official_document")')
		expect(history?.text.indexOf('.from("official_document")')).toBeLessThan(
			history?.text.indexOf('.from("chat_message")\n\t\t\t.insert') ?? Number.MAX_SAFE_INTEGER
		)
	})
})
