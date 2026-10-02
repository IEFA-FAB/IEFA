import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { isFabEmail } from "./email-domain.ts"
import { normalizeEmail } from "./errors.ts"

/** Casos que o hook do Auth (migration 20261001100100) e `isFabEmail` precisam decidir igual. */
const CASES: [string, boolean][] = [
	["fulano@fab.mil.br", true],
	["Fulano.Silva@FAB.MIL.BR", true],
	["  ciclano@fab.mil.br ", true],
	["fulano+tag@fab.mil.br", true],
	["x@fab.mil.br.evil.com", false],
	["x@evil.fab.mil.br", false],
	["x@fabxmil.br", false],
	["x@fab.mil.br@evil.com", false],
	["a@b@fab.mil.br", false],
	["@fab.mil.br", false],
	["x@fab.mil.br\nevil", false],
	["x y@fab.mil.br", false],
	["fab.mil.br", false],
	["fulano@gmail.com", false],
	["", false],
]

describe("isFabEmail", () => {
	test.each(CASES)("%p → %p", (email, expected) => {
		expect(isFabEmail(email)).toBe(expected)
	})

	test("nulo e indefinido não são institucionais", () => {
		expect(isFabEmail(null)).toBe(false)
		expect(isFabEmail(undefined)).toBe(false)
	})
})

/**
 * A tela e o hook não podem divergir: se a tela aceita e o hook recusa, a pessoa vê "cadastro
 * enviado" e nunca recebe conta; no inverso, a tela bloqueia quem o servidor aceitaria. O padrão
 * é LIDO da migration (não redigitado aqui) e traduzido para o dialeto JS só no que difere
 * (`[:space:]` → `\s`).
 */
describe("paridade com o hook do Auth", () => {
	const migration = readFileSync(join(import.meta.dir, "..", "..", "database", "supabase", "migrations", "20261001100100_before_user_created_hook.sql"), "utf8")
	const literal = /v_email ~ '(\^\[\^@\[:space:\]\]\+@fab\\\.mil\\\.br\$)'/.exec(migration)?.[1]

	test("o hook decide pelo padrão de domínio exato", () => {
		expect(literal).toBe("^[^@[:space:]]+@fab\\.mil\\.br$")
	})

	test.each([...CASES, ["x@fab.mil.br\n", true] as [string, boolean]])("hook e tela concordam em %p", (email, expected) => {
		const hookPattern = new RegExp((literal ?? "(?!)").replace("[:space:]", "\\s"))
		// O caminho real: o formulário manda `normalizeEmail(email)` ao GoTrue (`createAuthActions`),
		// e o hook aplica `lower(btrim(...))` sobre o que chegou — `btrim` sem argumento tira só espaço.
		const atHook = normalizeEmail(email)
			.toLowerCase()
			.replace(/^ +| +$/g, "")
		expect(hookPattern.test(atHook)).toBe(expected)
		expect(isFabEmail(email)).toBe(expected)
	})
})
