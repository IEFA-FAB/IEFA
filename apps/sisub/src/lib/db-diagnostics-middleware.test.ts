import { describe, expect, test, vi } from "vitest"
import { dbDiagnosticsMiddleware } from "./db-diagnostics-middleware"

type ServerFn = (ctx: { next: () => Promise<unknown> }) => Promise<unknown>
const server = (dbDiagnosticsMiddleware.options as unknown as { server: ServerFn }).server

async function thrownBy(error: unknown): Promise<unknown> {
	return server({ next: () => Promise.reject(error) }).then(
		() => null,
		(e) => e
	)
}

describe("dbDiagnosticsMiddleware", () => {
	vi.spyOn(console, "error").mockImplementation(() => {})

	test("erro com diagnóstico do banco sai cortado", async () => {
		const out = (await thrownBy(new Error("Erro ao listar empenhos: column x does not exist"))) as Error
		expect(out.message).toMatch(/^Erro ao listar empenhos: falha no banco de dados/)
		expect(out.message).not.toContain("column x")
	})

	test("regra de negócio passa a MESMA instância (a UI lê classe e campos)", async () => {
		const original = Object.assign(new Error("Quantidade deve ser positiva"), { nextStep: "verify" })
		expect(await thrownBy(original)).toBe(original)
	})

	test("o que não é Error (redirect, notFound) passa intocado", async () => {
		const redirect = { isRedirect: true }
		expect(await thrownBy(redirect)).toBe(redirect)
	})

	test("sucesso devolve o resultado do next", async () => {
		await expect(server({ next: async () => ({ result: 1 }) })).resolves.toEqual({ result: 1 })
	})
})
