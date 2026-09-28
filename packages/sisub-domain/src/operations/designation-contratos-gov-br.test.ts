import { describe, expect, test } from "bun:test"
import {
	CONTRATOS_GOV_BR_FUNCTIONS,
	CONTRATOS_GOV_BR_UNMAPPED_FUNCTIONS,
	fromContratosGovBrFunction,
	toContratosGovBrFunction,
} from "./designation-contratos-gov-br.ts"
import { DESIGNATION_ROLES } from "./designations.ts"

describe("papel do sisub → função no Contratos.gov.br", () => {
	test("todo papel tem entrada no mapa", () => {
		expect(Object.keys(CONTRATOS_GOV_BR_FUNCTIONS).sort()).toEqual([...DESIGNATION_ROLES].sort())
	})

	test("titular e substituto viram funções distintas, como lá", () => {
		expect(toContratosGovBrFunction("gestor", false)).toBe("Gestor")
		expect(toContratosGovBrFunction("gestor", true)).toBe("Gestor Substituto")
		expect(toContratosGovBrFunction("fiscal_tecnico", true)).toBe("Fiscal Técnico Substituto")
		expect(toContratosGovBrFunction("fiscal_setorial", false)).toBe("Fiscal Setorial")
	})

	test("gestor setorial tem função; o substituto dele não, até aparecer lá", () => {
		expect(toContratosGovBrFunction("gestor_setorial", false)).toBe("Gestor Setorial")
		expect(toContratosGovBrFunction("gestor_setorial", true)).toBeNull()
	})

	test("a comissão de recebimento não é responsável do contrato lá", () => {
		expect(toContratosGovBrFunction("membro_comissao", false)).toBeNull()
		expect(toContratosGovBrFunction("membro_comissao", true)).toBeNull()
	})

	test("nenhuma função é de dois papéis", () => {
		const labels = Object.values(CONTRATOS_GOV_BR_FUNCTIONS).flatMap((pair) => [pair.holder, pair.substitute].filter((label) => label != null))
		expect(new Set(labels).size).toBe(labels.length)
	})
})

describe("função no Contratos.gov.br → papel do sisub", () => {
	test("ida e volta: toda função mapeada devolve o mesmo papel e a mesma marca de substituto", () => {
		for (const role of DESIGNATION_ROLES) {
			for (const isSubstitute of [false, true]) {
				const label = toContratosGovBrFunction(role, isSubstitute)
				if (label) expect(fromContratosGovBrFunction(label)).toEqual({ role, isSubstitute })
			}
		}
	})

	test("caixa, acento e espaço não distinguem a função", () => {
		expect(fromContratosGovBrFunction("  FISCAL TECNICO   SUBSTITUTO ")).toEqual({ role: "fiscal_tecnico", isSubstitute: true })
		expect(fromContratosGovBrFunction("gestor setorial")).toEqual({ role: "gestor_setorial", isSubstitute: false })
	})

	test("função sem papel aqui não é adivinhada", () => {
		for (const label of Object.keys(CONTRATOS_GOV_BR_UNMAPPED_FUNCTIONS)) expect(fromContratosGovBrFunction(label)).toBeNull()
		expect(fromContratosGovBrFunction("Preposto")).toBeNull()
	})

	test("papel que o código não conhece não derruba a tela", () => {
		expect(toContratosGovBrFunction("papel_futuro" as never, false)).toBeNull()
	})
})
