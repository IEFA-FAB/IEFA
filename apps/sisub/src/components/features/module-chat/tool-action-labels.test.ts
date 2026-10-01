import { describe, expect, test } from "vitest"
import { APPROVAL_TOOL_NAMES } from "@/lib/module-chat/tools/registry"
import { getActionLabel, getActionWarning, parseToolArguments } from "./tool-action-labels"

describe("getActionLabel", () => {
	test("concluir o anexo tem verbo próprio, não 'alterar status'", () => {
		expect(getActionLabel("update_quantity_estimate_status", { status: "completed" })).toBe("Concluir anexo quantitativo")
	})

	/**
	 * Os rótulos ficam num mapa próprio porque este arquivo roda no navegador e o registro das
	 * tools é código de servidor. A lista de escritas é a do registro: tool de escrita nova sem
	 * rótulo apareceria no cartão de aprovação como "Executar <nome_interno>".
	 */
	test.each([...APPROVAL_TOOL_NAMES])("tool de escrita %s tem rótulo no imperativo", (toolName) => {
		expect(getActionLabel(toolName, null)).not.toBe(`Executar ${toolName}`)
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
