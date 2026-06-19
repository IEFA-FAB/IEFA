/**
 * Regressão — operations de DASHBOARD (@iefa/sisub-domain).
 * São fetch HTTP puros (sem DB) → NÃO entram na migração Drizzle, mas congelamos o
 * contrato: montagem de URL/query params + filtro de datas client-side. fetch é mockado.
 */

import { fetchForecasts, fetchMessHalls, fetchPresences, fetchUnits, fetchUserData, fetchUserMilitaryData } from "@iefa/sisub-domain"
import { afterEach, expect, test, vi } from "vitest"

const BASE = "https://api.example.test"

function mockFetchOnce(payload: unknown, ok = true, status = 200, statusText = "OK") {
	const fn = vi.fn(async (_url: string) => ({ ok, status, statusText, json: async () => payload }) as unknown as Response)
	vi.stubGlobal("fetch", fn)
	return fn
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

test("fetchForecasts seta mess_hall_id e filtra por intervalo de datas (client-side)", async () => {
	const records = [
		{ date: "2099-01-01", mess_hall_id: 1 },
		{ date: "2099-01-15", mess_hall_id: 1 },
		{ date: "2099-02-01", mess_hall_id: 1 },
	]
	const fetchMock = mockFetchOnce(records)

	const result = await fetchForecasts(BASE, { mess_hall_id: 7, startDate: "2099-01-10", endDate: "2099-01-31" })

	const calledUrl = new URL(fetchMock.mock.calls[0][0] as string)
	expect(calledUrl.pathname).toBe("/api/rancho_previsoes")
	expect(calledUrl.searchParams.get("mess_hall_id")).toBe("7")
	expect(result.map((r) => r.date)).toEqual(["2099-01-15"]) // só o que está no intervalo
})

test("fetchForecasts sem datas retorna tudo (sem filtro)", async () => {
	const records = [{ date: "2099-01-01" }, { date: "2099-03-01" }]
	mockFetchOnce(records)
	const result = await fetchForecasts(BASE, {})
	expect(result).toHaveLength(2)
})

test("fetchPresences monta /api/wherewhowhen e filtra datas", async () => {
	const records = [
		{ date: "2099-05-01", user_id: "a" },
		{ date: "2099-05-20", user_id: "b" },
	]
	const fetchMock = mockFetchOnce(records)
	const result = await fetchPresences(BASE, { startDate: "2099-05-10" })
	expect(new URL(fetchMock.mock.calls[0][0] as string).pathname).toBe("/api/wherewhowhen")
	expect(result.map((r) => r.user_id)).toEqual(["b"])
})

test("fetchMessHalls monta URL com unit_id", async () => {
	const mh = mockFetchOnce([])
	await fetchMessHalls(BASE, 3)
	expect(new URL(mh.mock.calls[0][0] as string).searchParams.get("unit_id")).toBe("3")
})

test("fetchUnits monta /api/units", async () => {
	const units = mockFetchOnce([])
	await fetchUnits(BASE)
	expect(new URL(units.mock.calls[0][0] as string).pathname).toBe("/api/units")
})

test("fetchUserData monta id como CSV", async () => {
	const ud = mockFetchOnce([])
	await fetchUserData(BASE, ["id1", "id2"])
	expect(new URL(ud.mock.calls[0][0] as string).searchParams.get("id")).toBe("id1,id2")
})

test("fetchUserMilitaryData monta nrOrdem como CSV", async () => {
	const umd = mockFetchOnce([])
	await fetchUserMilitaryData(BASE, ["100", "200"])
	expect(new URL(umd.mock.calls[0][0] as string).searchParams.get("nrOrdem")).toBe("100,200")
})

test("get() lança com [status] path: statusText em resposta não-ok", async () => {
	mockFetchOnce(null, false, 503, "Service Unavailable")
	await expect(fetchUnits(BASE)).rejects.toThrow("[503] /api/units: Service Unavailable")
})
