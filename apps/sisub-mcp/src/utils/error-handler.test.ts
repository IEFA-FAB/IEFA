import { describe, expect, spyOn, test } from "bun:test"
import { DomainError, GENERIC_DB_ERROR_MESSAGE, QueryFailedError } from "@iefa/sisub-domain/types"
import { handleToolError } from "./error-handler.ts"

describe("handleToolError", () => {
	test("falha de banco não entrega SQL nem parâmetros ao modelo", () => {
		const stderr = spyOn(process.stderr, "write").mockImplementation(() => true)
		try {
			const result = handleToolError(new QueryFailedError("FETCH_FAILED", "Failed query: select * from kitchen.recipes\nparams: segredo"))
			expect(result.isError).toBe(true)
			expect(result.content[0]?.text).toBe(GENERIC_DB_ERROR_MESSAGE)
			expect(String(stderr.mock.calls[0]?.[0])).toContain("kitchen.recipes")
		} finally {
			stderr.mockRestore()
		}
	})

	test("erro de negócio continua legível", () => {
		expect(handleToolError(new DomainError("TEMPLATE_DELETED", "Template removido")).content[0]?.text).toBe("Template removido")
	})
})
