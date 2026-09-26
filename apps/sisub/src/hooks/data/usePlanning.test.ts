import { describe, expect, test, vi } from "vitest"

vi.mock("@/server/planning.fn", () => ({ fetchDayDetailsFn: vi.fn(), fetchDailyMenusFn: vi.fn() }))
vi.mock("@/server/templates.fn", () => ({ fetchMenuTemplatesFn: vi.fn() }))
vi.mock("@/components/ui/toast", () => ({ toast: {} }))

const { dayDetailsQueryOptions } = await import("./usePlanning")

describe("dayDetailsQueryOptions", () => {
	// O painel do dia fica montado com o calendário. Chave que muda a cada render (era o
	// `toISOString()` de um `new Date()` de fallback) fazia a busca rodar em laço na produção.
	test("a chave é a data civil: duas montagens do mesmo dia dão a mesma chave", () => {
		const a = dayDetailsQueryOptions(920, "2026-09-26")
		const b = dayDetailsQueryOptions(920, "2026-09-26")
		expect(a.queryKey).toEqual(b.queryKey)
		expect(a.queryKey).toEqual(["planning", "day", 920, "2026-09-26"])
		expect(a.enabled).toBe(true)
	})

	test("sem dia escolhido não busca", () => {
		expect(dayDetailsQueryOptions(920, null).enabled).toBe(false)
	})

	test("sem cozinha não busca", () => {
		expect(dayDetailsQueryOptions(null, "2026-09-26").enabled).toBe(false)
	})
})
