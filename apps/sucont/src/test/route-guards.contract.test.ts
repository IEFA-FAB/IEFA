/**
 * Toda rota do app declara o guard de autorização que lhe cabe.
 *
 * O guard da raiz é largo de propósito — ele só exige grant em ALGUM módulo do
 * sucont, porque `/admin` e as três divisões entram por portas diferentes. Quem
 * recorta é a rota: sem o `beforeLoad` dela, uma tela da SUCONT-4 abre para quem só
 * tem a SUCONT-3, e o único freio passa a ser a server function — que protege o DADO,
 * não a tela. A tela abriria, os botões apareceriam, e a negativa viria só no 403 do
 * primeiro clique.
 *
 * A varredura é sobre o diretório: rota nova cai aqui sozinha, sem ninguém lembrar
 * de acrescentá-la a uma lista.
 */
import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { sucontTools } from "#/lib/data"

const ROUTES_DIR = resolve(import.meta.dir, "../routes")

/**
 * Rotas isentas, e o motivo de cada uma.
 *
 * A lista é curta e explícita porque toda entrada nela é uma tela que qualquer
 * visitante alcança: acrescentar uma sem motivo é abrir o app, e o revisor tem que
 * ver isso no diff.
 */
const PUBLIC_ROUTES = new Map([
	["__root.tsx", "é o guard — exige sessão e grant em algum módulo do sucont"],
	["health.tsx", "health check do ALB; não pode depender de sessão"],
	["auth/index.tsx", "tela de login"],
	["termos-de-uso.tsx", "documento legal — exigir login para lê-lo não informa ninguém"],
	["politica-de-privacidade.tsx", "documento legal"],
	["politica-de-cookies.tsx", "documento legal"],
	["llms[.]txt.tsx", "descoberta para agentes; conteúdo público"],
	["[.]well-known.agent-skills.index[.]json.tsx", "descoberta para agentes"],
	["[.]well-known.agent-skills.$skill.SKILL[.]md.tsx", "descoberta para agentes"],
	["admin/route.tsx", "tem guard próprio: `sucont-admin` nível 3"],
	["admin/index.tsx", "filha de admin/route.tsx, que já cobra o nível"],
	["admin/permissoes.tsx", "filha de admin/route.tsx, que já cobra o nível"],
	["admin/pessoas.tsx", "filha de admin/route.tsx, que já cobra o nível"],
])

function routeFiles(): string[] {
	const out: string[] = []
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name)
			if (entry.isDirectory()) walk(full)
			else if (/\.tsx$/.test(entry.name)) out.push(relative(ROUTES_DIR, full))
		}
	}
	walk(ROUTES_DIR)
	return out.sort()
}

const ROUTE_FILES = routeFiles()
const source = (file: string) => readFileSync(join(ROUTES_DIR, file), "utf8")

/** Caminhos internos que o catálogo declara — os que precisam do guard por divisão. */
const TOOL_PATHS = new Set(sucontTools.map((t) => t.internalPath).filter((p): p is string => Boolean(p)))

describe("guards de rota", () => {
	// Varredura vazia passaria em tudo o que vem abaixo; este teste é o que a denuncia.
	it("encontra as rotas do app", () => {
		expect(ROUTE_FILES.length).toBeGreaterThan(15)
		expect(ROUTE_FILES).toContain("index.tsx")
		expect(ROUTE_FILES).toContain("auditor.tsx")
	})

	it("a lista de isenções só cita rotas que existem", () => {
		// Isenção órfã é isenção que sobreviveu à rota: some do radar e volta a valer
		// quando alguém recriar o arquivo com o mesmo nome.
		for (const file of PUBLIC_ROUTES.keys()) expect(ROUTE_FILES).toContain(file)
	})

	it("toda rota não isenta chama um guard no beforeLoad", () => {
		const semGuard = ROUTE_FILES.filter((file) => {
			if (PUBLIC_ROUTES.has(file)) return false
			return !/beforeLoad:\s*(requireAnyDivision|\(opts\)\s*=>\s*require(ToolAccess|Modules))/.test(source(file))
		})
		expect(semGuard).toEqual([])
	})

	it("rota de ferramenta cobra a divisão DELA, pelo próprio caminho", () => {
		// O argumento do guard é o `internalPath` do catálogo: é o que faz o guard e o
		// catálogo não poderem divergir. Um caminho digitado errado aqui cairia no caso
		// "as três divisões" de `permissionModulesForPath` — abrindo a ferramenta para
		// quem não a vê no catálogo.
		for (const file of ROUTE_FILES) {
			const match = source(file).match(/requireToolAccess\(opts,\s*"([^"]+)"\)/)
			if (!match) continue
			expect(TOOL_PATHS.has(match[1])).toBe(true)
		}
	})

	it("toda ferramenta de rota interna tem uma rota que a guarda", () => {
		// O caminho inverso: ferramenta declarada no catálogo cujo arquivo de rota
		// esqueceu o guard. É como um endpoint de análise entraria sem divisão nenhuma.
		const guarded = new Set(
			ROUTE_FILES.flatMap((file) => {
				const match = source(file).match(/requireToolAccess\(opts,\s*"([^"]+)"\)/)
				return match ? [match[1]] : []
			})
		)
		for (const path of TOOL_PATHS) expect(guarded.has(path)).toBe(true)
	})
})
