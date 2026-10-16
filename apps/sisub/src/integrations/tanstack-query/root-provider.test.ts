import { MutationObserver } from "@tanstack/react-query"
import { describe, expect, test, vi } from "vitest"
import { getContext } from "./root-provider"

describe("QueryClient do sisub", () => {
	test("mutation que falha (ex.: 503 de queda do banco) roda uma vez só, sem retry automático", async () => {
		const { queryClient } = getContext()
		const mutationFn = vi.fn(async () => {
			throw new Error("Serviço temporariamente indisponível. Tente novamente em instantes.")
		})

		const outcome = await new MutationObserver(queryClient, { mutationFn }).mutate().then(
			() => null,
			(e: Error) => e
		)

		expect(outcome?.message).toBe("Serviço temporariamente indisponível. Tente novamente em instantes.")
		expect(mutationFn).toHaveBeenCalledTimes(1)
		expect(queryClient.getDefaultOptions().mutations?.retry).toBe(0)
	})
})
