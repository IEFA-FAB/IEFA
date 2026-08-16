import { describe, expect, test } from "bun:test"
import type { Contratacao } from "../extraction/schema.ts"
import { parsePrazoMeses, parseValorBRL, runCrossChecks } from "./cross-checks.ts"
import { structuralSeverity } from "./severity.ts"

function payload(overrides: Partial<Contratacao> = {}): Contratacao {
	const base = Object.fromEntries(
		[
			"objeto",
			"justificativa_necessidade",
			"descricao_solucao",
			"requisitos",
			"estimativa_quantidades",
			"levantamento_mercado",
			"valor_estimado",
			"justificativa_parcelamento",
			"criterios_sustentabilidade",
			"modelo_execucao",
			"modelo_gestao",
			"criterios_medicao_pagamento",
			"criterios_selecao_fornecedor",
			"garantia",
			"sancoes",
			"prazo_vigencia",
			"fiscalizacao",
			"modalidade",
			"objeto_tipo",
		].map((key) => [key, null])
	) as unknown as Contratacao

	return { ...base, ...overrides }
}

function field(value: string) {
	return { value, evidence: value }
}

describe("parseValorBRL", () => {
	test("lê valor com separador de milhar", () => {
		expect(parseValorBRL("O valor estimado é de R$ 1.250.000,00 (um milhão...)")).toBe(1250000)
	})

	test("devolve null quando não há valor", () => {
		expect(parseValorBRL("a ser definido")).toBeNull()
	})
})

describe("parsePrazoMeses", () => {
	test("lê prazo em meses por extenso", () => {
		expect(parsePrazoMeses("12 (doze) meses")).toBe(12)
	})

	test("converte anos em meses", () => {
		expect(parsePrazoMeses("prazo de 5 anos")).toBe(60)
	})

	test("devolve null para prazo não declarado", () => {
		expect(parsePrazoMeses("prazo indeterminado")).toBeNull()
	})
})

describe("runCrossChecks", () => {
	test("ausência de justificativa de parcelamento é inconformidade grave", () => {
		const result = runCrossChecks(payload()).find((check) => check.code === "cruzada:parcelamento-sem-justificativa")

		expect(result?.status).toBe("INCONFORME")
		expect(result?.severity).toBe("GRAVE")
		expect(result?.legal_ref[0]?.norma).toBe("Lei nº 14.133/2021")
	})

	test("valor estimado sem levantamento de mercado é inconformidade", () => {
		const result = runCrossChecks(payload({ valor_estimado: field("R$ 1.000.000,00") })).find((check) => check.code === "cruzada:valor-sem-pesquisa")

		expect(result?.status).toBe("INCONFORME")
	})

	test("sem valor estimado, a checagem fica não avaliada em vez de conforme", () => {
		const result = runCrossChecks(payload()).find((check) => check.code === "cruzada:valor-sem-pesquisa")

		expect(result?.status).toBe("NAO_AVALIADA")
	})

	test("vigência acima do limite em serviço contínuo é inconformidade", () => {
		const result = runCrossChecks(payload({ prazo_vigencia: field("prazo de 6 anos"), objeto_tipo: "SERVICOS" })).find(
			(check) => check.code === "cruzada:vigencia-limite"
		)

		expect(result?.status).toBe("INCONFORME")
		expect(result?.message).toContain("72")
	})

	test("vigência dentro do limite é conforme", () => {
		const result = runCrossChecks(payload({ prazo_vigencia: field("12 (doze) meses"), objeto_tipo: "SERVICOS" })).find(
			(check) => check.code === "cruzada:vigencia-limite"
		)

		expect(result?.status).toBe("CONFORME")
	})

	test("prazo não identificado não é tratado como conforme", () => {
		const result = runCrossChecks(payload({ prazo_vigencia: field("a definir") })).find((check) => check.code === "cruzada:vigencia-limite")

		expect(result?.status).toBe("NAO_AVALIADA")
	})

	test("prazo declarado sem natureza do objeto não é tratado como conforme", () => {
		// O limite de 60 meses só vale para serviço contínuo. Sem saber a natureza
		// do objeto, dar "dentro do limite" é afirmar conformidade sem o dado que
		// determina qual limite se aplica.
		const result = runCrossChecks(payload({ prazo_vigencia: field("prazo de 6 anos") })).find((check) => check.code === "cruzada:vigencia-limite")

		expect(result?.status).toBe("NAO_AVALIADA")
		expect(result?.message).toContain("72")
	})

	test("modelo de execução sem critérios de medição é inconformidade", () => {
		const result = runCrossChecks(payload({ modelo_execucao: field("execução por demanda") })).find((check) => check.code === "cruzada:execucao-sem-medicao")

		expect(result?.status).toBe("INCONFORME")
	})

	test("sem modelo de execução, a checagem aparece como não avaliada em vez de sumir", () => {
		// Antes, campo ausente fazia a regra desaparecer do relatório: ficava fora
		// dos achados e fora da contagem de cobertura, e o ACI lia o silêncio como
		// "nada a apontar".
		const result = runCrossChecks(payload()).find((check) => check.code === "cruzada:execucao-sem-medicao")

		expect(result?.status).toBe("NAO_AVALIADA")
	})

	test("toda checagem cruzada aparece no relatório, com qualquer entrada", () => {
		const codes = new Set(runCrossChecks(payload()).map((check) => check.code))

		expect(codes).toEqual(
			new Set(["cruzada:parcelamento-sem-justificativa", "cruzada:valor-sem-pesquisa", "cruzada:vigencia-limite", "cruzada:execucao-sem-medicao"])
		)
	})

	test("toda checagem carrega referência legal", () => {
		for (const check of runCrossChecks(payload())) {
			expect(check.legal_ref.length).toBeGreaterThan(0)
		}
	})
})

describe("structuralSeverity", () => {
	test("seção obrigatória ausente é grave", () => {
		expect(structuralSeverity("MISSING", true)).toBe("GRAVE")
	})

	test("seção opcional ausente é informativa", () => {
		expect(structuralSeverity("MISSING", false)).toBe("INFORMATIVA")
	})

	test("seção casada não gera achado", () => {
		expect(structuralSeverity("MATCHED", true)).toBeNull()
	})

	test("fora de ordem é média, renomeada e extra são informativas", () => {
		expect(structuralSeverity("OUT_OF_ORDER", true)).toBe("MEDIA")
		expect(structuralSeverity("RENAMED", true)).toBe("INFORMATIVA")
		expect(structuralSeverity("EXTRA", false)).toBe("INFORMATIVA")
	})
})
