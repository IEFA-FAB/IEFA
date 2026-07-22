/**
 * Contrato EXAUSTIVO de autenticação das server functions.
 *
 * O `security-contracts.test.ts` vizinho verifica invariantes de arquivos específicos
 * (permissions, places, settings). Este aqui faz o inverso: varre TODOS os `*.fn.ts`,
 * exige um guard em cada server function exportada e falha em qualquer endpoint novo
 * que nasça sem guard. Nada de allowlist implícita — o que é público está listado
 * abaixo, com justificativa, e o teste também falha se a lista ficar obsoleta.
 *
 * Por que isso importa mais no sisub do que num app Supabase típico: o servidor usa a
 * service key (`SISUB_SUPABASE_SECRET_KEY`), então RLS NÃO se aplica no caminho
 * servidor. O guard da server fn é a única barreira de autorização que existe. E o
 * `beforeLoad` da rota não é uma barreira: `/_serverFn/<id>` é chamável direto por HTTP.
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const serverDir = dirname(fileURLToPath(import.meta.url))

/**
 * Endpoints deliberadamente anônimos. Cada entrada precisa de um motivo — se você
 * está adicionando um, pergunte primeiro se o dado realmente pode vazar para a
 * internet aberta, porque é exatamente isso que a entrada significa.
 */
const PUBLIC_SERVER_FNS: Record<string, string> = {
	getServerSessionFn: "auth.fn — valida o JWT do request; sem sessão devolve { user: null }, que é o contrato",
	checkDatabaseStatusFn: "database-status.fn — health check booleano, renderizado pelo banner no __root (inclui a tela de login)",
	fetchChangelogPageFn: "changelog.fn — conteúdo da rota _public/changelog",
	fetchLegalDocumentFn: "legal.fn — termos de uso / política de privacidade, rotas _public",
}

/** Chamadas que contam como guard de autenticação (prefixo `require` + maiúscula). */
const GUARD_CALL = /\brequire[A-Z]\w*\(/

type ServerFn = { file: string; name: string; body: string }

function listServerFnFiles(): string[] {
	return readdirSync(serverDir)
		.filter((f) => f.endsWith(".fn.ts"))
		.sort()
}

/**
 * Fatia o arquivo em blocos `export const X = ...` até o próximo `export`. Um parser
 * de AST seria mais preciso, mas amarraria o contrato ao TS compiler API; o corte por
 * `export const` cobre 100% do estilo em uso e falha de forma visível se ele mudar.
 */
function extractServerFns(file: string): ServerFn[] {
	const source = readFileSync(join(serverDir, file), "utf8")
	const out: ServerFn[] = []
	const exportRe = /export const (\w+) = /g

	let match = exportRe.exec(source)
	while (match !== null) {
		const start = match.index
		const next = exportRe.exec(source)
		const body = source.slice(start, next ? next.index : undefined)
		if (body.includes("createServerFn(")) {
			out.push({ file, name: match[1], body })
		}
		match = next
	}
	return out
}

const allServerFns = listServerFnFiles().flatMap(extractServerFns)

describe("server function auth contract", () => {
	test("o scanner encontra as server functions (proteção contra um teste que passa vazio)", () => {
		expect(allServerFns.length).toBeGreaterThan(40)
	})

	test("toda server function tem guard de autenticação ou está declarada como pública", () => {
		const unguarded = allServerFns
			.filter((fn) => !GUARD_CALL.test(fn.body))
			.filter((fn) => !(fn.name in PUBLIC_SERVER_FNS))
			.map((fn) => `${fn.file}:${fn.name}`)

		expect(
			unguarded,
			`Server fn sem guard. Chame requireAuth()/requireUserId()/requireAuthWithPermission() no handler, ou declare em PUBLIC_SERVER_FNS com justificativa.`
		).toEqual([])
	})

	test("a allowlist de endpoints públicos não tem entradas obsoletas", () => {
		const names = new Set(allServerFns.map((fn) => fn.name))
		const stale = Object.keys(PUBLIC_SERVER_FNS).filter((name) => !names.has(name))

		expect(stale, "entradas de PUBLIC_SERVER_FNS que não correspondem mais a nenhuma server fn — remova-as").toEqual([])
	})

	test("endpoints públicos declarados de fato não têm guard (senão a entrada é ruído)", () => {
		const guardedButListed = allServerFns.filter((fn) => fn.name in PUBLIC_SERVER_FNS && GUARD_CALL.test(fn.body)).map((fn) => `${fn.file}:${fn.name}`)

		expect(guardedButListed, "estas fns ganharam guard — remova-as de PUBLIC_SERVER_FNS").toEqual([])
	})

	test("o guard vem ANTES de qualquer acesso ao banco", () => {
		const dbAccess = /\b(getDb|getSupabaseServerClient|getProcurementClient|getCoreClient|getAccessControlClient)\(/
		const late: string[] = []

		for (const fn of allServerFns) {
			if (fn.name in PUBLIC_SERVER_FNS) continue
			const guardIdx = fn.body.search(GUARD_CALL)
			const dbIdx = fn.body.search(dbAccess)
			if (guardIdx === -1 || dbIdx === -1) continue
			if (guardIdx > dbIdx) late.push(`${fn.file}:${fn.name}`)
		}

		expect(late, "o client de DB é obtido antes do guard — inverta a ordem").toEqual([])
	})

	test("os proxies de sync exigem global nível 2 (carregam o ADMIN_SECRET do servidor)", () => {
		const syncFns = allServerFns.filter((fn) => fn.file === "compras-sync.fn.ts" || fn.file === "nutrition-sync.fn.ts")

		expect(syncFns.length).toBeGreaterThan(0)
		for (const fn of syncFns) {
			expect(fn.body, `${fn.file}:${fn.name} precisa do guard de admin`).toMatch(/requireSyncAdmin\(\)/)
		}
		for (const file of ["compras-sync.fn.ts", "nutrition-sync.fn.ts"]) {
			const source = readFileSync(join(serverDir, file), "utf8")
			expect(source).toContain('requireAuthWithPermission("global", 2)')
		}
	})

	test("as fns de perfil são self-only — não usam o userId do payload", () => {
		const selfOnly = allServerFns.filter((fn) => fn.file === "user.fn.ts")

		expect(selfOnly.length).toBeGreaterThan(0)
		for (const fn of selfOnly) {
			expect(fn.body, `${fn.file}:${fn.name} deve derivar a identidade da sessão`).toMatch(/require(UserId|User)\(\)/)
			// `data.userId` no corpo significaria que o cliente ainda escolhe o alvo.
			expect(fn.body.replace(/\/\/.*$/gm, "")).not.toMatch(/\bdata\.userId\b/)
		}
	})
})
