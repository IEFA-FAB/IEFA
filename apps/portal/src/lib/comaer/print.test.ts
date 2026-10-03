import { describe, expect, it } from "bun:test"
import { continuationPageRule, cssString } from "./print"

describe("regras de página da impressão", () => {
	it("escapa aspas e barra, e não deixa o texto fechar a tag <style>", () => {
		expect(cssString('IEFA "x" \\ y')).toBe('"IEFA \\"x\\" \\\\ y"')
		// Escape hexadecimal, não remoção: o HTML não vê "</style>" e a folha mostra o caractere.
		expect(cssString("OM <X>")).toBe('"OM \\3C X\\3E "')
		expect(cssString("</style><script>")).not.toContain("<")
	})

	it("põe a identificação nas folhas suplementares e tira da primeira (art. 42 § 1º)", () => {
		const rule = continuationPageRule("Ofício nº 12/DFP/771 - IEFA, de 02 OUT 2026")
		expect(rule).toContain('"(Fl " counter(page) "/" counter(pages) " do " "Ofício nº 12/DFP/771 - IEFA, de 02 OUT 2026" ")"')
		expect(rule).toMatch(/@page :first \{ @top-center \{ content: none; \} \}/)
	})
})
