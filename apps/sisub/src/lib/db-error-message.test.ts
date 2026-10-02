import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import { DB_FAILURE_TEXT, NO_ROW_TEXT, publicDbMessage, RAISE_CODES, SYSTEM_FRAGMENTS } from "./db-error-message"

const MIGRATIONS_DIR = join(__dirname, "../../../../packages/database/supabase/migrations")
/** Nomes de condição que as migrations usam no lugar do SQLSTATE. */
const CONDITION_NAMES: Record<string, string> = { check_violation: "23514", invalid_parameter_value: "22023", no_data_found: "P0002" }

describe("publicDbMessage", () => {
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
	afterEach(() => consoleError.mockClear())

	test("RAISE de função do sisub (texto em português) passa como veio", () => {
		expect(publicDbMessage({ code: "P0001", message: "Quantidade deve ser positiva" })).toBe("Quantidade deve ser positiva")
		expect(publicDbMessage({ code: "23505", message: "O empenho 2026NE000123 já está no sistema" })).toBe("O empenho 2026NE000123 já está no sistema")
		expect(consoleError).not.toHaveBeenCalled()
	})

	test("violação de constraint de verdade, mesmo com código de RAISE, não passa", () => {
		const out = publicDbMessage({
			code: "23505",
			message: 'duplicate key value violates unique constraint "count_line_pkey"',
			details: "Key (id)=(42) already exists.",
		})
		expect(out).toBe("já existe um registro com esses dados")
		expect(out).not.toContain("count_line_pkey")
		expect(consoleError).toHaveBeenCalledWith("[db-error]", "23505", expect.stringContaining("count_line_pkey"), "Key (id)=(42) already exists.", "")
	})

	test("diagnóstico do Postgres e do PostgREST vai para o log", () => {
		expect(publicDbMessage({ code: "42703", message: "column empenho.valor_x does not exist" })).toBe(DB_FAILURE_TEXT)
		expect(publicDbMessage({ code: "PGRST116", message: "Cannot coerce the result to a single JSON object" })).toBe(DB_FAILURE_TEXT)
		expect(
			publicDbMessage({ code: "PGRST203", message: "Could not choose the best candidate function between: finance.f(a => integer), finance.f(a => text)" })
		).toBe(DB_FAILURE_TEXT)
		expect(publicDbMessage({ code: "22P02", message: 'invalid input syntax for type uuid: "abc"' })).toBe(DB_FAILURE_TEXT)
	})

	test("falha de transporte do supabase-js (código vazio) não passa, mesmo sem texto conhecido", () => {
		expect(publicDbMessage({ code: "", message: "TypeError: fetch failed" })).toBe("o banco não respondeu; tente de novo")
		expect(publicDbMessage({ code: "", message: "Error: Supabase request timed out after 25000ms" })).toBe("o banco não respondeu; tente de novo")
		expect(publicDbMessage({ code: "", message: "<html><body>502 Bad Gateway</body></html>" })).toBe("o banco não respondeu; tente de novo")
	})

	test("texto nativo sob código que o RAISE também usa não passa", () => {
		expect(publicDbMessage({ code: "22023", message: "cannot call jsonb_to_recordset on a non-array" })).toBe(DB_FAILURE_TEXT)
		expect(publicDbMessage({ code: "P0002", message: "query returned no rows" })).toBe(DB_FAILURE_TEXT)
		expect(publicDbMessage({ code: "55000", message: 'currval of sequence "x" is not yet defined in this session' })).toBe(DB_FAILURE_TEXT)
	})

	test("falha nativa que o usuário entende ganha texto em português", () => {
		expect(publicDbMessage({ code: "40001", message: "could not serialize access due to concurrent update" })).toBe(
			"conflito com outra operação feita ao mesmo tempo; tente de novo"
		)
		expect(publicDbMessage({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(
			"o banco demorou demais para responder; tente de novo"
		)
	})

	test("erro do próprio app, sem código, passa", () => {
		expect(publicDbMessage(new Error("A nota não tem itens"))).toBe("A nota não tem itens")
	})

	test("sem erro e sem linha (`error || !data`): diz isso, sem log vazio", () => {
		expect(publicDbMessage(null)).toBe(NO_ROW_TEXT)
		expect(consoleError).not.toHaveBeenCalled()
	})
})

const migrations = () =>
	readdirSync(MIGRATIONS_DIR)
		.filter((name) => name.endsWith(".sql"))
		.map((file) => readFileSync(join(MIGRATIONS_DIR, file), "utf8"))

describe("contrato com os RAISE das migrations", () => {
	test("nenhuma mensagem de RAISE contém texto que o helper toma por diagnóstico", () => {
		const clashes: string[] = []
		for (const sql of migrations()) {
			for (const match of sql.matchAll(/raise exception\s+'([^']*)'/gi)) {
				if (SYSTEM_FRAGMENTS.some((fragment) => match[1].includes(fragment))) clashes.push(match[1])
			}
		}
		// Mensagem assim sumiria da tela: troque a redação do RAISE.
		expect(clashes).toEqual([])
	})

	test("RAISE_CODES cobre todo ERRCODE que as migrations usam no RAISE", () => {
		const used = new Set<string>()
		for (const sql of migrations()) {
			for (const match of sql.matchAll(/errcode\s*=\s*'([^']+)'/gi)) {
				const code = match[1].toLowerCase()
				used.add(CONDITION_NAMES[code] ?? code.toUpperCase())
			}
		}
		expect(used.size).toBeGreaterThan(0)
		// Código novo num RAISE: a mensagem dele seria tratada como diagnóstico e sumiria da tela.
		expect([...used].filter((code) => !RAISE_CODES.has(code))).toEqual([])
	})
})
