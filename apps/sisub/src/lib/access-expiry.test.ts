/**
 * Conversão data ↔ instante do prazo de acesso.
 *
 * A regra que estes testes seguram é uma só: "até o dia 31" tem que continuar valendo NO
 * dia 31. Um round-trip que perdesse o fuso encurtaria o acesso em um dia toda vez que
 * alguém abrisse o diálogo de edição e salvasse sem mexer em nada.
 */

import { describe, expect, test } from "vitest"
import { expiryFromDateInput, expiryToDateInput, formatExpiry } from "./access-expiry"

describe("expiryFromDateInput", () => {
	test("vazio = sem prazo", () => {
		// É o default de tudo que já existe: o campo em branco não pode virar "expira agora".
		expect(expiryFromDateInput("")).toBeNull()
	})

	test("a data escolhida vale até o FIM do dia, no fuso local", () => {
		const iso = expiryFromDateInput("2026-12-31")
		expect(iso).not.toBeNull()

		const date = new Date(iso as string)
		expect(date.getFullYear()).toBe(2026)
		expect(date.getMonth()).toBe(11)
		expect(date.getDate()).toBe(31)
		// Meia-noite tiraria o acesso no começo do dia 31 — a leitura errada de "até".
		expect(date.getHours()).toBe(23)
		expect(date.getMinutes()).toBe(59)
	})

	test("entrada malformada não vira instante inventado", () => {
		expect(expiryFromDateInput("nao-e-data")).toBeNull()
		expect(expiryFromDateInput("2026-13")).toBeNull()
	})
})

describe("expiryToDateInput", () => {
	test("null/undefined viram campo vazio", () => {
		expect(expiryToDateInput(null)).toBe("")
		expect(expiryToDateInput(undefined)).toBe("")
	})

	test("round-trip preserva o dia", () => {
		// O caso que motiva o par de funções: 23:59 de 31/12 em Brasília é 02:59 de 01/01 em
		// UTC. Um `toISOString().slice(0, 10)` devolveria 01/01 e encurtaria o prazo a cada
		// edição salva sem alteração.
		for (const day of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
			const iso = expiryFromDateInput(day)
			expect(expiryToDateInput(iso)).toBe(day)
		}
	})

	test("instante inválido não quebra o formulário", () => {
		expect(expiryToDateInput("lixo")).toBe("")
	})
})

describe("formatExpiry", () => {
	test('"sem prazo" é um estado, não um vazio', () => {
		expect(formatExpiry(null)).toBe("Sem prazo")
		expect(formatExpiry(undefined)).toBe("Sem prazo")
		expect(formatExpiry("lixo")).toBe("Sem prazo")
	})

	test("formata em pt-BR o dia do vencimento", () => {
		expect(formatExpiry(expiryFromDateInput("2026-12-31"))).toBe("31/12/2026")
	})
})
