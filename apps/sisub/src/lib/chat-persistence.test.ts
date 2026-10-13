import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const toastError = vi.fn()
vi.mock("@/components/ui/toast", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }))

import { persistAssistantReply, retryWithBackoff } from "./chat-persistence"

describe("retryWithBackoff", () => {
	test("devolve o resultado assim que uma tentativa dá certo", async () => {
		const run = vi.fn().mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce("ok")
		await expect(retryWithBackoff(run, 3, 0)).resolves.toBe("ok")
		expect(run).toHaveBeenCalledTimes(2)
	})

	test("lança o último erro depois da primeira tentativa mais as novas", async () => {
		const run = vi.fn().mockRejectedValue(new Error("fora do ar"))
		await expect(retryWithBackoff(run, 2, 0)).rejects.toThrow("fora do ar")
		expect(run).toHaveBeenCalledTimes(3)
	})
})

describe("persistAssistantReply", () => {
	beforeEach(() => {
		toastError.mockClear()
		vi.spyOn(console, "error").mockImplementation(() => {})
	})
	afterEach(() => vi.restoreAllMocks())

	const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

	test("grava na sessão resolvida, sem avisar ninguém", async () => {
		const save = vi.fn().mockResolvedValue(undefined)
		persistAssistantReply(Promise.resolve("sessao-1"), save, 0)
		await settle()
		expect(save).toHaveBeenCalledWith("sessao-1")
		expect(toastError).not.toHaveBeenCalled()
	})

	test("esgotadas as tentativas, loga e avisa que a resposta não foi salva", async () => {
		const save = vi.fn().mockRejectedValue(new Error("500"))
		persistAssistantReply(Promise.resolve("sessao-1"), save, 0)
		await settle()
		expect(console.error).toHaveBeenCalled()
		expect(toastError).toHaveBeenCalledWith("A resposta não foi salva", expect.anything())
	})

	test("sessão que não foi criada também avisa", async () => {
		const save = vi.fn()
		persistAssistantReply(Promise.reject(new Error("sem sessão")), save, 0)
		await settle()
		expect(save).not.toHaveBeenCalled()
		expect(toastError).toHaveBeenCalledTimes(1)
	})

	test("sem sessão em andamento não faz nada", () => {
		const save = vi.fn()
		persistAssistantReply(null, save, 0)
		expect(save).not.toHaveBeenCalled()
	})
})
