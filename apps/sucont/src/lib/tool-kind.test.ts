import { describe, expect, it } from "bun:test"
import { sucontTools } from "#/lib/data"
import { getToolKind } from "#/lib/tool-kind"

describe("getToolKind", () => {
	it("trata rota do hub como interna mesmo quando o card também traz url", () => {
		expect(getToolKind({ internalPath: "/auditor" })).toBe("internal")
		expect(getToolKind({ internalPath: "/documentacao", url: "/documentacao" })).toBe("internal")
	})

	it("reconhece caderno do NotebookLM", () => {
		expect(getToolKind({ url: "https://notebooklm.google.com/notebook/abc?authuser=1" })).toBe("notebooklm")
	})

	it("não confunde outro host do Google com NotebookLM", () => {
		expect(getToolKind({ url: "https://docs.google.com/document/d/abc/edit" })).toBe("external")
		expect(getToolKind({ url: "https://notebooklm.google.com.evil.test/notebook/abc" })).toBe("external")
	})

	it("cai em externo para url inválida ou ausente", () => {
		expect(getToolKind({})).toBe("external")
		expect(getToolKind({ url: "não é url" })).toBe("external")
		expect(getToolKind({ url: "http://www.diref.intraer/index.php" })).toBe("external")
	})

	it("classifica o catálogo do hub sem sobras", () => {
		const kinds = sucontTools.map((tool) => getToolKind(tool))
		expect(kinds.filter((k) => k === "internal").length).toBeGreaterThan(0)
		expect(kinds.filter((k) => k === "notebooklm").length).toBeGreaterThan(0)
		expect(kinds.filter((k) => k === "external").length).toBeGreaterThan(0)
	})
})
