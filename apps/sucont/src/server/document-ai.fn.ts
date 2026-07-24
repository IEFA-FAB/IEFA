import type { DocumentInsert } from "@iefa/database/sucont"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { generateJson } from "#/lib/ai.server"
import { requireSucontAccess } from "#/lib/auth.server"
import { getSucontServerClient } from "#/lib/supabase.server"

// ── Tipos exportados (usados pelos componentes) ──────────────
export type DocumentType = "FAB_OFFICE" | "DATA_ANALYSIS"

export interface FabDocumentData {
	organization: string
	subOrganization?: string
	documentNumber: string
	acronym: string
	year: string
	city: string
	date: string
	protocol: string
	sender: string
	recipient: string
	subject: string
	references?: string[]
	annexes?: string[]
	paragraphs: string[]
	signerName: string
	signerRank: string
	signerPosition: string
	urgency?: boolean
}

export interface DataAnalysisData {
	title: string
	subtitle: string
	author: string
	date: string
	summary: string
	keyMetrics: { label: string; value: string; trend: "up" | "down" | "neutral" }[]
	tableData: {
		headers: string[]
		rows: string[][]
	}
	analysis: string[]
	conclusion: string
	recommendations: string[]
}

// ── JSON Schemas (instruem o modelo Bedrock via Converse; substituem o Type.* do Gemini) ──
const fabSchema = {
	type: "object",
	properties: {
		organization: { type: "string" },
		subOrganization: { type: "string" },
		documentNumber: { type: "string" },
		acronym: { type: "string" },
		year: { type: "string" },
		city: { type: "string" },
		date: { type: "string" },
		protocol: { type: "string" },
		sender: { type: "string" },
		recipient: { type: "string" },
		subject: { type: "string" },
		references: { type: "array", items: { type: "string" } },
		annexes: { type: "array", items: { type: "string" } },
		paragraphs: { type: "array", items: { type: "string" } },
		signerName: { type: "string" },
		signerRank: { type: "string" },
		signerPosition: { type: "string" },
		urgency: { type: "boolean" },
	},
	required: [
		"organization",
		"documentNumber",
		"acronym",
		"year",
		"city",
		"date",
		"protocol",
		"sender",
		"recipient",
		"subject",
		"paragraphs",
		"signerName",
		"signerRank",
		"signerPosition",
	],
} as const

const analysisSchema = {
	type: "object",
	properties: {
		title: { type: "string" },
		subtitle: { type: "string" },
		author: { type: "string" },
		date: { type: "string" },
		summary: { type: "string" },
		keyMetrics: {
			type: "array",
			items: {
				type: "object",
				properties: {
					label: { type: "string" },
					value: { type: "string" },
					trend: { type: "string", enum: ["up", "down", "neutral"] },
				},
				required: ["label", "value", "trend"],
			},
		},
		tableData: {
			type: "object",
			properties: {
				headers: { type: "array", items: { type: "string" } },
				rows: { type: "array", items: { type: "array", items: { type: "string" } } },
			},
			required: ["headers", "rows"],
		},
		analysis: { type: "array", items: { type: "string" } },
		conclusion: { type: "string" },
		recommendations: { type: "array", items: { type: "string" } },
	},
	required: ["title", "subtitle", "author", "date", "summary", "keyMetrics", "tableData", "analysis", "conclusion", "recommendations"],
} as const

// ── Server Function ──────────────────────────────────────────
export const adaptDraftFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			draft: z.string().min(1),
			type: z.enum(["FAB_OFFICE", "DATA_ANALYSIS"]),
		})
	)
	.handler(async ({ data }) => {
		const ctx = await requireSucontAccess()
		const { draft, type } = data
		const isFab = type === "FAB_OFFICE"

		const prompt = isFab
			? `Persona: Você é um Assessor Administrativo especialista em Redação Oficial do Comando da Aeronáutica e consultor técnico em execução patrimonial (RADA-e e SIAFI). Sua tarefa é redigir ofícios técnicos, objetivos e formais.

Diretrizes de Estilo e Linguagem:
1. Tom: Formal, impessoal (terceira pessoa), direto e polido.
2. Vocabulário Técnico: Utilize termos como "fidedignidade patrimonial", "saldo alongado", "conta de trânsito", "desincorporação", "ajuste de exercícios anteriores" e "lastro documental".
3. Saudações Iniciais: Utilize sempre "Ao cumprimentá-lo [cordialmente/respeitosamente], passo a tratar de...".
4. Estrutura de Argumentação:
    ◦ Parágrafo 1: Contextualização e objeto do expediente.
    ◦ Parágrafos intermediários: Análise técnica detalhada, citando ofícios de referência, datas e valores.
    ◦ Parágrafo conclusivo: Recomendação clara ou solicitação de providência.
5. Regra de Ouro para Citações: Sempre que mencionar uma inconsistência contábil, fundamente com a Macrofunção 02.03.18 (Fidedignidade e ajuste de pendências) ou o Módulo 7 do RADA-e (Execução Patrimonial).
6. Fecho Mandatório: O último parágrafo deve ser exatamente: "Por fim, coloco a Divisão de Acompanhamento Patrimonial (SUCONT-4) à disposição para esclarecimentos adicionais, por intermédio do Cel Int Guerra e do 1º Ten QOAP CCO L. Santos, nos telefones (61) 3962-1537/1539."

Rascunho do Usuário: "${draft}"

Retorne um JSON com os campos:
- organization: Nome da OM (ex: DIRETORIA DE ECONOMIA E FINANÇAS DA AERONÁUTICA)
- subOrganization: Subdivisão se houver.
- documentNumber: Número/Seção/Sequencial.
- acronym: Sigla da seção.
- year: Ano atual.
- city: Cidade.
- date: Data por extenso.
- protocol: Protocolo COMAER (NUP).
- sender: Cargo do Remetente.
- recipient: Cargo do Destinatário.
- subject: Assunto em CAIXA ALTA.
- references: Lista de referências.
- annexes: Lista de anexos.
- paragraphs: Array de strings com os parágrafos adaptados seguindo a estrutura de argumentação e o fecho mandatório.
- signerName: Nome do signatário.
- signerRank: Posto/Quadro.
- signerPosition: Cargo.
- urgency: boolean.`
			: `Você é um analista de dados sênior especializado em auditoria governamental e contabilidade militar.
       Sua tarefa é transformar o rascunho em um Relatório de Análise de Dados Profissional, Limpo e Executivo (estilo corporativo/governamental, fundo claro).

       Extraia rigorosamente os dados da tabela fornecida no rascunho.

       Rascunho: "${draft}"

       Retorne um JSON com os campos:
       - title: Título do relatório.
       - subtitle: Subtítulo (ex: Unidade Gestora, Assunto).
       - author: Use sempre "Divisão de Contabilidade Patrimonial" como responsável.
       - date: Data do relatório.
       - summary: Resumo executivo do problema identificado.
       - keyMetrics: Array de 3 métricas principais. Cada métrica deve ter:
         - label: Nome do indicador.
         - value: Valor formatado (ex: R$ 1.250.000,00 ou 15%).
         - trend: String "up", "down" ou "neutral" baseada na análise técnica.
       - tableData: Objeto com 'headers' e 'rows' (array de arrays com os valores da tabela).
       - analysis: Array de strings com pontos de análise técnica.
       - conclusion: Texto de conclusão.
       - recommendations: Array de recomendações práticas para o gestor.`

		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error("O processamento demorou mais que o esperado (timeout). Tente com um rascunho mais curto.")), 60000)
		)

		const generated = await Promise.race([
			generateJson<FabDocumentData | DataAnalysisData>({ user: prompt, schema: isFab ? fabSchema : analysisSchema }),
			timeoutPromise,
		])

		// Persiste no histórico de documentos da seção (não bloqueia o retorno em caso de falha).
		try {
			const title = isFab ? (generated as FabDocumentData).subject : (generated as DataAnalysisData).title
			// `generated` é um objeto validado; o cast satisfaz o tipo Json da coluna jsonb.
			const generatedJson = generated as unknown as DocumentInsert["generated"]
			await getSucontServerClient()
				.from("document")
				.insert({ type, title: title ?? null, draft, generated: generatedJson, created_by: ctx.userId })
		} catch {
			// histórico é acessório — falha não deve derrubar a geração.
		}

		return generated
	})
