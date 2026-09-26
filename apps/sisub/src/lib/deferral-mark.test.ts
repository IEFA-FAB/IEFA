import { describe, expect, test, vi } from "vitest"
import { withDeferralRollback } from "./deferral-mark"

describe("withDeferralRollback", () => {
	test("efetivou: a marca fica", async () => {
		const clear = vi.fn(async () => {})
		await expect(withDeferralRollback(true, async () => "ok", clear)).resolves.toBe("ok")
		expect(clear).not.toHaveBeenCalled()
	})

	test("falhou ANTES da efetivação (custo da nota): a marca sai e o erro segue", async () => {
		const clear = vi.fn(async () => {})
		await expect(
			withDeferralRollback(
				true,
				async () => {
					throw new Error("Erro ao gravar o custo da linha")
				},
				clear
			)
		).rejects.toThrow("Erro ao gravar o custo da linha")
		expect(clear).toHaveBeenCalledTimes(1)
	})

	test("sem adiamento não há o que limpar", async () => {
		const clear = vi.fn(async () => {})
		await expect(
			withDeferralRollback(
				false,
				async () => {
					throw new Error("Efetivação falhou")
				},
				clear
			)
		).rejects.toThrow("Efetivação falhou")
		expect(clear).not.toHaveBeenCalled()
	})

	test("a limpeza que falha é dita, junto com o erro original", async () => {
		await expect(
			withDeferralRollback(
				true,
				async () => {
					throw new Error("Efetivação falhou")
				},
				async () => {
					throw new Error("timeout")
				}
			)
		).rejects.toThrow(/Efetivação falhou — e a marca de consulta adiada não pôde ser desfeita \(timeout\)/)
	})
})
