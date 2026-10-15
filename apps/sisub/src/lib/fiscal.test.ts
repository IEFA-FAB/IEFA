import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
	classifyInsertOutcome,
	createScanCache,
	describePresenceElsewhere,
	generateRestrictedDates,
	inferDefaultMeal,
	isPresenceRecorded,
	MEAL_LABEL,
	openScanDialogDefaults,
	SCAN_SNOOZE_MS,
	type ScanScope,
	settleClosedScan,
	toScanDialogOutcome,
} from "./fiscal"

describe("MEAL_LABEL", () => {
	test("cobre as quatro refeições com rótulos pt-BR", () => {
		expect(MEAL_LABEL).toEqual({ cafe: "Café", almoco: "Almoço", janta: "Jantar", ceia: "Ceia" })
	})
})

describe("inferDefaultMeal", () => {
	const at = (h: number, m = 0) => new Date(2026, 6, 6, h, m)

	test("café entre 04:00 e 08:59", () => {
		expect(inferDefaultMeal(at(4, 0))).toBe("cafe")
		expect(inferDefaultMeal(at(8, 59))).toBe("cafe")
	})

	test("almoço entre 09:00 e 14:59", () => {
		expect(inferDefaultMeal(at(9, 0))).toBe("almoco")
		expect(inferDefaultMeal(at(14, 59))).toBe("almoco")
	})

	test("jantar entre 15:00 e 19:59", () => {
		expect(inferDefaultMeal(at(15, 0))).toBe("janta")
		expect(inferDefaultMeal(at(19, 59))).toBe("janta")
	})

	test("ceia da noite à madrugada (fora das demais faixas)", () => {
		expect(inferDefaultMeal(at(20, 0))).toBe("ceia")
		expect(inferDefaultMeal(at(0, 0))).toBe("ceia")
		expect(inferDefaultMeal(at(3, 59))).toBe("ceia")
	})
})

describe("generateRestrictedDates", () => {
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => vi.useRealTimers())

	const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

	test("devolve ontem, hoje e amanhã na DATA LOCAL (sem vazar por fuso)", () => {
		// Instante às 23:30 locais de 06/07: em fuso negativo (BRT) já é 07/07 em UTC.
		// Se a fonte usasse toISOString (UTC), o slot 'hoje' viraria 07/07 — o que
		// quebraria a data padrão da fiscalização durante o jantar/ceia.
		vi.setSystemTime(new Date(2026, 6, 6, 23, 30))
		const dates = generateRestrictedDates()

		expect(dates).toEqual([localIso(new Date(2026, 6, 5)), localIso(new Date(2026, 6, 6)), localIso(new Date(2026, 6, 7))])
		expect(dates[1]).toBe("2026-07-06") // 'hoje' local, não o dia seguinte em UTC
	})

	test("mantém o formato yyyy-mm-dd e três dias consecutivos", () => {
		vi.setSystemTime(new Date(2026, 0, 1, 8, 0))
		const dates = generateRestrictedDates()
		expect(dates).toHaveLength(3)
		for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
		// vira a virada de ano corretamente (31/12 → 01/01 → 02/01)
		expect(dates).toEqual(["2025-12-31", "2026-01-01", "2026-01-02"])
	})
})

describe("isPresenceRecorded", () => {
	test("gravada agora ou antes entra no cache; 'não entra' não", () => {
		expect(isPresenceRecorded("inserted")).toBe(true)
		expect(isPresenceRecorded("duplicate")).toBe(true)
		expect(isPresenceRecorded("skipped")).toBe(false)
		// Presença em outro refeitório: não há linha aqui para excluir, então não prende o crachá.
		expect(isPresenceRecorded("elsewhere")).toBe(false)
	})
})

describe("classifyInsertOutcome", () => {
	test("duplicidade só é 'já registrado aqui' quando o refeitório bate", () => {
		expect(classifyInsertOutcome({ status: "inserted" }, 7)).toBe("inserted")
		expect(classifyInsertOutcome({ status: "duplicate", messHallId: 7, messHallName: "Refeitório B" }, 7)).toBe("duplicate")
		expect(classifyInsertOutcome({ status: "duplicate", messHallId: 3, messHallName: "Refeitório A" }, 7)).toBe("elsewhere")
		// Não deu para ler onde: não afirma que é daqui.
		expect(classifyInsertOutcome({ status: "duplicate", messHallId: null, messHallName: null }, 7)).toBe("elsewhere")
	})

	test("a frase diz onde, quando sabe", () => {
		expect(describePresenceElsewhere("Refeitório A")).toContain("em Refeitório A")
		expect(describePresenceElsewhere(null)).toContain("em outro refeitório")
	})
})

describe("recusa e cancelamento no scanner", () => {
	const UUID = "11111111-2222-3333-4444-555555555555"
	const lunch: ScanScope = { date: "2026-07-06", meal: "almoco", messHallId: 7 }
	const dinner: ScanScope = { ...lunch, meal: "janta" }

	test("'não entra': depois da pausa o crachá reabre com 'Não' e exige toque", () => {
		const cache = createScanCache()
		expect(openScanDialogDefaults(cache, lunch, UUID)).toEqual({ willEnter: "sim", manual: false })
		settleClosedScan(cache, lunch, UUID, "refused", 0)
		expect(cache.has(lunch, UUID, SCAN_SNOOZE_MS - 1)).toBe(true)
		expect(cache.has(lunch, UUID, SCAN_SNOOZE_MS)).toBe(false)
		expect(openScanDialogDefaults(cache, lunch, UUID)).toEqual({ willEnter: "nao", manual: true })
		// Por refeição: no jantar ele volta ao normal.
		expect(openScanDialogDefaults(cache, dinner, UUID)).toEqual({ willEnter: "sim", manual: false })
	})

	test("Cancelar/Esc também fica lembrado; falha ao gravar só pausa", () => {
		const cache = createScanCache()
		settleClosedScan(cache, lunch, "cancelado", null, 0)
		settleClosedScan(cache, lunch, "falhou", "unsaved", 0)
		expect(openScanDialogDefaults(cache, lunch, "cancelado").manual).toBe(true)
		expect(openScanDialogDefaults(cache, lunch, "falhou").manual).toBe(false)
		expect(cache.has(lunch, "falhou", SCAN_SNOOZE_MS)).toBe(false)
	})

	test("presença em outro refeitório conta como recusa: releitura com 'Não' e sem fechar sozinho", () => {
		expect(toScanDialogOutcome("inserted")).toBe("recorded")
		expect(toScanDialogOutcome("duplicate")).toBe("recorded")
		expect(toScanDialogOutcome("skipped")).toBe("refused")
		expect(toScanDialogOutcome("elsewhere")).toBe("refused")

		const cache = createScanCache()
		settleClosedScan(cache, lunch, UUID, toScanDialogOutcome("elsewhere"), 0)
		// Não fica preso no cache (não há linha aqui para excluir): depois da pausa é lido de novo...
		expect(cache.has(lunch, UUID, SCAN_SNOOZE_MS)).toBe(false)
		// ...mas pedindo toque, para não tentar gravar a cada leitura do crachá parado.
		expect(openScanDialogDefaults(cache, lunch, UUID)).toEqual({ willEnter: "nao", manual: true })
	})

	test("gravar depois da recusa desfaz a recusa e prende o crachá", () => {
		const cache = createScanCache()
		settleClosedScan(cache, lunch, UUID, "refused", 0)
		cache.mark(lunch, UUID)
		settleClosedScan(cache, lunch, UUID, "recorded", 0)
		expect(cache.isDenied(lunch, UUID)).toBe(false)
		expect(cache.has(lunch, UUID, SCAN_SNOOZE_MS * 10)).toBe(true)
	})
})

describe("createScanCache", () => {
	const UUID = "11111111-2222-3333-4444-555555555555"
	const lunch: ScanScope = { date: "2026-07-06", meal: "almoco", messHallId: 7 }
	const dinner: ScanScope = { ...lunch, meal: "janta" }

	test("leitura marcada no almoço não bloqueia o mesmo militar no jantar", () => {
		const cache = createScanCache()
		cache.mark(lunch, UUID)
		expect(cache.has(lunch, UUID)).toBe(true)
		expect(cache.has(dinner, UUID)).toBe(false)
	})

	test("a chave também separa data e refeitório", () => {
		const cache = createScanCache()
		cache.mark(lunch, UUID)
		expect(cache.has({ ...lunch, date: "2026-07-07" }, UUID)).toBe(false)
		expect(cache.has({ ...lunch, messHallId: 8 }, UUID)).toBe(false)
	})

	test("presença excluída libera nova leitura só naquela refeição", () => {
		const cache = createScanCache()
		cache.mark(lunch, UUID)
		cache.mark(dinner, UUID)
		cache.forget(lunch, UUID)
		expect(cache.has(lunch, UUID)).toBe(false)
		expect(cache.has(dinner, UUID)).toBe(true)
	})

	test("diálogo fechado sem gravar só pausa o crachá; depois ele é lido de novo", () => {
		const cache = createScanCache()
		cache.snooze(lunch, UUID, SCAN_SNOOZE_MS, 1_000)
		expect(cache.has(lunch, UUID, 1_000 + SCAN_SNOOZE_MS - 1)).toBe(true)
		expect(cache.has(dinner, UUID, 1_001)).toBe(false)
		expect(cache.has(lunch, UUID, 1_000 + SCAN_SNOOZE_MS)).toBe(false)
	})

	test("gravar depois da pausa fixa o crachá; excluir tira pausa e marca", () => {
		const cache = createScanCache()
		cache.snooze(lunch, UUID, SCAN_SNOOZE_MS, 0)
		cache.mark(lunch, UUID)
		expect(cache.has(lunch, UUID, SCAN_SNOOZE_MS * 10)).toBe(true)
		cache.snooze(lunch, UUID, SCAN_SNOOZE_MS, 0)
		cache.forget(lunch, UUID)
		expect(cache.has(lunch, UUID, 1)).toBe(false)
	})

	test("despeja o mais antigo ao passar do limite", () => {
		const cache = createScanCache(2)
		cache.mark(lunch, "a")
		cache.mark(lunch, "b")
		cache.mark(lunch, "a") // repetida não renova nem duplica
		cache.mark(lunch, "c")
		expect(cache.has(lunch, "a")).toBe(false)
		expect(cache.has(lunch, "b")).toBe(true)
		expect(cache.has(lunch, "c")).toBe(true)
	})
})
