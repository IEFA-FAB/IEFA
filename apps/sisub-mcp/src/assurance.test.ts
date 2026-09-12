/**
 * Contrato da trava de garantia do despacho de tools.
 *
 * Duas perguntas, e as duas são o requisito "Credencial de API nunca satisfaz exigência de
 * garantia":
 *
 *  1. tool classificada NÃO executa por credencial do MCP — nem por chave de API, nem por
 *     JWT colado num cliente;
 *  2. a negativa é um texto que o MODELO lê e pelo qual corrige o rumo, e não um erro
 *     genérico que o convide a tentar de novo com outros argumentos.
 *
 * O registro real (`MCP_TOOL_ASSURANCE`) está vazio hoje, então o teste injeta uma
 * classificação própria: o que está sob prova é o MECANISMO, que precisa estar funcionando
 * ANTES de existir a primeira tool classificada — depois é tarde.
 *
 * A resolução de credencial também é injetada, em vez de `mock.module` do client Supabase:
 * `auth.test.ts` já registra um dublê para o mesmo módulo, e mock global de um arquivo
 * atravessa para o outro dentro do mesmo processo do `bun test`. Quem prova que a chave real
 * nasce `aal: 1`/`origin: "api-key"` é `auth.test.ts`, contra a implementação de verdade.
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { AssuranceRequirement, UserContext } from "@iefa/pbac"
import { enforceToolAssurance, MCP_TOOL_ASSURANCE } from "./assurance.ts"

const here = dirname(fileURLToPath(import.meta.url))

const FRESH: AssuranceRequirement = { require: "fresh", reason: "Esta operação concede permissão a outro usuário." }
const SESSION: AssuranceRequirement = { require: "session", reason: "Esta operação registra uma liquidação." }

const REGISTRY: Record<string, AssuranceRequirement> = {
	grant_permission: FRESH,
	create_liquidacao: SESSION,
}

function ctx(overrides: Partial<UserContext> = {}): UserContext {
	return { userId: "u-1", permissions: [], aal: 1, lastFactorAt: null, origin: "api-key", ...overrides }
}

/** Resolve sempre o mesmo contexto, e conta as chamadas — o custo faz parte do contrato. */
function resolverOf(context: UserContext) {
	const calls = { count: 0 }
	return {
		calls,
		resolve: async (_credential: string) => {
			calls.count++
			return context
		},
	}
}

describe("trava de garantia no despacho de tools", () => {
	test("tool classificada é recusada para chave de API", async () => {
		const { resolve } = resolverOf(ctx())

		const result = await enforceToolAssurance("grant_permission", "smcp_x", { registry: REGISTRY, resolve })

		expect(result?.isError).toBe(true)
		const text = result?.content[0].text ?? ""
		expect(text).toContain("grant_permission")
		expect(text).toContain("Chaves de API")
		expect(text).toContain("Esta operação concede permissão a outro usuário.")
		// O que separa esta mensagem de um erro genérico: ela FECHA o caminho da tentativa.
		expect(text).toContain("Não tente novamente")
		expect(text).toContain("SISUB")
	})

	test("tool classificada também é recusada para credencial de sessão (JWT)", async () => {
		// `resolveUserContext` fixa `aal: 1` de propósito: o token chega por cabeçalho de um
		// cliente MCP, e lê-lo elevaria a execução de um agente com a prova que a pessoa deu ao
		// navegador. A mensagem muda; o desfecho, não.
		const { resolve } = resolverOf(ctx({ origin: "session", hasVerifiedFactor: true }))

		const result = await enforceToolAssurance("create_liquidacao", "jwt-valido", { registry: REGISTRY, resolve })

		expect(result?.isError).toBe(true)
		expect(result?.content[0].text).toContain("cliente MCP")
	})

	test("nem um contexto forjado em AAL2 destrava a chave de API", async () => {
		// Defesa em profundidade: se um dia alguém popular `aal` a partir da chave, a origem
		// ainda barra. É a regra de `@iefa/pbac`, exercida pelo caminho do MCP.
		const { resolve } = resolverOf(ctx({ aal: 2, lastFactorAt: Math.floor(Date.now() / 1000) }))

		for (const tool of ["grant_permission", "create_liquidacao"]) {
			const result = await enforceToolAssurance(tool, "smcp_x", { registry: REGISTRY, resolve })
			expect(result?.isError, `${tool} deveria ser recusada`).toBe(true)
		}
	})

	test("tool não classificada segue em frente e nem resolve a credencial", async () => {
		const { calls, resolve } = resolverOf(ctx())

		expect(await enforceToolAssurance("list_recipes", "smcp_x", { registry: REGISTRY, resolve })).toBeNull()
		// Rotina não paga ida a mais ao banco — é isso que deixa a trava barata o bastante para
		// ficar no caminho de TODA chamada.
		expect(calls.count).toBe(0)
	})

	test("o registro real não classifica nenhuma tool hoje — a trava é preventiva", async () => {
		// Se alguém classificar uma tool, este teste cai e obriga a decidir de forma consciente:
		// essa tool deixa de funcionar por chave de API, para sempre.
		expect(Object.keys(MCP_TOOL_ASSURANCE)).toEqual([])
		expect(await enforceToolAssurance("list_recipes", "smcp_x", { resolve: resolverOf(ctx()).resolve })).toBeNull()
	})
})

describe("o despacho chama a trava antes do handler", () => {
	// Um teste de fonte, e não de comportamento, porque exercitar o `Server` do SDK exigiria
	// transporte e um round-trip de protocolo para provar uma questão de ORDEM. O que não pode
	// acontecer é a trava existir e o despacho executar o handler antes dela.
	const source = readFileSync(join(here, "server.ts"), "utf8")

	test("`enforceToolAssurance` aparece antes de `tool.handler`", () => {
		const guard = source.indexOf("await enforceToolAssurance(")
		const handler = source.indexOf("await tool.handler(")

		expect(guard, "o despacho não chama enforceToolAssurance").toBeGreaterThan(-1)
		expect(handler, "o despacho não chama tool.handler").toBeGreaterThan(-1)
		expect(guard).toBeLessThan(handler)
	})

	test("a negativa é devolvida, não ignorada", () => {
		expect(source).toContain("if (denied) return denied")
	})
})
