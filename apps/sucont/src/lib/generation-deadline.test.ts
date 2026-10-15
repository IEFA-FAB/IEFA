import { describe, expect, it } from "bun:test"
import { withGenerationDeadline } from "./generation-deadline.ts"

/** Geração falsa que só termina quando o signal abortar — como o SDK, rejeita no abort. */
function hangingGeneration(controller: AbortController, seen: { signal?: AbortSignal }) {
	seen.signal = controller.signal
	return new Promise<string>((_, reject) => {
		controller.signal.addEventListener("abort", () => reject(new Error("Request aborted")), { once: true })
	})
}

describe("withGenerationDeadline", () => {
	it("devolve o resultado dentro do prazo, sem abortar", async () => {
		const seen: { signal?: AbortSignal } = {}
		const result = await withGenerationDeadline({ deadlineMs: 1_000, timeoutMessage: "prazo" }, async (controller) => {
			seen.signal = controller.signal
			return "ok"
		})
		expect(result).toBe("ok")
		expect(seen.signal?.aborted).toBe(false)
	})

	// O ponto do helper: o prazo cancela a chamada no provider, não só a espera.
	it("no prazo, aborta o signal entregue à geração e lança a mensagem do prazo", async () => {
		const seen: { signal?: AbortSignal } = {}
		await expect(withGenerationDeadline({ deadlineMs: 10, timeoutMessage: "prazo vencido" }, (c) => hangingGeneration(c, seen))).rejects.toThrow(
			"prazo vencido"
		)
		expect(seen.signal?.aborted).toBe(true)
	})

	it("cumpre o prazo mesmo com uma geração que ignora o signal", async () => {
		const started = Date.now()
		await expect(withGenerationDeadline({ deadlineMs: 10, timeoutMessage: "prazo" }, () => new Promise<never>(() => {}))).rejects.toThrow("prazo")
		expect(Date.now() - started).toBeLessThan(1_000)
	})

	it("quem pediu foi embora: aborta a geração com a mensagem de cancelamento", async () => {
		const caller = new AbortController()
		const seen: { signal?: AbortSignal } = {}
		const pending = withGenerationDeadline({ deadlineMs: 1_000, timeoutMessage: "prazo", signal: caller.signal, cancelledMessage: "cancelada" }, (c) =>
			hangingGeneration(c, seen)
		)
		caller.abort()
		await expect(pending).rejects.toThrow("cancelada")
		expect(seen.signal?.aborted).toBe(true)
	})

	// Chamar `run` com o signal já abortado cobraria o teto de consumo por uma chamada que nem
	// chega ao provider (cliente que caiu enquanto a server function montava o prompt).
	it("signal já abortado: rejeita com o cancelamento sem chamar a geração", async () => {
		const caller = new AbortController()
		caller.abort()
		let called = false
		await expect(
			withGenerationDeadline({ deadlineMs: 1_000, timeoutMessage: "prazo", signal: caller.signal, cancelledMessage: "cancelada" }, async () => {
				called = true
				return "ok"
			})
		).rejects.toThrow("cancelada")
		expect(called).toBe(false)
	})

	// O teto de consumo distingue prazo de cancelamento pelo nome do `reason`.
	it("o abort do prazo leva reason TimeoutError; o do cancelamento, não", async () => {
		const timedOut: { signal?: AbortSignal } = {}
		await expect(withGenerationDeadline({ deadlineMs: 10, timeoutMessage: "prazo" }, (c) => hangingGeneration(c, timedOut))).rejects.toThrow("prazo")
		const deadlineReason = timedOut.signal?.reason as DOMException | undefined
		expect(deadlineReason?.name).toBe("TimeoutError")

		const caller = new AbortController()
		const cancelled: { signal?: AbortSignal } = {}
		const pending = withGenerationDeadline({ deadlineMs: 1_000, timeoutMessage: "prazo", signal: caller.signal }, (c) => hangingGeneration(c, cancelled))
		caller.abort()
		await expect(pending).rejects.toThrow()
		const cancelReason = cancelled.signal?.reason as DOMException | undefined
		expect(cancelReason).toBeDefined()
		expect(cancelReason?.name).not.toBe("TimeoutError")
	})

	it("erro da geração antes do prazo passa intacto", async () => {
		await expect(
			withGenerationDeadline({ deadlineMs: 1_000, timeoutMessage: "prazo" }, async () => {
				throw new Error("ValidationException")
			})
		).rejects.toThrow("ValidationException")
	})

	it("desfaz o listener do signal de quem pediu ao terminar", async () => {
		const caller = new AbortController()
		const seen: { signal?: AbortSignal } = {}
		await withGenerationDeadline({ deadlineMs: 1_000, timeoutMessage: "prazo", signal: caller.signal }, async (c) => {
			seen.signal = c.signal
			return "ok"
		})
		caller.abort()
		expect(seen.signal?.aborted).toBe(false)
	})
})
