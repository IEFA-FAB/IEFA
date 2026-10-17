import { describe, expect, test } from "vitest"
import {
	buildScopeParams,
	claimEntryKey,
	clearSettledQuantities,
	deriveCountState,
	describePostedEntry,
	describeSettledEntries,
	type EntryIntentKeys,
	getScanLineKey,
	getScopeValueLabel,
	hasScopeValue,
	parseCountQuantity,
	releaseEntryKey,
	settleRecordedEntryKeys,
} from "./counts-page"

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

	test("dois envios da mesma linha levam a MESMA chave (o índice único deduplica)", () => {
		const keys: EntryIntentKeys = new Map()
		const next = sequence()
		expect(claimEntryKey(keys, "lot-1", 15, next)).toBe(claimEntryKey(keys, "lot-1", 15, next))
	})

	test("valor corrigido antes da confirmação reaproveita a chave pendente (o servidor corrige, não soma)", () => {
		// A tentativa com 15 pode ter sido gravada com a resposta perdida: chave nova para o 16
		// deixaria os dois lançamentos.
		const keys: EntryIntentKeys = new Map()
		const next = sequence()
		const sent = claimEntryKey(keys, "lot-1", 15, next)
		expect(claimEntryKey(keys, "lot-1", 16, next)).toBe(sent)
		// as tentativas divergiram: não se sabe mais qual valor o banco guardou
		expect(keys.get("lot-1")).toEqual({ clientEventId: sent, quantity: null })
	})

	test("depois do sucesso, o próximo lançamento da linha ganha chave nova", () => {
		const keys: EntryIntentKeys = new Map()
		const next = sequence()
		const first = claimEntryKey(keys, "lot-1", 15, next)
		releaseEntryKey(keys, "lot-1", first)
		expect(claimEntryKey(keys, "lot-1", 10, next)).not.toBe(first)
	})

	test("linhas diferentes não dividem chave", () => {
		const keys: EntryIntentKeys = new Map()
		const next = sequence()
		expect(claimEntryKey(keys, "lot-1", 1, next)).not.toBe(claimEntryKey(keys, "lot-2", 1, next))
	})

	test("liberar uma chave antiga não apaga a intenção renovada", () => {
		const keys: EntryIntentKeys = new Map()
		const next = sequence()
		const old = claimEntryKey(keys, "lot-1", 1, next)
		releaseEntryKey(keys, "lot-1", old)
		const renewed = claimEntryKey(keys, "lot-1", 2, next)
		releaseEntryKey(keys, "lot-1", old)
		expect(claimEntryKey(keys, "lot-1", 2, next)).toBe(renewed)
	})

	test("a chave padrão cabe no validador do servidor (8 a 64 caracteres)", () => {
		const key = claimEntryKey(new Map(), "lot-1", 1)
		expect(key.length).toBeGreaterThanOrEqual(8)
		expect(key.length).toBeLessThanOrEqual(64)
	})
})

describe("settleRecordedEntryKeys", () => {
	const sequence = () => {
		let n = 0
		return () => `event-${++n}`
	}

	test("folha relida já mostra o lançamento: a chave se libera e o próximo envio é lançamento NOVO", () => {
		// 15 gravou e a resposta caiu; a folha relida mostra a linha com 15. O 10 digitado depois
		// (outra prateleira) ia com a chave antiga e o servidor corrigia a linha para 10 em vez de 25.
		const keys: EntryIntentKeys = new Map()
		const next = sequence()
		const lost = claimEntryKey(keys, "lot-1", 15, next)
		expect(settleRecordedEntryKeys(keys, [lost, "de-outra-linha"])).toEqual([{ lineKey: "lot-1", quantity: 15 }])
		expect(claimEntryKey(keys, "lot-1", 10, next)).not.toBe(lost)
	})

	test("folha sem a chave: a intenção continua pendente (o envio não entrou, ou ainda está gravando)", () => {
		const keys: EntryIntentKeys = new Map()
		const next = sequence()
		const pending = claimEntryKey(keys, "lot-1", 15, next)
		expect(settleRecordedEntryKeys(keys, ["event-99"])).toEqual([])
		expect(claimEntryKey(keys, "lot-1", 16, next)).toBe(pending)
	})

	test("scanner: Cancelar + nova leitura do mesmo alvo não reaproveita a chave já gravada", () => {
		const keys: EntryIntentKeys = new Map()
		const next = sequence()
		const lineKey = getScanLineKey({ ingredientId: "ing-1", lotId: null })
		expect(lineKey).toBe("scan:ing-1:item")
		const lost = claimEntryKey(keys, lineKey, 4, next)
		settleRecordedEntryKeys(keys, new Set([lost]))
		expect(claimEntryKey(keys, lineKey, 4, next)).not.toBe(lost)
	})
})

describe("clearSettledQuantities", () => {
	test("limpa o campo que ainda mostra o valor gravado (lançar de novo somaria o mesmo número)", () => {
		const before = { "lot-1": "15", "lot-2": "3" }
		expect(clearSettledQuantities(before, [{ lineKey: "lot-1", quantity: 15 }])).toEqual({ "lot-1": "", "lot-2": "3" })
		expect(clearSettledQuantities({ "lot-1": "1,5" }, [{ lineKey: "lot-1", quantity: 1.5 }])).toEqual({ "lot-1": "" })
	})

	test("o que o operador já trocou fica; nada a limpar devolve o mesmo objeto", () => {
		const before = { "lot-1": "10" }
		expect(clearSettledQuantities(before, [{ lineKey: "lot-1", quantity: 15 }])).toBe(before)
		expect(clearSettledQuantities(before, [{ lineKey: "lot-9", quantity: 15 }])).toBe(before)
	})
})

describe("parseCountQuantity", () => {
	test("vírgula decimal, zero e recusa do vazio, negativo e texto", () => {
		expect(parseCountQuantity("1,25")).toBe(1.25)
		expect(parseCountQuantity("0")).toBe(0)
		expect(parseCountQuantity("")).toBeNull()
		expect(parseCountQuantity("  ")).toBeNull()
		expect(parseCountQuantity("-1")).toBeNull()
		expect(parseCountQuantity("abc")).toBeNull()
	})
})

describe("mensagens do lançamento", () => {
	test("envio que corrigiu uma tentativa gravada diz isso, em vez de corrigir em silêncio", () => {
		expect(describePostedEntry({ corrected: 1 }, 10)).toBe("O envio anterior desta linha tinha sido gravado; o lançamento foi corrigido para 10")
		expect(describePostedEntry({ corrected: 0 }, 10)).toBe("Lançamento registrado")
	})

	test("lançamentos que a folha mostrou gravados", () => {
		expect(describeSettledEntries([{ lineKey: "lot-1", quantity: 1.2346 }])).toBe(
			"O lançamento de 1,2346 já estava gravado (a resposta tinha se perdido) e aparece na folha. Um novo lançamento da linha soma."
		)
		expect(
			describeSettledEntries([
				{ lineKey: "a", quantity: 1 },
				{ lineKey: "b", quantity: 2 },
			])
		).toContain("2 lançamentos anteriores já estavam gravados")
	})

	test("tentativas com valores diferentes: o aviso não anuncia número que não se conferiu", () => {
		expect(describeSettledEntries([{ lineKey: "lot-1", quantity: null }])).toBe(
			"O lançamento anterior desta linha já estava gravado (a resposta tinha se perdido). Confira a linha na folha antes de lançar de novo: um novo lançamento soma."
		)
	})
})

describe("15 grava, a resposta se perde, o operador corrige para 16 e o reenvio morre", () => {
	test("a folha mostra a chave: aviso sem número, e o 16 digitado fica no campo para o operador decidir", () => {
		const keys: EntryIntentKeys = new Map()
		const key = claimEntryKey(keys, "lot-1", 15, () => "event-1")
		expect(claimEntryKey(keys, "lot-1", 16, () => "event-2")).toBe(key)
		const settled = settleRecordedEntryKeys(keys, [key])
		expect(settled).toEqual([{ lineKey: "lot-1", quantity: null }])
		expect(describeSettledEntries(settled)).not.toMatch(/1[56]/)
		const typed = { "lot-1": "16" }
		expect(clearSettledQuantities(typed, settled)).toBe(typed)
	})

	test("reenvio com o MESMO valor: o número é o que entrou, e o campo limpa", () => {
		const keys: EntryIntentKeys = new Map()
		const key = claimEntryKey(keys, "lot-1", 15, () => "event-1")
		claimEntryKey(keys, "lot-1", 15, () => "event-2")
		const settled = settleRecordedEntryKeys(keys, [key])
		expect(settled).toEqual([{ lineKey: "lot-1", quantity: 15 }])
		expect(clearSettledQuantities({ "lot-1": "15" }, settled)).toEqual({ "lot-1": "" })
	})
})
