import { describe, expect, test } from "bun:test"
import { computeMaintenanceDue, type MaintenanceDueInput } from "./maintenance-due.ts"

const HOJE = "2026-08-27"

function due(over: Partial<MaintenanceDueInput> = {}) {
	return computeMaintenanceDue({ intervalDays: 30, today: HOJE, ...over })
}

describe("âncora", () => {
	test("execução registrada é a primeira âncora", () => {
		const r = due({ lastPerformedOn: "2026-08-20", installedOn: "2020-01-01", acquiredOn: "2019-01-01" })
		expect(r.anchor).toBe("log")
		expect(r.anchorDate).toBe("2026-08-20")
		expect(r.nextDueOn).toBe("2026-09-19")
		expect(r.state).toBe("ok")
	})

	test("sem execução, a instalação ancora", () => {
		const r = due({ installedOn: "2026-08-10", acquiredOn: "2019-01-01" })
		expect(r.anchor).toBe("installation")
		expect(r.anchorDate).toBe("2026-08-10")
		expect(r.nextDueOn).toBe("2026-09-09")
	})

	test("sem execução e sem instalação, a aquisição ancora", () => {
		const r = due({ acquiredOn: "2026-08-01" })
		expect(r.anchor).toBe("installation")
		expect(r.anchorDate).toBe("2026-08-01")
		expect(r.nextDueOn).toBe("2026-08-31")
	})
})

describe("sem âncora não há atraso", () => {
	test("parque recém-migrado não nasce vencido", () => {
		const r = due({ lastPerformedOn: null, installedOn: null, acquiredOn: null })
		expect(r.state).toBe("unknown")
		expect(r.anchor).toBeNull()
		expect(r.anchorDate).toBeNull()
		expect(r.nextDueOn).toBeNull()
		expect(r.daysPastDue).toBeNull()
		expect(r.withinTolerance).toBe(false)
	})

	test("campos ausentes equivalem a nulos", () => {
		expect(due().state).toBe("unknown")
	})

	test("string vazia não vira âncora — seria a época Unix como data de instalação", () => {
		expect(due({ lastPerformedOn: "", installedOn: "", acquiredOn: "" }).state).toBe("unknown")
	})

	test("unknown nunca é overdue, por mais antigo que seja o plano", () => {
		expect(due({ intervalDays: 1, today: "2099-12-31" }).state).toBe("unknown")
	})
})

describe("em dia × vencida", () => {
	test("antes do vencimento é em dia, com daysPastDue negativo", () => {
		const r = due({ lastPerformedOn: "2026-08-20" })
		expect(r.state).toBe("ok")
		expect(r.daysPastDue).toBe(-23)
		expect(r.withinTolerance).toBe(false)
	})

	test("vence hoje ainda é em dia", () => {
		const r = due({ lastPerformedOn: "2026-07-28" })
		expect(r.nextDueOn).toBe(HOJE)
		expect(r.daysPastDue).toBe(0)
		expect(r.state).toBe("ok")
		expect(r.withinTolerance).toBe(false)
	})

	test("passou do vencimento sem tolerância é vencida no dia seguinte", () => {
		const r = due({ lastPerformedOn: "2026-07-27" })
		expect(r.daysPastDue).toBe(1)
		expect(r.state).toBe("overdue")
	})

	test("vencida reporta os dias de atraso", () => {
		const r = due({ lastPerformedOn: "2026-06-01" })
		expect(r.nextDueOn).toBe("2026-07-01")
		expect(r.daysPastDue).toBe(57)
		expect(r.state).toBe("overdue")
	})
})

describe("tolerância", () => {
	test("3 dias de atraso com tolerância 5 continua em dia", () => {
		const r = due({ lastPerformedOn: "2026-07-25", toleranceDays: 5 })
		expect(r.daysPastDue).toBe(3)
		expect(r.state).toBe("ok")
		expect(r.withinTolerance).toBe(true)
	})

	test("atraso igual à tolerância ainda é em dia", () => {
		const r = due({ lastPerformedOn: "2026-07-23", toleranceDays: 5 })
		expect(r.daysPastDue).toBe(5)
		expect(r.state).toBe("ok")
		expect(r.withinTolerance).toBe(true)
	})

	test("um dia além da tolerância vence", () => {
		const r = due({ lastPerformedOn: "2026-07-22", toleranceDays: 5 })
		expect(r.daysPastDue).toBe(6)
		expect(r.state).toBe("overdue")
		expect(r.withinTolerance).toBe(false)
	})

	test("withinTolerance é falso antes do vencimento", () => {
		expect(due({ lastPerformedOn: "2026-08-25", toleranceDays: 5 }).withinTolerance).toBe(false)
	})
})

describe("aritmética de data", () => {
	test("atravessa a virada do ano", () => {
		const r = computeMaintenanceDue({ intervalDays: 30, lastPerformedOn: "2025-12-20", today: "2026-01-25" })
		expect(r.nextDueOn).toBe("2026-01-19")
		expect(r.daysPastDue).toBe(6)
	})

	test("respeita ano bissexto", () => {
		const r = computeMaintenanceDue({ intervalDays: 1, lastPerformedOn: "2028-02-28", today: "2028-02-29" })
		expect(r.nextDueOn).toBe("2028-02-29")
		expect(r.daysPastDue).toBe(0)
	})

	test("intervalo longo não perde dia por horário de verão", () => {
		const r = computeMaintenanceDue({ intervalDays: 365, lastPerformedOn: "2025-10-15", today: "2026-10-15" })
		expect(r.nextDueOn).toBe("2026-10-15")
		expect(r.daysPastDue).toBe(0)
		expect(r.state).toBe("ok")
	})
})

describe("entrada inválida", () => {
	test("intervalo zero ou negativo lança", () => {
		expect(() => due({ intervalDays: 0 })).toThrow(RangeError)
		expect(() => due({ intervalDays: -1 })).toThrow(RangeError)
	})

	test("intervalo fracionário lança", () => {
		expect(() => due({ intervalDays: 1.5 })).toThrow(RangeError)
	})

	test("tolerância negativa lança", () => {
		expect(() => due({ toleranceDays: -1 })).toThrow(RangeError)
	})

	test("data fora do formato ISO lança em vez de virar NaN", () => {
		expect(() => due({ lastPerformedOn: "27/08/2026" })).toThrow(RangeError)
		expect(() => due({ lastPerformedOn: "2026-08-20", today: "hoje" })).toThrow(RangeError)
	})
})
