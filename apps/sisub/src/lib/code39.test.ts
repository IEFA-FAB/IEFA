/**
 * Unit — Code 39 da etiqueta interna de lote.
 *
 * O teste decodifica de volta: as barras são convertidas em módulos e
 * comparadas com o padrão esperado. É o único jeito de pegar o erro que já
 * aconteceu aqui — barras desenhadas por posição alternada em vez de agrupadas
 * por módulos iguais produzem uma etiqueta que PARECE código de barras e que
 * nenhum leitor decodifica.
 */

import { describe, expect, test } from "vitest"
import { code39Modules, encodeCode39 } from "@/lib/code39"

/** Reconstrói a sequência de módulos a partir dos retângulos desenhados. */
function decode(bars: NonNullable<ReturnType<typeof encodeCode39>>): string {
	const modules = Array.from({ length: bars.total }, () => "0")
	for (const rect of bars.rects) {
		for (let i = rect.x; i < rect.x + rect.width; i++) modules[i] = "1"
	}
	return modules.join("")
}

describe("encodeCode39", () => {
	test("o desenho reconstrói exatamente os módulos do padrão", () => {
		const bars = encodeCode39("LOT7Q2M9X4B")
		expect(bars).not.toBeNull()
		if (!bars) return
		expect(decode(bars)).toBe(code39Modules("LOT7Q2M9X4B"))
	})

	test("começa e termina com barra (guardas do Code 39)", () => {
		const bars = encodeCode39("LOT7Q2M9X4B")
		if (!bars) return
		const modules = decode(bars)
		expect(modules.startsWith("1")).toBe(true)
		expect(modules.endsWith("1")).toBe(true)
	})

	test("cada caractere ocupa 12 módulos e os separadores entram entre eles", () => {
		// `*LOT*` = 5 caracteres → 5 × 12 + 4 separadores
		const modules = code39Modules("LOT")
		expect(modules?.length).toBe(5 * 12 + 4)
	})

	test("a letra O do prefixo existe na tabela", () => {
		// omiti-la faria a etiqueta sair com um caractere a menos, e o leitor
		// devolveria um código que não é o do lote
		expect(code39Modules("LOT00000000")).not.toBeNull()
	})

	test("caractere fora da tabela devolve null em vez de encolher o código", () => {
		expect(code39Modules("LOT-ã")).toBeNull()
		expect(encodeCode39("lote 1")).toBeNull()
	})

	test("minúscula é aceita (o leitor devolve maiúscula)", () => {
		expect(code39Modules("lot7q2m9x4b")).toBe(code39Modules("LOT7Q2M9X4B"))
	})

	test("barra larga é dois módulos, estreita é um", () => {
		const bars = encodeCode39("LOT7Q2M9X4B")
		if (!bars) return
		const widths = new Set(bars.rects.map((rect) => rect.width))
		expect([...widths].sort()).toEqual([1, 2])
	})
})
