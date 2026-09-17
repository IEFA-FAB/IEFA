/**
 * Contrato do CNPJ — com o formato ALFANUMÉRICO que a Receita passou a emitir.
 *
 * O risco concreto: validar com `/^\d{14}$/` (o que o repo fazia por aí)
 * recusa fornecedor novo e recusa a chave de acesso da NF-e dele. Os dígitos
 * verificadores continuam módulo 11; o que muda é o valor do caractere
 * (ASCII − 48).
 */

import { describe, expect, test } from "bun:test"
import { cnpjRoot, formatCnpj, isValidCnpj, isValidCpf, normalizeCnpj } from "./cnpj.ts"

describe("isValidCnpj", () => {
	test("numérico válido", () => {
		expect(isValidCnpj("00394429000100")).toBe(true)
		expect(isValidCnpj("00.394.429/0001-00")).toBe(true)
	})

	test("alfanumérico válido", () => {
		expect(isValidCnpj("12ABC678000K30")).toBe(true)
		expect(isValidCnpj("00394429000K34")).toBe(true)
	})

	test("dígito verificador errado", () => {
		expect(isValidCnpj("00394429000101")).toBe(false)
		expect(isValidCnpj("12ABC678000K31")).toBe(false)
	})

	test("letra no lugar do dígito verificador não vale", () => {
		expect(isValidCnpj("12ABC678000K3A")).toBe(false)
	})

	test("tamanho errado, vazio e nulo", () => {
		expect(isValidCnpj("003944290001")).toBe(false)
		expect(isValidCnpj("")).toBe(false)
		expect(isValidCnpj(null)).toBe(false)
		expect(isValidCnpj(undefined)).toBe(false)
	})

	test("caractere repetido fecha o DV mas não existe", () => {
		expect(isValidCnpj("00000000000000")).toBe(false)
	})
})

describe("normalizeCnpj / cnpjRoot / formatCnpj", () => {
	test("normaliza máscara e caixa", () => {
		expect(normalizeCnpj("12abc678000k30")).toBe("12ABC678000K30")
		expect(normalizeCnpj("00.394.429/0001-00")).toBe("00394429000100")
	})

	test("raiz identifica a matriz — as OMs da FAB compartilham a mesma", () => {
		expect(cnpjRoot("00394429000100")).toBe("00394429")
		expect(cnpjRoot("00394429000K34")).toBe("00394429")
	})

	test("formata para exibição", () => {
		expect(formatCnpj("00394429000100")).toBe("00.394.429/0001-00")
		expect(formatCnpj("abc")).toBeNull()
	})
})

describe("isValidCpf", () => {
	test("emitente pessoa física (produtor rural)", () => {
		expect(isValidCpf("52998224725")).toBe(true)
		expect(isValidCpf("529.982.247-25")).toBe(true)
	})

	test("inválidos", () => {
		expect(isValidCpf("52998224726")).toBe(false)
		expect(isValidCpf("11111111111")).toBe(false)
		expect(isValidCpf(null)).toBe(false)
	})
})
