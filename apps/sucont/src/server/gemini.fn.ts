import { GoogleGenAI, Type } from "@google/genai"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

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

// ── Server Function ──────────────────────────────────────────
export const adaptDraftFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			draft: z.string().min(1),
			type: z.enum(["FAB_OFFICE", "DATA_ANALYSIS"]),
		})
	)
	.handler(async ({ data }) => {
		const apiKey = process.env.GEMINI_API_KEY
		if (!apiKey) {
			throw new Error("GEMINI_API_KEY não configurada no servidor. Adicione ao .env.local.")
		}

		const ai = new GoogleGenAI({ apiKey })
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

		const schema = isFab
			? {
					type: Type.OBJECT,
					properties: {
						organization: { type: Type.STRING },
						subOrganization: { type: Type.STRING },
						documentNumber: { type: Type.STRING },
						acronym: { type: Type.STRING },
						year: { type: Type.STRING },
						city: { type: Type.STRING },
						date: { type: Type.STRING },
						protocol: { type: Type.STRING },
						sender: { type: Type.STRING },
						recipient: { type: Type.STRING },
						subject: { type: Type.STRING },
						references: { type: Type.ARRAY, items: { type: Type.STRING } },
						annexes: { type: Type.ARRAY, items: { type: Type.STRING } },
						paragraphs: { type: Type.ARRAY, items: { type: Type.STRING } },
						signerName: { type: Type.STRING },
						signerRank: { type: Type.STRING },
						signerPosition: { type: Type.STRING },
						urgency: { type: Type.BOOLEAN },
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
				}
			: {
					type: Type.OBJECT,
					properties: {
						title: { type: Type.STRING },
						subtitle: { type: Type.STRING },
						author: { type: Type.STRING },
						date: { type: Type.STRING },
						summary: { type: Type.STRING },
						keyMetrics: {
							type: Type.ARRAY,
							items: {
								type: Type.OBJECT,
								properties: {
									label: { type: Type.STRING },
									value: { type: Type.STRING },
									trend: { type: Type.STRING, enum: ["up", "down", "neutral"] },
								},
								required: ["label", "value", "trend"],
							},
						},
						tableData: {
							type: Type.OBJECT,
							properties: {
								headers: { type: Type.ARRAY, items: { type: Type.STRING } },
								rows: {
									type: Type.ARRAY,
									items: { type: Type.ARRAY, items: { type: Type.STRING } },
								},
							},
							required: ["headers", "rows"],
						},
						analysis: { type: Type.ARRAY, items: { type: Type.STRING } },
						conclusion: { type: Type.STRING },
						recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
					},
					required: ["title", "subtitle", "author", "date", "summary", "keyMetrics", "tableData", "analysis", "conclusion", "recommendations"],
				}

		const apiCall = ai.models.generateContent({
			model: "gemini-2.0-flash",
			contents: [{ role: "user", parts: [{ text: prompt }] }],
			config: {
				responseMimeType: "application/json",
				responseSchema: schema,
			},
		})

		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error("O processamento demorou mais que o esperado (timeout). Tente com um rascunho mais curto.")), 45000)
		)

		const response = await Promise.race([apiCall, timeoutPromise])

		if (!response?.text) {
			throw new Error("A IA retornou uma resposta inválida ou vazia.")
		}

		return JSON.parse(response.text)
	})
