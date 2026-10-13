import { describe, expect, test } from "vitest"
import { buildScopeParams, deriveCountState, hasScopeValue, scopeValueLabel } from "./counts-page"

type Line = { ingredientId: string | null; ownRound: boolean; needsRecount: boolean | null }
const line = (patch: Partial<Line>): Line => ({ ingredientId: "a", ownRound: true, needsRecount: false, ...patch })

describe("deriveCountState", () => {
	test("sem folha: nada aberto, nada a recontar", () => {
		expect(deriveCountState<Line>(null, { ingredientId: "a", lotId: null, description: "x" })).toEqual({
			open: false,
			scannedInScope: false,
			inReview: false,
			divergent: [],
		})
	})

	test("coleta: alvo lido dentro e fora do escopo", () => {
		const sheet = { count: { status: "counting" }, lines: [line({ ingredientId: "a" })] }
		expect(deriveCountState(sheet, { ingredientId: "a", lotId: null, description: "x" })).toMatchObject({ open: true, inReview: false, scannedInScope: true })
		expect(deriveCountState(sheet, { ingredientId: "b", lotId: null, description: "x" }).scannedInScope).toBe(false)
		expect(deriveCountState(sheet, null).scannedInScope).toBe(false)
	})

	test("revisão: só linhas desta rodada com recontagem pedida", () => {
		const recount = line({ needsRecount: true })
		const sheet = {
			count: { status: "review" },
			lines: [recount, line({ ownRound: false, needsRecount: true }), line({ needsRecount: null }), line({ needsRecount: false })],
		}
		const state = deriveCountState(sheet, null)
		expect(state.inReview).toBe(true)
		expect(state.open).toBe(false)
		expect(state.divergent).toEqual([recount])
	})
})

describe("escopo", () => {
	test("rótulo do valor", () => {
		expect(scopeValueLabel("menu_cycle")).toBe("Dias do ciclo")
		expect(scopeValueLabel("location")).toBe("Local")
		expect(scopeValueLabel("conservation_class")).toBe("Classe")
	})

	test("quais escopos pedem valor", () => {
		expect(hasScopeValue("full")).toBe(false)
		expect(hasScopeValue("item_list")).toBe(false)
		expect(hasScopeValue("menu_cycle")).toBe(true)
		expect(hasScopeValue("location")).toBe(true)
		expect(hasScopeValue("conservation_class")).toBe(true)
	})

	test("parâmetros da abertura", () => {
		expect(buildScopeParams("full", "x")).toEqual({})
		expect(buildScopeParams("item_list", "x")).toEqual({})
		expect(buildScopeParams("menu_cycle", "14")).toEqual({ days: 14 })
		expect(buildScopeParams("menu_cycle", "")).toEqual({ days: 7 })
		expect(buildScopeParams("menu_cycle", "abc")).toEqual({ days: 7 })
		expect(buildScopeParams("location", "Câmara 1")).toEqual({ location: "Câmara 1" })
		expect(buildScopeParams("conservation_class", "congelado")).toEqual({ conservation_class: "congelado" })
	})
})
