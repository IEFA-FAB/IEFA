import { beforeEach, describe, expect, test, vi } from "vitest"

const calls: string[] = []
const requireAuth = vi.fn(async () => {
	calls.push("requireAuth")
	return { userId: "u1" }
})
const getDb = vi.fn(() => {
	calls.push("getDb")
	return "db"
})
const handleDomainError = vi.fn((error: unknown): never => {
	throw new Error(`traduzido: ${(error as Error).message}`)
})

vi.mock("./auth.server", () => ({ requireAuth }))
vi.mock("./db.server", () => ({ getDb }))
vi.mock("./domain-errors", () => ({ handleDomainError }))

const { requireAuthThenRun } = await import("./domain-handler.server")

describe("requireAuthThenRun", () => {
	beforeEach(() => {
		calls.length = 0
		vi.clearAllMocks()
	})

	test("autentica antes de obter o banco e repassa db, ctx e payload à operation", async () => {
		const operation = vi.fn(async (db: unknown, ctx: unknown, input: { id: number }) => ({ db, ctx, input }))
		const result = await requireAuthThenRun(operation as never)({ data: { id: 7 } })

		expect(calls).toEqual(["requireAuth", "getDb"])
		expect(result).toEqual({ db: "db", ctx: { userId: "u1" }, input: { id: 7 } })
	})

	test("sem sessão, nem chega ao banco", async () => {
		requireAuth.mockRejectedValueOnce(new Error("Unauthorized"))
		const operation = vi.fn()
		await expect(requireAuthThenRun(operation as never)({ data: {} })).rejects.toThrow("Unauthorized")
		expect(getDb).not.toHaveBeenCalled()
		expect(operation).not.toHaveBeenCalled()
	})

	test("erro da operation passa pelo handleDomainError", async () => {
		const operation = vi.fn(async () => {
			throw new Error("Lote não encontrado")
		})
		await expect(requireAuthThenRun(operation as never)({ data: {} })).rejects.toThrow("traduzido: Lote não encontrado")
		expect(handleDomainError).toHaveBeenCalledTimes(1)
	})

	test("guard customizado substitui o requireAuth", async () => {
		const guard = vi.fn(async () => {
			calls.push("guard")
			return { userId: "admin" }
		})
		const operation = vi.fn(async (_db: unknown, ctx: unknown) => ctx)
		await expect(requireAuthThenRun(operation as never, guard as never)({ data: {} })).resolves.toEqual({ userId: "admin" })
		expect(calls).toEqual(["guard", "getDb"])
		expect(requireAuth).not.toHaveBeenCalled()
	})

	test("falha ao obter o banco também passa pelo handleDomainError", async () => {
		getDb.mockImplementationOnce(() => {
			throw new Error("SISUB_DATABASE_URL is not set")
		})
		await expect(requireAuthThenRun(vi.fn() as never)({ data: {} })).rejects.toThrow("traduzido: SISUB_DATABASE_URL is not set")
	})
})
