import { describe, expect, test } from "bun:test"
import { describePerson, formatMilitaryName, type PersonIdentity } from "#/lib/identity"

const base: PersonIdentity = { userId: "d8b3417d-c7d3-4e79-8dcd-17213d59ad8e", email: null, nrOrdem: null, posto: null, nomeGuerra: null }

describe("formatMilitaryName", () => {
	test("junta posto e nome de guerra", () => {
		expect(formatMilitaryName({ posto: "1T", nomeGuerra: "NANNI" })).toBe("1T NANNI")
	})

	test("sem posto, o nome de guerra basta", () => {
		expect(formatMilitaryName({ posto: null, nomeGuerra: "NANNI" })).toBe("NANNI")
	})

	// Um posto solto não identifica ninguém: "1T" seria o rótulo de todo primeiro-tenente.
	test("posto sem nome de guerra não vira rótulo", () => {
		expect(formatMilitaryName({ posto: "1T", nomeGuerra: null })).toBeNull()
		expect(formatMilitaryName({ posto: "1T", nomeGuerra: "   " })).toBeNull()
	})
})

describe("describePerson", () => {
	test("identificação militar na frente, e-mail embaixo", () => {
		expect(describePerson({ ...base, email: "nannijpsn@fab.mil.br", nrOrdem: "7379749", posto: "1T", nomeGuerra: "NANNI" })).toEqual({
			primary: "1T NANNI",
			secondary: "nannijpsn@fab.mil.br",
		})
	})

	test("sem SARAM vinculado, o e-mail é o rótulo", () => {
		expect(describePerson({ ...base, email: "larissalsb@fab.mil.br" })).toEqual({ primary: "larissalsb@fab.mil.br", secondary: null })
	})

	test("SARAM informado mas fora do cadastro de pessoal complementa o e-mail", () => {
		expect(describePerson({ ...base, email: "larissalsb@fab.mil.br", nrOrdem: "1234567" })).toEqual({
			primary: "larissalsb@fab.mil.br",
			secondary: "SARAM 1234567",
		})
	})

	test("sem e-mail, o SARAM segura o rótulo", () => {
		expect(describePerson({ ...base, nrOrdem: "1234567" })).toEqual({ primary: "SARAM 1234567", secondary: null })
	})

	// O último recurso identifica mal, mas identifica — e é o que o administrador
	// copia para procurar a conta. Um traço faria a linha parecer corrompida.
	test("sem nada, o userId", () => {
		expect(describePerson(base)).toEqual({ primary: base.userId, secondary: null })
	})

	test("string vazia é ausência, não rótulo", () => {
		expect(describePerson({ ...base, email: "", nrOrdem: "  " })).toEqual({ primary: base.userId, secondary: null })
	})
})
