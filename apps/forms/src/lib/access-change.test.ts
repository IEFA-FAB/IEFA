import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { selfViewerGrantRefusal, toFormsAccessError } from "./access-change"

describe("toFormsAccessError", () => {
	test("token da função auditada vira a frase da tela, com o erro cru em cause", () => {
		const raw = { message: "VIEWER_ALREADY_EXISTS", code: "23505" }
		const error = toFormsAccessError(raw)
		expect(error.message).toBe("Este usuário já é um visualizador")
		expect(error.cause).toBe(raw)
	})

	test("erro desconhecido não vaza SQL", () => {
		expect(toFormsAccessError({ message: 'relation "x" does not exist' }).message).not.toContain("relation")
	})
})

describe("selfViewerGrantRefusal", () => {
	test("conceder a OUTRA pessoa não é recusado aqui", () => {
		expect(selfViewerGrantRefusal("a", "b", false)).toBeNull()
		expect(selfViewerGrantRefusal("a", "b", true)).toBeNull()
	})

	test("editor (administração escopada) não concede acesso às respostas a si mesmo", () => {
		expect(selfViewerGrantRefusal("a", "a", false)).toBe("SCOPED_ADMIN_SELF")
	})

	test("o criador já vê tudo", () => {
		expect(selfViewerGrantRefusal("a", "a", true)).toBe("CREATOR_ALREADY_SEES")
	})
})

/**
 * Contrato do servidor: toda concessão/retirada de acesso a questionário passa pela função SQL
 * auditada, com o ator da SESSÃO — e nenhuma escreve direto nas tabelas de acesso (o banco
 * recusa desde 20260921130100; a regra opengrep `access-table-direct-write` também).
 */
describe("forms.fn.ts — acesso a questionário é auditado", () => {
	const source = readFileSync(join(import.meta.dir, "..", "server", "forms.fn.ts"), "utf8")

	test.each([
		["addViewerFn", "add_response_viewer"],
		["updateViewerPolicyFn", "update_response_viewer_policy"],
		["removeViewerFn", "remove_response_viewer"],
		["addEditorFn", "add_questionnaire_editor"],
		["removeEditorFn", "remove_questionnaire_editor"],
	])("%s chama %s com o ator da sessão", (fn, rpc) => {
		const start = source.indexOf(`export const ${fn} =`)
		expect(start).toBeGreaterThan(-1)
		const next = source.indexOf("export const ", start + 1)
		const body = source.slice(start, next === -1 ? undefined : next)
		expect(body).toContain(`db.rpc("${rpc}", {`)
		expect(body).toMatch(/p_actor: user\.id/)
	})

	test("nenhuma escrita direta em tabela de acesso", () => {
		expect(source).not.toMatch(/from\("(response_viewer|response_viewer_scope_binding|questionnaire_editor)"\)\s*\.(insert|update|upsert|delete)\(/)
	})
})
