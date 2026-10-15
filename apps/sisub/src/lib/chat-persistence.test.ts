import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const toastError = vi.fn()
vi.mock("@/components/ui/toast", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }))

import { isRetryableSaveError, persistAssistantReply, retryWithBackoff } from "./chat-persistence"
import { ServerFnTransportError } from "./server-fn-response"

const notProcessed = () => new ServerFnTransportError("o SISUB está sendo atualizado", 503)
const maybeSaved = () => new ServerFnTransportError("a conexão caiu", 0)

describe("isRetryableSaveError", () => {
	test("repete só o que o handler certamente não gravou", () => {
		expect(isRetryableSaveError(new ServerFnTransportError("x", 503))).toBe(true)
		expect(isRetryableSaveError(new ServerFnTransportError("x", 500, true))).toBe(true)
		// Pode ter gravado: repetir duplicaria a mensagem.
		expect(isRetryableSaveError(new ServerFnTransportError("x", 0))).toBe(false)
		expect(isRetryableSaveError(new ServerFnTransportError("x", 502))).toBe(false)
		expect(isRetryableSaveError(new ServerFnTransportError("x", 504))).toBe(false)
		expect(isRetryableSaveError(new ServerFnTransportError("x", 404, true))).toBe(true)
		// 4xx de fora do handler (WAF/ALB em HTML): não muda na próxima tentativa.
		expect(isRetryableSaveError(new ServerFnTransportError("x", 403))).toBe(false)
		expect(isRetryableSaveError(new ServerFnTransportError("x", 404))).toBe(false)
		// Erro do handler (validação, permissão, limite): permanente.
		expect(isRetryableSaveError(new Error("Limite de mensagens atingido"))).toBe(false)
	})
})

describe("retryWithBackoff", () => {
	test("devolve o resultado assim que uma tentativa dá certo", async () => {
		const run = vi.fn().mockRejectedValueOnce(notProcessed()).mockResolvedValueOnce("ok")
		await expect(retryWithBackoff(run, { baseDelayMs: 0 })).resolves.toBe("ok")
		expect(run).toHaveBeenCalledTimes(2)
	})

	test("lança o último erro depois da primeira tentativa mais as novas", async () => {
		const run = vi.fn().mockRejectedValue(notProcessed())
		await expect(retryWithBackoff(run, { retries: 2, baseDelayMs: 0 })).rejects.toThrow("sendo atualizado")
		expect(run).toHaveBeenCalledTimes(3)
	})

	test("erro permanente ou que pode ter gravado não se repete", async () => {
		const permanent = vi.fn().mockRejectedValue(new Error("sem permissão"))
		await expect(retryWithBackoff(permanent, { baseDelayMs: 0 })).rejects.toThrow("sem permissão")
		expect(permanent).toHaveBeenCalledTimes(1)

		const ambiguous = vi.fn().mockRejectedValue(maybeSaved())
		await expect(retryWithBackoff(ambiguous, { baseDelayMs: 0 })).rejects.toThrow("a conexão caiu")
		expect(ambiguous).toHaveBeenCalledTimes(1)
	})
})

describe("persistAssistantReply", () => {
	beforeEach(() => {
		toastError.mockClear()
		vi.spyOn(console, "error").mockImplementation(() => {})
	})
	afterEach(() => {
		vi.restoreAllMocks()
	})

	const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

	test("grava na sessão resolvida, sem avisar ninguém", async () => {
		const save = vi.fn().mockResolvedValue(undefined)
		persistAssistantReply(Promise.resolve("sessao-1"), save, { baseDelayMs: 0 })
		await settle()
		expect(save).toHaveBeenCalledWith("sessao-1")
		expect(toastError).not.toHaveBeenCalled()
	})

	test("falha definitiva: loga e avisa que a resposta não foi salva", async () => {
		const save = vi.fn().mockRejectedValue(new Error("500"))
		persistAssistantReply(Promise.resolve("sessao-1"), save, { baseDelayMs: 0 })
		await settle()
		expect(console.error).toHaveBeenCalled()
		expect(toastError).toHaveBeenCalledWith("A resposta não foi salva", expect.anything())
	})

	test("conexão caída: avisa que pode não ter sido salva, sem repetir", async () => {
		const save = vi.fn().mockRejectedValue(maybeSaved())
		persistAssistantReply(Promise.resolve("sessao-1"), save, { baseDelayMs: 0 })
		await settle()
		expect(save).toHaveBeenCalledTimes(1)
		expect(toastError).toHaveBeenCalledWith("A resposta pode não ter sido salva", expect.anything())
	})

	test("sessão que não foi criada também avisa", async () => {
		const save = vi.fn()
		persistAssistantReply(Promise.reject(new Error("sem sessão")), save, { baseDelayMs: 0 })
		await settle()
		expect(save).not.toHaveBeenCalled()
		expect(toastError).toHaveBeenCalledTimes(1)
	})

	test("sem sessão em andamento não faz nada", () => {
		const save = vi.fn()
		persistAssistantReply(null, save)
		expect(save).not.toHaveBeenCalled()
	})
})
