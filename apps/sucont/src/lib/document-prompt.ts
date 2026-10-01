/**
 * @module document-prompt
 * Prompts da Automação de Documentos (SUCONT-4): ofício FAB e relatório de análise.
 *
 * Antes tudo ia numa mensagem só do usuário, com o rascunho entre aspas no meio das
 * regras: um rascunho com `"` e "ignore as diretrizes" fechava a citação e falava com o
 * mesmo peso da persona. Aqui persona, regras e formato de saída são o `system`, texto
 * fixo do servidor; o rascunho vai delimitado no `user`, com nonce por chamada.
 *
 * Puro de propósito: os testes conferem a montagem e o teto sem modelo e sem sessão.
 */
import { untrustedContentRule, wrapUntrusted } from "@iefa/ai-provider/untrusted"
import { z } from "zod"
import { citarMacrofuncao, MACROFUNCOES, RADAE } from "#/lib/normas"

/** Prefixo do marcador do rascunho (`<rascunho_…>`). */
const DRAFT_TAG_PREFIX = "rascunho_"

/** Rascunho de ofício ou relatório: folga larga sobre um texto colado com tabela. */
export const MAX_DRAFT_CHARS = 60_000

/** Entrada de `adaptDraftFn`. Acima do teto o Zod recusa antes da chamada ao modelo. */
export const adaptDraftInputSchema = z.object({
	draft: z.string().min(1).max(MAX_DRAFT_CHARS),
	type: z.enum(["FAB_OFFICE", "DATA_ANALYSIS"]),
})

export type DocumentType = z.infer<typeof adaptDraftInputSchema>["type"]

const FAB_OFFICE_SYSTEM_PROMPT = `Persona: Você é um Assessor Administrativo especialista em Redação Oficial do Comando da Aeronáutica e consultor técnico em execução patrimonial (RADA-e e SIAFI). Sua tarefa é redigir ofícios técnicos, objetivos e formais a partir do rascunho do usuário, que chega na mensagem do usuário.

Diretrizes de Estilo e Linguagem:
1. Tom: Formal, impessoal (terceira pessoa), direto e polido.
2. Vocabulário Técnico: Utilize termos como "fidedignidade patrimonial", "saldo alongado", "conta de trânsito", "desincorporação", "ajuste de exercícios anteriores" e "lastro documental".
3. Saudações Iniciais: Utilize sempre "Ao cumprimentá-lo [cordialmente/respeitosamente], passo a tratar de...".
4. Estrutura de Argumentação:
    ◦ Parágrafo 1: Contextualização e objeto do expediente.
    ◦ Parágrafos intermediários: Análise técnica detalhada, citando ofícios de referência, datas e valores.
    ◦ Parágrafo conclusivo: Recomendação clara ou solicitação de providência.
5. Regra de Ouro para Citações: Sempre que mencionar uma inconsistência contábil, fundamente com uma destas referências, usando EXATAMENTE o título indicado — não invente título de macrofunção:
    ◦ Pendência ou saldo alongado em conta de trânsito/a classificar: ${citarMacrofuncao(MACROFUNCOES.encerramento)}, item 5.1.
    ◦ Natureza da ocorrência (alerta ou ressalva) e divergência entre sistema estruturante e contabilidade: ${citarMacrofuncao(MACROFUNCOES.conformidade)}.
    ◦ Depreciação, amortização e exaustão: ${citarMacrofuncao(MACROFUNCOES.depreciacao)}.
    ◦ Restos a pagar: ${citarMacrofuncao(MACROFUNCOES.restosAPagar)}.
    ◦ Procedimento de regularização: ${citarMacrofuncao(MACROFUNCOES.regularizacoes)}.
    ◦ Execução patrimonial no COMAER: ${RADAE.execucaoPatrimonial}.
6. Fecho Mandatório: O último parágrafo deve ser exatamente: "Por fim, coloco a Divisão de Acompanhamento Patrimonial (SUCONT-4) à disposição para esclarecimentos adicionais, por intermédio do Cel Int Guerra e do 1º Ten QOAP CCO L. Santos, nos telefones (61) 3962-1537/1539."

${untrustedContentRule(DRAFT_TAG_PREFIX)}

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

const DATA_ANALYSIS_SYSTEM_PROMPT = `Você é um analista de dados sênior especializado em auditoria governamental e contabilidade militar.
Sua tarefa é transformar o rascunho do usuário, que chega na mensagem do usuário, em um Relatório de Análise de Dados Profissional, Limpo e Executivo (estilo corporativo/governamental, fundo claro).

Extraia rigorosamente os dados da tabela fornecida no rascunho.

${untrustedContentRule(DRAFT_TAG_PREFIX)}

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

const SYSTEM_PROMPT_BY_TYPE: Record<DocumentType, string> = {
	FAB_OFFICE: FAB_OFFICE_SYSTEM_PROMPT,
	DATA_ANALYSIS: DATA_ANALYSIS_SYSTEM_PROMPT,
}

const REQUEST_BY_TYPE: Record<DocumentType, string> = {
	FAB_OFFICE: "Adapte o rascunho acima em ofício, seguindo as diretrizes, e retorne o JSON pedido.",
	DATA_ANALYSIS: "Transforme o rascunho acima no relatório de análise de dados e retorne o JSON pedido.",
}

/** `system` fixo por tipo de documento; `user` com o rascunho delimitado e o pedido. */
export function buildDocumentPrompt({ type, draft, nonce }: { type: DocumentType; draft: string; nonce: string }): { system: string; user: string } {
	const block = wrapUntrusted({ tagPrefix: DRAFT_TAG_PREFIX, nonce, label: "Rascunho do usuário", text: draft })
	return { system: SYSTEM_PROMPT_BY_TYPE[type], user: `${block}\n\n${REQUEST_BY_TYPE[type]}` }
}
