import { describe, expect, test } from "vitest"
import { buildScopeParams, claimEntryKey, deriveCountState, type EntryIntentKeys, getScopeValueLabel, hasScopeValue, releaseEntryKey } from "./counts-page"

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
		expect(getScopeValueLabel("menu_cycle")).toBe("Dias do ciclo")
		expect(getScopeValueLabel("location")).toBe("Local")
		expect(getScopeValueLabel("conservation_class")).toBe("Classe")
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

describe("claimEntryKey / releaseEntryKey", () => {
	const sequence = () => {
		let n = 0
		return () => `event-${++n}`
	}

	test("dois envios da mesma linha com o mesmo valor levam a MESMA chave (o índice único deduplica)", () => {
		const keys: EntryIntentKeys = new Map()
		const next = sequence()
		const first = claimEntryKey(keys, "lot-1", 15, next)
		const second = claimEntryKey(keys, "lot-1", 15, next)
		expect(second).toBe(first)
	})

	test("reenvio depois de falha (chave não liberada) repete a chave", () => {
		const keys: EntryIntentKeys = new Map()
		const next = sequence()
		const sent = claimEntryKey(keys, "lot-1", 15, next)
		// a resposta falhou: nada de release
		expect(claimEntryKey(keys, "lot-1", 15, next)).toBe(sent)
	})

	test("valor corrigido antes de reenviar é outra intenção: chave nova", () => {
		const keys: EntryIntentKeys = new Map()
		const next = sequence()
		const first = claimEntryKey(keys, "lot-1", 15, next)
		expect(claimEntryKey(keys, "lot-1", 16, next)).not.toBe(first)
	})

	test("depois do sucesso, o próximo lançamento da linha ganha chave nova", () => {
		const keys: EntryIntentKeys = new Map()
		const next = sequence()
		const first = claimEntryKey(keys, "lot-1", 15, next)
		releaseEntryKey(keys, "lot-1", first)
		expect(claimEntryKey(keys, "lot-1", 15, next)).not.toBe(first)
	})

	test("linhas diferentes não dividem chave", () => {
		const keys: EntryIntentKeys = new Map()
		const next = sequence()
		expect(claimEntryKey(keys, "lot-1", 15, next)).not.toBe(claimEntryKey(keys, "lot-2", 15, next))
	})

	test("liberar uma chave antiga não apaga a intenção renovada", () => {
		const keys: EntryIntentKeys = new Map()
		const next = sequence()
		const old = claimEntryKey(keys, "lot-1", 15, next)
		const renewed = claimEntryKey(keys, "lot-1", 16, next)
		releaseEntryKey(keys, "lot-1", old)
		expect(claimEntryKey(keys, "lot-1", 16, next)).toBe(renewed)
	})

	test("a chave padrão cabe no validador do servidor (8 a 64 caracteres)", () => {
		const key = claimEntryKey(new Map(), "lot-1", 15)
		expect(key.length).toBeGreaterThanOrEqual(8)
		expect(key.length).toBeLessThanOrEqual(64)
	})
})
