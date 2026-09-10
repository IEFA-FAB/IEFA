import { describe, expect, it } from "bun:test"
import { addDays, formatBrDate, todayBrLabel, todayInBrasilia } from "#/lib/brasilia"

describe("todayInBrasilia", () => {
	it("devolve ISO no fuso de Brasília, não em UTC", () => {
		// 01/10 às 00:30 UTC ainda é 30/09 às 21:30 em Brasília. É a janela em que
		// a competência do cronograma saltava um mês inteiro.
		expect(todayInBrasilia(new Date("2026-10-01T00:30:00Z"))).toBe("2026-09-30")
	})

	it("vira o dia às 03:00 UTC", () => {
		expect(todayInBrasilia(new Date("2026-10-01T02:59:59Z"))).toBe("2026-09-30")
		expect(todayInBrasilia(new Date("2026-10-01T03:00:00Z"))).toBe("2026-10-01")
	})

	it("não antecipa o dia no meio da tarde", () => {
		expect(todayInBrasilia(new Date("2026-09-10T18:00:00Z"))).toBe("2026-09-10")
	})
})

describe("addDays", () => {
	it("atravessa a virada de mês", () => {
		expect(addDays("2026-09-28", 7)).toBe("2026-10-05")
	})

	it("atravessa a virada de ano", () => {
		expect(addDays("2026-12-30", 3)).toBe("2027-01-02")
	})

	it("aceita deslocamento negativo", () => {
		expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
	})
})

describe("formatBrDate", () => {
	it("converte ISO em dd/mm/aaaa sem passar por Date", () => {
		expect(formatBrDate("2026-09-04")).toBe("04/09/2026")
	})

	it("devolve a entrada quando ela não é uma data ISO", () => {
		expect(formatBrDate("Mensal")).toBe("Mensal")
	})
})

describe("todayBrLabel", () => {
	it("carimba o aviso com a data de Brasília", () => {
		expect(todayBrLabel(new Date("2026-10-01T00:30:00Z"))).toBe("30/09/2026")
	})
})
