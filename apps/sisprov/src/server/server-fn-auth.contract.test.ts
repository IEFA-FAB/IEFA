/**
 * Contrato EXAUSTIVO de autenticação das server functions do SISPROV.
 *
 * Varre TODOS os `*.fn.ts` desta pasta, exige um guard em cada server function exportada e
 * falha em qualquer endpoint novo que nasça sem guard. O que é público está listado abaixo,
 * com justificativa, e o teste também falha se a lista ficar obsoleta.
 *
 * Por que importa: o servidor usa a service key, então RLS NÃO se aplica no caminho servidor.
 * O guard da server fn é a única barreira, e o `beforeLoad` da rota não é barreira nenhuma:
 * `/_serverFn/<id>` é chamável direto por HTTP. Mesmo contrato do sisub, em `bun:test`.
 */

import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// Montado em partes: escrito por inteiro, o próprio teste viraria uma supressão sem motivo
// para o contrato do monorepo (`server-fn-auth.contract.test.ts` do sisub).
const PUBLIC_MARKER = ["nosemgrep", "server-fn-missing-auth-guard"].join(": ")

const serverDir = import.meta.dir

const PUBLIC_SERVER_FNS: Record<string, string> = {
	getServerSessionFn: "auth.fn: valida o JWT do request; sem sessão devolve { user: null }, que é o contrato",
	checkDatabaseStatusFn: "database-status.fn: health check booleano, renderizado pelo banner no __root (inclui a tela de login)",
	fetchLegalDocumentFn: "legal.fn: termos, privacidade e cookies, rotas _public; precisam ser legíveis sem sessão",
}

/** Chamadas que contam como guard de autenticação (prefixo `require` + maiúscula). */
const GUARD_CALL = /\brequire[A-Z]\w*\(/

type ServerFn = { file: string; name: string; body: string }

function extractServerFns(file: string): ServerFn[] {
	const source = readFileSync(join(serverDir, file), "utf8")
	const out: ServerFn[] = []
	const exportRe = /export const (\w+) = /g
	let match = exportRe.exec(source)
	while (match !== null) {
		const start = match.index
		const next = exportRe.exec(source)
		const body = source.slice(start, next ? next.index : undefined)
		if (body.includes("createServerFn(")) out.push({ file, name: match[1] as string, body })
		match = next
	}
	return out
}

const files = readdirSync(serverDir)
	.filter((f) => f.endsWith(".fn.ts"))
	.sort()
const serverFns = files.flatMap(extractServerFns)

describe("server functions do sisprov", () => {
	test("há server functions para verificar", () => {
		expect(serverFns.length).toBeGreaterThan(5)
	})

	test("toda server function tem guard, salvo as públicas listadas com motivo", () => {
		const missing = serverFns.filter((fn) => !(fn.name in PUBLIC_SERVER_FNS) && !GUARD_CALL.test(fn.body)).map((fn) => `${fn.file} › ${fn.name}`)
		expect(
			missing,
			"server function sem guard: chame requireUserId()/requireAuth()/require*() no início do handler, ou registre em PUBLIC_SERVER_FNS com o motivo"
		).toEqual([])
	})

	test("a lista de públicas não está obsoleta", () => {
		const names = new Set(serverFns.map((fn) => fn.name))
		const stale = Object.keys(PUBLIC_SERVER_FNS).filter((name) => !names.has(name))
		expect(stale).toEqual([])
	})

	test("função pública leva o comentário do nosemgrep, para a regra do opengrep não acusar", () => {
		const withoutMarker = serverFns.filter((fn) => fn.name in PUBLIC_SERVER_FNS && !fn.body.includes(PUBLIC_MARKER)).map((fn) => fn.name)
		// O marcador fica na linha anterior ao `export`, então pertence ao bloco anterior na fatia.
		// Conferimos no arquivo inteiro para não depender da posição.
		const fixed = withoutMarker.filter((name) => {
			const fn = serverFns.find((f) => f.name === name)
			return !fn || !readFileSync(join(serverDir, fn.file), "utf8").includes(PUBLIC_MARKER)
		})
		expect(fixed).toEqual([])
	})

	test("userId nunca vem do payload em operação self-service", () => {
		const selfService = serverFns.filter((fn) => fn.name.startsWith("fetchMy"))
		for (const fn of selfService) expect(fn.body.includes("data.userId"), `${fn.name} lê data.userId`).toBe(false)
	})
})
