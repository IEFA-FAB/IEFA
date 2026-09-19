import { DomainError, GENERIC_DB_ERROR_MESSAGE, NotFoundError, QueryFailedError } from "@iefa/sisub-domain/types"
import { afterEach, describe, expect, test, vi } from "vitest"

const setResponseStatus = vi.fn()
vi.mock("@tanstack/react-start/server", () => ({ setResponseStatus: (code: number) => setResponseStatus(code) }))

const { handleDomainError } = await import("./domain-errors")

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

	test("erro desconhecido que não é do driver passa intacto", () => {
		const plain = new Error("Sessão expirada")
		expect(thrownBy(plain)).toBe(plain)
	})
})
