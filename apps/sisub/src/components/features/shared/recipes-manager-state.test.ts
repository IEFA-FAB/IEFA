import { describe, expect, it } from "vitest"
import { describeSelectVisible, pickEmptyRecipesHint } from "./recipes-manager-state"

describe("pickEmptyRecipesHint", () => {
	it("pendentes de revisão vence os demais", () => {
		expect(pickEmptyRecipesHint({ onlyNotReviewed: true, onlyWeeklyMenu: true, urlSearch: "arroz" })).toBe(
			"Nenhuma preparação pendente de revisão neste filtro"
		)
	})
	it("plano semanal vence a busca", () => {
		expect(pickEmptyRecipesHint({ onlyNotReviewed: false, onlyWeeklyMenu: true, urlSearch: "arroz" })).toBe(
			"Nenhuma preparação em plano semanal — ajuste o filtro em Opções"
		)
	})
	it("só a busca", () => {
		expect(pickEmptyRecipesHint({ onlyNotReviewed: false, onlyWeeklyMenu: false, urlSearch: "arroz" })).toBe("Tente ajustar os filtros de busca")
	})
	it("sem filtro: sem dica", () => {
		expect(pickEmptyRecipesHint({ onlyNotReviewed: false, onlyWeeklyMenu: false, urlSearch: "" })).toBeNull()
	})
})

describe("describeSelectVisible", () => {
	it("zero visíveis: explica o botão desabilitado e não mostra contagem", () => {
		expect(describeSelectVisible(0)).toEqual({ ariaLabel: "Nenhuma preparação visível — expanda uma pasta para selecionar", countSuffix: "" })
	})
	it("com visíveis: conta no nome acessível e no texto", () => {
		expect(describeSelectVisible(3)).toEqual({ ariaLabel: "Selecionar as 3 preparações visíveis", countSuffix: " (3)" })
	})
	it("uma visível usa o mesmo plural do original", () => {
		expect(describeSelectVisible(1)).toEqual({ ariaLabel: "Selecionar as 1 preparações visíveis", countSuffix: " (1)" })
	})
})
