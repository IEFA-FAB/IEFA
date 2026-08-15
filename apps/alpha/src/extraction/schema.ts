/**
 * Schema canônico da contratação.
 *
 * É a espinha dorsal das etapas 1.5–1.7: o comparador estrutural, o verificador
 * restrito e as checagens cruzadas operam sobre este JSON, não sobre o texto.
 *
 * Os campos saem do que os modelos AGU de ETP e Termo de Referência exigem —
 * cada um deles é uma seção obrigatória de algum dos modelos. Manter o schema
 * pequeno e explícito é proposital: campo que ninguém consome vira ruído de
 * extração e degrada a precisão do resto.
 */

import { z } from "zod"

export const ObjetoTipoSchema = z.enum(["COMPRAS", "SERVICOS", "OBRAS", "TIC"])
export type ObjetoTipo = z.infer<typeof ObjetoTipoSchema>

/**
 * Valor extraído com o trecho que o originou.
 *
 * `evidence` é citação **literal** do documento — é o que permite localizar o
 * span depois. Sem ela o campo não é aceito: valor sem origem rastreável é
 * indistinguível de alucinação.
 */
export const FieldSchema = z.object({
	value: z.string().min(1),
	evidence: z.string().min(1),
})

export type ExtractedField = z.infer<typeof FieldSchema>

/** Campo ausente na saída do modelo equivale a campo ausente no documento. */
const OptionalField = FieldSchema.nullish().transform((value) => value ?? null)

export const ContratacaoSchema = z.object({
	objeto: OptionalField,
	justificativa_necessidade: OptionalField,
	descricao_solucao: OptionalField,
	requisitos: OptionalField,
	estimativa_quantidades: OptionalField,
	levantamento_mercado: OptionalField,
	valor_estimado: OptionalField,
	justificativa_parcelamento: OptionalField,
	criterios_sustentabilidade: OptionalField,
	modelo_execucao: OptionalField,
	modelo_gestao: OptionalField,
	criterios_medicao_pagamento: OptionalField,
	criterios_selecao_fornecedor: OptionalField,
	garantia: OptionalField,
	sancoes: OptionalField,
	prazo_vigencia: OptionalField,
	fiscalizacao: OptionalField,
	modalidade: OptionalField,
	objeto_tipo: ObjetoTipoSchema.nullish().transform((value) => value ?? null),
})

export type Contratacao = z.infer<typeof ContratacaoSchema>

/** Campos que todo ETP/TR precisa ter — ausência vira achado, não erro de execução. */
export const CAMPOS_OBRIGATORIOS = [
	"objeto",
	"justificativa_necessidade",
	"descricao_solucao",
	"requisitos",
	"estimativa_quantidades",
	"valor_estimado",
	"modelo_execucao",
	"criterios_medicao_pagamento",
	"prazo_vigencia",
] as const satisfies ReadonlyArray<keyof Contratacao>

export const CAMPO_LABELS: Record<keyof Contratacao, string> = {
	objeto: "Objeto da contratação",
	justificativa_necessidade: "Justificativa da necessidade",
	descricao_solucao: "Descrição da solução como um todo",
	requisitos: "Requisitos da contratação",
	estimativa_quantidades: "Estimativa de quantidades",
	levantamento_mercado: "Levantamento de mercado",
	valor_estimado: "Valor estimado da contratação",
	justificativa_parcelamento: "Justificativa do parcelamento",
	criterios_sustentabilidade: "Critérios de sustentabilidade",
	modelo_execucao: "Modelo de execução do objeto",
	modelo_gestao: "Modelo de gestão do contrato",
	criterios_medicao_pagamento: "Critérios de medição e pagamento",
	criterios_selecao_fornecedor: "Critérios de seleção do fornecedor",
	garantia: "Garantia da contratação",
	sancoes: "Sanções administrativas",
	prazo_vigencia: "Prazo de vigência",
	fiscalizacao: "Fiscalização do contrato",
	modalidade: "Modalidade de licitação",
	objeto_tipo: "Natureza do objeto",
}

/** Posição do trecho de origem no texto do documento submetido. */
export interface SourceSpan {
	start: number
	end: number
	/** Trecho literal localizado — pode diferir do `evidence` por espaçamento. */
	text: string
}

export type ExtractionSpans = Partial<Record<keyof Contratacao, SourceSpan>>
