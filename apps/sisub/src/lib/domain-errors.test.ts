import { QueryDeadlineError } from "@iefa/database/postgres-pool"
import { AssuranceRequiredError } from "@iefa/pbac"
import { DomainError, GENERIC_DB_ERROR_MESSAGE, NotFoundError, PermissionDeniedError, QueryFailedError } from "@iefa/sisub-domain/types"
import { afterEach, describe, expect, test, vi } from "vitest"

const setResponseStatus = vi.fn()
vi.mock("@tanstack/react-start/server", () => ({ setResponseStatus: (code: number) => setResponseStatus(code) }))

const { handleDomainError, INFRASTRUCTURE_ERROR_MESSAGE } = await import("./domain-errors")

/** Réplica do `DrizzleQueryError`: SQL e parâmetros na `message`, erro do driver em `.cause`. */
function drizzleQueryError(driver: { code: string; message: string }): Error {
	const error = new Error("Failed query: update kitchen.recipes set name = $1 where id = $2\nparams: Feijoada,42")
	error.name = "DrizzleQueryError"
	;(error as Error & { cause?: unknown }).cause = Object.assign(new Error(driver.message), { code: driver.code })
	return error
}

/** O que o `runQuery` lança para uma falha do driver. */
function queryFailed(driver: { code: string; message: string }): QueryFailedError {
	return new QueryFailedError(
		"UPDATE_FAILED",
		`[${driver.code}] ${driver.message} — Failed query: update …`,
		"Não foi possível salvar a receita.",
		drizzleQueryError(driver)
	)
}

function thrownBy(error: unknown): Error {
	try {
		handleDomainError(error)
	} catch (e) {
		return e as Error
	}
	throw new Error("handleDomainError deveria lançar")
}

describe("handleDomainError", () => {
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
	afterEach(() => {
		setResponseStatus.mockClear()
		consoleError.mockClear()
	})

	test("falha de banco: cliente lê a mensagem pública; SQL e parâmetros só no log", () => {
		const detail = "Failed query: select * from core.user_data where email = $1\nparams: fulano@fab.mil.br"
		const err = thrownBy(new QueryFailedError("FETCH_FAILED", detail, GENERIC_DB_ERROR_MESSAGE))

		expect(err.message).toBe(GENERIC_DB_ERROR_MESSAGE)
		expect(err.message).not.toContain("select")
		expect(err.message).not.toContain("fulano")
		expect(consoleError).toHaveBeenCalled()
		expect(String(consoleError.mock.calls[0])).toContain("core.user_data")
	})

	test("falha de banco com prefixo de negócio mantém o prefixo", () => {
		const err = thrownBy(new QueryFailedError("INSERT_FAILED", "Erro ao salvar itens [23505]: Failed query: insert …", "Erro ao salvar itens [23505]"))
		expect(err.message).toBe("Erro ao salvar itens [23505]")
	})

	test("erro cru do driver que escapou do runQuery também é sanitizado", () => {
		const raw = new Error("Failed query: delete from kitchen.recipes where id = $1\nparams: 42")
		raw.name = "DrizzleQueryError"
		const err = thrownBy(raw)
		expect(err.message).toBe(GENERIC_DB_ERROR_MESSAGE)
		expect(setResponseStatus).toHaveBeenCalledWith(500)
	})

	test("erro de negócio continua legível", () => {
		expect(thrownBy(new DomainError("TEMPLATE_DELETED", "Template removido")).message).toBe("Template removido")
		expect(thrownBy(new NotFoundError("recipe", "abc")).message).toBe("recipe abc not found")
		expect(setResponseStatus).toHaveBeenCalledWith(404)
	})

	test.each([
		["CONNECT_TIMEOUT", "write CONNECT_TIMEOUT aws-0-sa-east-1.pooler.supabase.com:6543"],
		["CONNECTION_CLOSED", "write CONNECTION_CLOSED aws-0-sa-east-1.pooler.supabase.com:6543"],
		["ECONNRESET", "read ECONNRESET"],
		["08006", "connection failure"],
		["57P01", "terminating connection due to administrator command"],
		["57014", "canceling statement due to statement timeout"],
	])("falha de infraestrutura %s no QueryFailedError: 503 com mensagem sem detalhe; detalhe só no log", (code, message) => {
		const err = thrownBy(queryFailed({ code, message }))

		expect(setResponseStatus).toHaveBeenCalledWith(503)
		expect(setResponseStatus).not.toHaveBeenCalledWith(400)
		expect(err.message).toBe(INFRASTRUCTURE_ERROR_MESSAGE)
		expect(err.message).not.toContain(code)
		const logged = String(consoleError.mock.calls[0])
		expect(logged).toContain("[domain-error:infra]")
		expect(logged).toContain(code)
	})

	test("prazo do pool (QueryDeadlineError cru): 503", () => {
		const err = thrownBy(new QueryDeadlineError("transaction", 45_000))
		expect(setResponseStatus).toHaveBeenCalledWith(503)
		expect(err.message).toBe(INFRASTRUCTURE_ERROR_MESSAGE)
	})

	test("erro cru do driver por queda de conexão: 503, e o host do pooler não vai ao cliente", () => {
		const raw = Object.assign(new Error("write CONNECTION_CLOSED aws-0-sa-east-1.pooler.supabase.com:6543"), { code: "CONNECTION_CLOSED" })
		expect(thrownBy(raw).message).toBe(INFRASTRUCTURE_ERROR_MESSAGE)
		expect(setResponseStatus).toHaveBeenCalledWith(503)
		expect(thrownBy(drizzleQueryError({ code: "ECONNREFUSED", message: "connect ECONNREFUSED" })).message).toBe(INFRASTRUCTURE_ERROR_MESSAGE)
	})

	test.each([
		["23505", 'duplicate key value violates unique constraint "recipes_name_key"'],
		["23503", "violates foreign key constraint"],
		["42501", "permission denied for table recipes"],
		["P0001", "Quantidade deve ser positiva"],
		["40001", "could not serialize access"],
	])("erro de dado ou permissão %s no QueryFailedError continua 400 com a mensagem pública", (code, message) => {
		const err = thrownBy(queryFailed({ code, message }))
		expect(setResponseStatus).toHaveBeenCalledWith(400)
		expect(setResponseStatus).not.toHaveBeenCalledWith(503)
		expect(err.message).toBe("Não foi possível salvar a receita.")
	})

	test("DomainError de regra de negócio com cause de infraestrutura continua 400: a mensagem é do domínio", () => {
		const business = new DomainError("STOCK_CLOSED", "O estoque está fechado")
		Object.defineProperty(business, "cause", { value: Object.assign(new Error("x"), { code: "ECONNRESET" }) })
		expect(thrownBy(business).message).toBe("O estoque está fechado")
		expect(setResponseStatus).toHaveBeenCalledWith(400)
	})

	test("permissão e garantia de identidade continuam 403", () => {
		expect(thrownBy(new PermissionDeniedError("kitchen", 2)).message).toBe("Requires kitchen level 2")
		expect(setResponseStatus).toHaveBeenLastCalledWith(403)
		const assurance = new AssuranceRequiredError({ nextStep: "challenge", reason: "Aprovar o empenho", grade: "session", origin: "session" })
		expect(thrownBy(assurance)).toBe(assurance)
		expect(setResponseStatus).toHaveBeenLastCalledWith(403)
		expect(setResponseStatus).not.toHaveBeenCalledWith(503)
	})

	test("erro desconhecido que não é do driver passa intacto", () => {
		const plain = new Error("Sessão expirada")
		expect(thrownBy(plain)).toBe(plain)
	})
})
