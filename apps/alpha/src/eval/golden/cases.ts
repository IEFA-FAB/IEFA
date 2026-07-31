/**
 * Golden set das checagens cruzadas.
 *
 * **Estes casos são sintéticos.** Foram escritos a partir da estrutura dos
 * modelos oficiais da AGU, não de documentos reais da FAB, e servem para travar
 * o comportamento das checagens determinísticas e para dar forma ao harness.
 *
 * Antes de qualquer promoção de regra para `active` valendo em produção, este
 * conjunto precisa ser substituído por ETP/TR reais anotados por analista —
 * calibrar limiar contra caso inventado mede o quanto o sistema concorda com
 * quem escreveu o caso, não o quanto ele acerta.
 */

import type { Contratacao } from "../../extraction/schema.ts"
import type { CaseExpectation } from "../metrics.ts"

function field(value: string) {
	return { value, evidence: value }
}

const EMPTY = Object.fromEntries(
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

export interface GoldenCase {
	id: string
	description: string
	payload: Contratacao
	expectation: CaseExpectation
}

export const GOLDEN_CASES: GoldenCase[] = [
	{
		id: "tr-servicos-completo",
		description: "TR de serviços contínuos com todas as seções materiais preenchidas e prazo dentro do limite",
		payload: {
			...EMPTY,
			objeto: field("Contratação de serviços de manutenção predial para a Base Aérea de Anápolis"),
			justificativa_necessidade: field("Ausência de contrato vigente compromete a disponibilidade das instalações operacionais"),
			descricao_solucao: field("Prestação continuada com equipe residente e atendimento sob demanda"),
			requisitos: field("Equipe técnica com registro no CREA e atendimento em até 4 horas"),
			estimativa_quantidades: field("Postos de trabalho conforme planilha do Anexo I"),
			levantamento_mercado: field("Pesquisa em contratos similares de outras OM e em painel de preços"),
			valor_estimado: field("R$ 1.250.000,00 para o período de 12 meses"),
			justificativa_parcelamento: field("Objeto não parcelado por inviabilidade técnica de segregação das frentes"),
			modelo_execucao: field("Execução por postos de trabalho com rotinas preventivas mensais"),
			criterios_medicao_pagamento: field("Medição mensal por instrumento de aferição de resultado"),
			prazo_vigencia: field("12 (doze) meses, prorrogáveis na forma da lei"),
			objeto_tipo: "SERVICOS",
		},
		expectation: {
			expected: [],
			forbidden: ["cruzada:parcelamento-sem-justificativa", "cruzada:valor-sem-pesquisa", "cruzada:vigencia-limite", "cruzada:execucao-sem-medicao"],
		},
	},
	{
		id: "tr-sem-justificativa-parcelamento",
		description: "TR sem qualquer manifestação sobre parcelamento do objeto",
		payload: {
			...EMPTY,
			objeto: field("Aquisição de material de expediente"),
			valor_estimado: field("R$ 80.000,00"),
			levantamento_mercado: field("Pesquisa em painel de preços"),
			prazo_vigencia: field("12 (doze) meses"),
			objeto_tipo: "COMPRAS",
		},
		expectation: { expected: ["cruzada:parcelamento-sem-justificativa"], forbidden: ["cruzada:valor-sem-pesquisa", "cruzada:vigencia-limite"] },
	},
	{
		id: "etp-valor-sem-pesquisa",
		description: "ETP com valor estimado sem levantamento de mercado que o sustente",
		payload: {
			...EMPTY,
			objeto: field("Aquisição de equipamentos de informática"),
			valor_estimado: field("R$ 500.000,00"),
			justificativa_parcelamento: field("Objeto parcelado em dois itens"),
			prazo_vigencia: field("6 (seis) meses"),
			objeto_tipo: "TIC",
		},
		expectation: { expected: ["cruzada:valor-sem-pesquisa"], forbidden: ["cruzada:parcelamento-sem-justificativa", "cruzada:vigencia-limite"] },
	},
	{
		id: "tr-vigencia-acima-do-limite",
		description: "TR de serviço contínuo com vigência inicial de 6 anos",
		payload: {
			...EMPTY,
			objeto: field("Serviços de limpeza e conservação"),
			valor_estimado: field("R$ 3.000.000,00"),
			levantamento_mercado: field("Pesquisa de preços em contratos vigentes"),
			justificativa_parcelamento: field("Objeto não parcelado"),
			prazo_vigencia: field("prazo de 6 anos"),
			objeto_tipo: "SERVICOS",
		},
		expectation: { expected: ["cruzada:vigencia-limite"], forbidden: ["cruzada:parcelamento-sem-justificativa", "cruzada:valor-sem-pesquisa"] },
	},
	{
		id: "tr-execucao-sem-medicao",
		description: "TR com modelo de execução mas sem critérios de medição e pagamento",
		payload: {
			...EMPTY,
			objeto: field("Serviços de vigilância armada"),
			valor_estimado: field("R$ 2.000.000,00"),
			levantamento_mercado: field("Pesquisa em contratos similares"),
			justificativa_parcelamento: field("Objeto não parcelado por indivisibilidade do posto"),
			modelo_execucao: field("Postos de vigilância 12x36 em três acessos"),
			prazo_vigencia: field("24 (vinte e quatro) meses"),
			objeto_tipo: "SERVICOS",
		},
		expectation: { expected: ["cruzada:execucao-sem-medicao"], forbidden: ["cruzada:vigencia-limite"] },
	},
	{
		id: "etp-minimo",
		description: "ETP esquelético — acumula as lacunas materiais",
		payload: { ...EMPTY, objeto: field("Aquisição a definir"), objeto_tipo: "COMPRAS" },
		expectation: { expected: ["cruzada:parcelamento-sem-justificativa"], forbidden: [] },
	},
	{
		id: "tr-prazo-nao-declarado",
		description: "TR sem prazo de vigência identificável — não pode ser dado como conforme",
		payload: {
			...EMPTY,
			objeto: field("Serviços de manutenção de aeronaves"),
			valor_estimado: field("R$ 900.000,00"),
			levantamento_mercado: field("Pesquisa em atas de registro de preços"),
			justificativa_parcelamento: field("Parcelamento inviável"),
			prazo_vigencia: field("prazo a definir conforme conveniência"),
			objeto_tipo: "SERVICOS",
		},
		expectation: { expected: [], forbidden: ["cruzada:vigencia-limite"] },
	},
]
