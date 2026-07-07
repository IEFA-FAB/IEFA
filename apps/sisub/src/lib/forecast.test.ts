import { describe, expect, test } from "vitest"
import { isWeekday, labelAlteracao, labelCard, labelDiaUtil, pluralize } from "./forecast"

describe("pluralize", () => {
	test("usa singular apenas quando a contagem é exatamente 1", () => {
		expect(pluralize(1, "item", "itens")).toBe("item")
		expect(pluralize(0, "item", "itens")).toBe("itens")
		expect(pluralize(2, "item", "itens")).toBe("itens")
	})

	test("rótulos pt-BR concordam com a contagem", () => {
		expect(labelAlteracao(1)).toBe("alteração")
		expect(labelAlteracao(3)).toBe("alterações")
		expect(labelCard(1)).toBe("card")
		expect(labelCard(0)).toBe("cards")
		expect(labelDiaUtil(1)).toBe("dia útil")
		expect(labelDiaUtil(5)).toBe("dias úteis")
	})
})

describe("isWeekday", () => {
	test("segunda a sexta são dias úteis", () => {
		expect(isWeekday("2026-07-06")).toBe(true) // segunda
		expect(isWeekday("2026-07-07")).toBe(true) // terça
	})

	test("sábado e domingo não são dias úteis", () => {
		expect(isWeekday("2026-07-11")).toBe(false) // sábado
		expect(isWeekday("2026-07-12")).toBe(false) // domingo
	})

	test("ancora em meia-noite local — não desloca o dia por fuso", () => {
		// se parseasse como UTC, em fusos negativos cairia no domingo (fim de semana)
		expect(isWeekday("2026-07-13")).toBe(true) // segunda
	})
})
