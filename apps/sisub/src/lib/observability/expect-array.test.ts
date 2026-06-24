import { beforeEach, describe, expect, test, vi } from "vitest"
import { expectArray } from "./expect-array"
import { reportError } from "./report-error"

// Faro é client-only; nos testes mockamos o reporter e asseguramos que a anomalia é logada.
vi.mock("./report-error", () => ({ reportError: vi.fn() }))

const reportErrorMock = vi.mocked(reportError)

describe("expectArray", () => {
	beforeEach(() => {
		reportErrorMock.mockClear()
	})

	test("devolve o mesmo array quando o payload já é array", () => {
		const arr = [{ id: 1 }, { id: 2 }]
		const out = expectArray<{ id: number }>(arr, { source: "x" })
		expect(out).toBe(arr)
		expect(reportErrorMock).not.toHaveBeenCalled()
	})

	test("array vazio passa direto e não loga", () => {
		const out = expectArray([], { source: "x" })
		expect(out).toEqual([])
		expect(reportErrorMock).not.toHaveBeenCalled()
	})

	// Caso real do bug: o client RPC resolveu a server fn com um objeto Response cru
	// (2xx + não-JSON em dev). Sem o guard, `.map`/`.find` quebraria a rota inteira.
	test("Response cru → devolve [] e loga a anomalia no Faro", () => {
		const res = new Response(null, { status: 403 })
		const out = expectArray(res, { source: "fetchKitchensFn", route: "kitchen/$kitchenId" })

		expect(out).toEqual([])
		expect(reportErrorMock).toHaveBeenCalledTimes(1)
		const [err, ctx] = reportErrorMock.mock.calls[0]
		expect(err).toBeInstanceOf(Error)
		expect(ctx).toMatchObject({
			source: "fetchKitchensFn",
			route: "kitchen/$kitchenId",
			anomaly: "non_array_serverfn_payload",
			receivedType: "Response(403)",
		})
	})

	test("objeto de erro do Nitro ({status,message}) → [] e log", () => {
		const out = expectArray({ status: 500, unhandled: true, message: "HTTPError" }, { source: "fetchUnitsFn" })
		expect(out).toEqual([])
		expect(reportErrorMock).toHaveBeenCalledTimes(1)
		expect(reportErrorMock.mock.calls[0][1]).toMatchObject({ receivedType: "Object", anomaly: "non_array_serverfn_payload" })
	})

	test("null → [] e log com receivedType=null", () => {
		const out = expectArray(null, { source: "x" })
		expect(out).toEqual([])
		expect(reportErrorMock.mock.calls[0][1]).toMatchObject({ receivedType: "null" })
	})

	test("undefined → [] e log", () => {
		const out = expectArray(undefined, { source: "x" })
		expect(out).toEqual([])
		expect(reportErrorMock).toHaveBeenCalledTimes(1)
		expect(reportErrorMock.mock.calls[0][1]).toMatchObject({ receivedType: "undefined" })
	})

	test("string → []", () => {
		const out = expectArray("Forbidden", { source: "x" })
		expect(out).toEqual([])
		expect(reportErrorMock.mock.calls[0][1]).toMatchObject({ receivedType: "string" })
	})
})
