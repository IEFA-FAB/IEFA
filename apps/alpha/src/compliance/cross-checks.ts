/**
 * Checagens cruzadas entre campos do JSON canônico (Etapa 1.7).
 *
 * São incoerências que nenhuma verificação de bloco isolado enxerga, porque
 * dependem de dois campos ao mesmo tempo. Ficam determinísticas e sem LLM: o
 * que se compara aqui é valor com valor, e o dispositivo citado é fixo.
 *
 * Regra que depende de campo ausente é registrada como **não avaliada**, nunca
 * como conforme — ausência de dado não é prova de conformidade.
 */

import type { Contratacao } from "../extraction/schema.ts"
import type { LegalRef } from "../lib/legal-ref.ts"
import type { Severity } from "./severity.ts"

export interface CrossCheckResult {
	code: string
	status: "CONFORME" | "INCONFORME" | "NAO_AVALIADA"
	severity: Severity
	message: string
	legal_ref: LegalRef[]
	fields: Array<keyof Contratacao>
	suggestion?: string
}

const LEI = "Lei nº 14.133/2021"

/** Extrai o primeiro valor monetário em reais de um texto livre. */
export function parseValorBRL(text: string): number | null {
	const match = /R\$\s*([\d.]+,\d{2}|\d[\d.]*)/.exec(text)
	if (!match) return null

	const normalized = match[1].replace(/\./g, "").replace(",", ".")
	const value = Number.parseFloat(normalized)
	return Number.isFinite(value) ? value : null
}

/** Prazo em meses declarado em texto livre ("12 (doze) meses", "5 anos"). */
export function parsePrazoMeses(text: string): number | null {
	const anos = /(\d+)\s*\(?[^)]*\)?\s*ano/i.exec(text)
	if (anos) return Number(anos[1]) * 12

	const meses = /(\d+)\s*\(?[^)]*\)?\s*(?:mes|mês|meses)/i.exec(text)
	if (meses) return Number(meses[1])

	return null
}

/** Limite de vigência inicial de contrato de serviço contínuo, em meses. */
const LIMITE_VIGENCIA_CONTINUO_MESES = 60

/**
 * Executa as checagens cruzadas sobre a extração.
 *
 * Cada checagem devolve status explícito — inclusive `NAO_AVALIADA` —, para que
 * o relatório possa declarar cobertura em vez de dar a impressão de que tudo o
 * que não apareceu está conforme.
 */
export function runCrossChecks(payload: Contratacao): CrossCheckResult[] {
	const results: CrossCheckResult[] = []

	// 1. Parcelamento: obrigatório justificar quando não há parcelamento.
	if (!payload.justificativa_parcelamento) {
		results.push({
			code: "cruzada:parcelamento-sem-justificativa",
			status: "INCONFORME",
			severity: "GRAVE",
			message: "O documento não apresenta justificativa quanto ao parcelamento (ou não) do objeto.",
			legal_ref: [{ norma: LEI, dispositivo: "art. 40, § 3º" }],
			fields: ["justificativa_parcelamento"],
			suggestion: "Incluir seção justificando a decisão de parcelar ou não o objeto, com a análise de viabilidade técnica e econômica.",
		})
	} else {
		results.push({
			code: "cruzada:parcelamento-sem-justificativa",
			status: "CONFORME",
			severity: "INFORMATIVA",
			message: "Justificativa de parcelamento presente.",
			legal_ref: [{ norma: LEI, dispositivo: "art. 40, § 3º" }],
			fields: ["justificativa_parcelamento"],
		})
	}

	// 2. Valor estimado x levantamento de mercado.
	if (!payload.valor_estimado || !payload.levantamento_mercado) {
		results.push({
			code: "cruzada:valor-sem-pesquisa",
			status: payload.valor_estimado && !payload.levantamento_mercado ? "INCONFORME" : "NAO_AVALIADA",
			severity: "GRAVE",
			message: payload.valor_estimado
				? "Há valor estimado sem levantamento de mercado que o sustente."
				: "Sem valor estimado no documento, a coerência com o levantamento de mercado não pôde ser avaliada.",
			legal_ref: [{ norma: LEI, dispositivo: "art. 23" }],
			fields: ["valor_estimado", "levantamento_mercado"],
			suggestion: "Registrar a metodologia da pesquisa de preços e as fontes consultadas que embasam o valor estimado.",
		})
	} else {
		results.push({
			code: "cruzada:valor-sem-pesquisa",
			status: "CONFORME",
			severity: "INFORMATIVA",
			message: "Valor estimado acompanhado de levantamento de mercado.",
			legal_ref: [{ norma: LEI, dispositivo: "art. 23" }],
			fields: ["valor_estimado", "levantamento_mercado"],
		})
	}

	// 3. Prazo de vigência de serviço contínuo.
	const prazo = payload.prazo_vigencia ? parsePrazoMeses(payload.prazo_vigencia.value) : null
	if (prazo === null) {
		results.push({
			code: "cruzada:vigencia-limite",
			status: "NAO_AVALIADA",
			severity: "MEDIA",
			message: "Prazo de vigência não identificado no documento — limite legal não verificado.",
			legal_ref: [{ norma: LEI, dispositivo: "art. 107" }],
			fields: ["prazo_vigencia"],
		})
	} else if (payload.objeto_tipo === null) {
		// O limite depende da natureza do objeto. Sem ela, declarar "dentro do
		// limite" seria afirmar conformidade a partir de dado ausente.
		results.push({
			code: "cruzada:vigencia-limite",
			status: "NAO_AVALIADA",
			severity: "MEDIA",
			message: `Prazo de vigência declarado (${prazo} meses), mas a natureza do objeto não foi identificada — o limite legal aplicável não pôde ser determinado.`,
			legal_ref: [{ norma: LEI, dispositivo: "art. 107" }],
			fields: ["prazo_vigencia", "objeto_tipo"],
		})
	} else if (payload.objeto_tipo === "SERVICOS" && prazo > LIMITE_VIGENCIA_CONTINUO_MESES) {
		results.push({
			code: "cruzada:vigencia-limite",
			status: "INCONFORME",
			severity: "GRAVE",
			message: `Prazo de vigência declarado (${prazo} meses) excede o limite de ${LIMITE_VIGENCIA_CONTINUO_MESES} meses para serviços contínuos.`,
			legal_ref: [{ norma: LEI, dispositivo: "art. 107" }],
			fields: ["prazo_vigencia", "objeto_tipo"],
			suggestion: "Ajustar o prazo de vigência ou fundamentar a hipótese legal que autoriza a extensão.",
		})
	} else {
		results.push({
			code: "cruzada:vigencia-limite",
			status: "CONFORME",
			severity: "INFORMATIVA",
			message: `Prazo de vigência declarado (${prazo} meses) dentro do limite legal.`,
			legal_ref: [{ norma: LEI, dispositivo: "art. 107" }],
			fields: ["prazo_vigencia"],
		})
	}

	// 4. Modelo de execução x critérios de medição e pagamento.
	if (!payload.modelo_execucao) {
		results.push({
			code: "cruzada:execucao-sem-medicao",
			status: "NAO_AVALIADA",
			severity: "GRAVE",
			message: "Modelo de execução não identificado — a coerência com os critérios de medição não pôde ser avaliada.",
			legal_ref: [{ norma: LEI, dispositivo: 'art. 6º, XXIII, "g"' }],
			fields: ["modelo_execucao", "criterios_medicao_pagamento"],
		})
	} else if (!payload.criterios_medicao_pagamento) {
		results.push({
			code: "cruzada:execucao-sem-medicao",
			status: "INCONFORME",
			severity: "GRAVE",
			message: "Há modelo de execução do objeto sem os critérios de medição e pagamento correspondentes.",
			legal_ref: [{ norma: LEI, dispositivo: 'art. 6º, XXIII, "g"' }],
			fields: ["modelo_execucao", "criterios_medicao_pagamento"],
			suggestion: "Descrever como a execução será medida e qual o vínculo entre medição e pagamento.",
		})
	}

	return results
}
