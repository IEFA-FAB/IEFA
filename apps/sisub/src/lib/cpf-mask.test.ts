import { describe, expect, test } from "vitest"
import { maskCpf } from "@/lib/cpf-mask"

describe("maskCpf — o CPF inteiro nunca sai do servidor", () => {
	test("mascara no padrão gov.br, com ou sem pontuação", () => {
		expect(maskCpf("12345678901")).toBe("***.456.789-**")
		expect(maskCpf("123.456.789-01")).toBe("***.456.789-**")
	})

	test("o que não é CPF de 11 dígitos não vaza nem em parte", () => {
		expect(maskCpf(null)).toBeNull()
		expect(maskCpf("")).toBeNull()
		// devolver o valor cru, como fazia a máscara da tela, entregaria o dado fora do padrão
		expect(maskCpf("1234567890")).toBeNull()
		expect(maskCpf("abc")).toBeNull()
	})
})
