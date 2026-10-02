import { describe, expect, it } from "bun:test"
import {
	addCivilDays,
	addCivilMonths,
	getBrasiliaCurrentMonth,
	getBrasiliaToday,
	getBrasiliaYear,
	getCivilMonthBounds,
	toBrasiliaCivilDate,
} from "./civil-date.ts"

describe("getBrasiliaToday", () => {
	it("entre 21h e a meia-noite de Brasília ainda é o dia de Brasília, não o de UTC", () => {
		// 22h30 de 30/09 em Brasília = 01h30 de 01/10 em UTC.
		expect(getBrasiliaToday(new Date("2026-10-01T01:30:00Z"))).toBe("2026-09-30")
	})

	it("depois da meia-noite de Brasília vira o dia", () => {
		expect(getBrasiliaToday(new Date("2026-10-01T03:00:00Z"))).toBe("2026-10-01")
	})

	it("exercício acompanha o dia civil na virada do ano", () => {
		expect(getBrasiliaYear(new Date("2027-01-01T02:59:00Z"))).toBe(2026)
	})

	it("competência acompanha o dia civil na virada do mês", () => {
		expect(getBrasiliaCurrentMonth(new Date("2026-10-01T02:59:00Z"))).toBe("2026-09")
	})
})

describe("toBrasiliaCivilDate", () => {
	it("data civil volta como veio", () => {
		expect(toBrasiliaCivilDate("2026-12-31")).toBe("2026-12-31")
	})

	it("instante UTC da noite cai no dia de Brasília", () => {
		expect(toBrasiliaCivilDate("2027-01-01T02:59:00+00:00")).toBe("2026-12-31")
	})

	it("instante ilegível devolve null", () => {
		expect(toBrasiliaCivilDate("ontem")).toBeNull()
	})
})

describe("aritmética de data civil", () => {
	it("soma e subtrai dias atravessando mês e ano", () => {
		expect(addCivilDays("2026-12-31", 1)).toBe("2027-01-01")
		expect(addCivilDays("2026-03-01", -1)).toBe("2026-02-28")
	})

	it("soma meses com a rolagem do Date", () => {
		expect(addCivilMonths("2026-01-15", -3)).toBe("2025-10-15")
		expect(addCivilMonths("2026-03-31", -1)).toBe("2026-03-03")
	})

	it("limites do mês", () => {
		expect(getCivilMonthBounds("2028-02-10")).toEqual({ start: "2028-02-01", end: "2028-02-29" })
		expect(getCivilMonthBounds("2026-12-31")).toEqual({ start: "2026-12-01", end: "2026-12-31" })
	})
})
