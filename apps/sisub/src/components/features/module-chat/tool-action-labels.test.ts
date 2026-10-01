import { describe, expect, test } from "vitest"
import { getActionLabel, getActionWarning, parseToolArguments } from "./tool-action-labels"

describe("getActionLabel", () => {
	test("concluir o anexo tem verbo próprio, não 'alterar status'", () => {
		expect(getActionLabel("update_quantity_estimate_status", { status: "completed" })).toBe("Concluir anexo quantitativo")
	})

	test("tool sem rótulo cai num texto genérico, nunca em vazio", () => {
		expect(getActionLabel("tool_nova", null)).toBe("Executar tool_nova")
	})
})

describe("getActionWarning", () => {
	test("concluir o anexo avisa que não tem volta", () => {
		expect(getActionWarning("update_quantity_estimate_status", { status: "completed" })).toContain("não volta para rascunho")
	})

	test("ação reversível não tem aviso", () => {
		expect(getActionWarning("update_quantity_estimate_status", { status: "archived" })).toBeNull()
		expect(getActionWarning("remove_menu_item", { itemId: "x" })).toBeNull()
	})
})

describe("parseToolArguments", () => {
	test("argumento que não é objeto JSON vira null", () => {
		expect(parseToolArguments("[1]")).toBeNull()
		expect(parseToolArguments("{")).toBeNull()
		expect(parseToolArguments(undefined)).toBeNull()
	})
})
