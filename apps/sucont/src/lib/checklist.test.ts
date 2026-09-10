import { describe, expect, it } from "bun:test"
import { deadlineLabel, deadlineStatus } from "#/lib/checklist"

describe("deadlineLabel", () => {
	it("usa o indicador ordinal masculino, não o sinal de grau", () => {
		expect(deadlineLabel("monthly_business_day", 2)).toBe("2º dia útil do mês")
	})

	it("ignora o dia útil nas recorrências que não o usam", () => {
		expect(deadlineLabel("weekly", null)).toBe("1x por semana")
		expect(deadlineLabel("monthly", null)).toBe("Mensal")
	})

	it("cai no rótulo genérico quando o dia útil falta", () => {
		expect(deadlineLabel("monthly_business_day", null)).toBe("Nº dia útil do mês")
	})
})

describe("deadlineStatus", () => {
	const today = "2026-09-10"
	const upcomingUntil = "2026-09-17"

	it("feito vence qualquer outra classificação, inclusive prazo vencido", () => {
		expect(deadlineStatus("2026-09-04", "2026-09-03T12:00:00Z", today, upcomingUntil)).toBe("done")
	})

	it("separa vencido, hoje e próximo", () => {
		expect(deadlineStatus("2026-09-09", null, today, upcomingUntil)).toBe("overdue")
		expect(deadlineStatus("2026-09-10", null, today, upcomingUntil)).toBe("today")
		expect(deadlineStatus("2026-09-17", null, today, upcomingUntil)).toBe("upcoming")
	})

	it("prazo além da janela não é 'próximo' — senão o sino nunca esvazia", () => {
		expect(deadlineStatus("2026-09-18", null, today, upcomingUntil)).toBe("scheduled")
		expect(deadlineStatus("2026-09-30", null, today, upcomingUntil)).toBe("scheduled")
	})
})
