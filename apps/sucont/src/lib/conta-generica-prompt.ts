/**
 * @module conta-generica-prompt
 * Prompt do Oráculo da Conta Genérica (SUCONT-3).
 *
 * A tela mandava o system prompt pronto (`systemContext`), e o servidor o repassava ao
 * modelo sem teto: quem chamasse a server function escolhia a persona e as regras. Aqui
 * o system é texto fixo do servidor; o que a tela manda é só DADO — os agregados por ODS
 * e as prioridades da análise carregada — e ele vai delimitado na mensagem do usuário,
 * com nonce por chamada.
 *
 * Puro de propósito: os testes conferem a montagem e os tetos sem modelo e sem sessão.
 */
import { untrustedContentRule, wrapUntrusted } from "@iefa/ai-provider/untrusted"
import { z } from "zod"

/** Prefixo do marcador do bloco de contexto (`<contexto_…>`). */
const CONTEXT_TAG_PREFIX = "contexto_"

/** Pergunta do usuário: uma pergunta, não um documento. */
export const MAX_CONTA_GENERICA_QUERY_CHARS = 4_000
/** Contexto montado na tela. O real tem poucos KB (agregados por ODS e top 5 UGs). */
export const MAX_CONTA_GENERICA_CONTEXT_CHARS = 60_000

/** Entrada de `oracleContaGenericaFn`. Acima dos tetos o Zod recusa antes da chamada ao modelo. */
export const contaGenericaOracleInputSchema = z.object({
	query: z.string().min(1).max(MAX_CONTA_GENERICA_QUERY_CHARS),
	context: z.string().max(MAX_CONTA_GENERICA_CONTEXT_CHARS),
})

export const CONTA_GENERICA_SYSTEM_PROMPT = `Você é o Oráculo SUCONT, assistente de análise contábil do COMAER.
Os dados da análise atual da Conta Genérica (impacto financeiro, inconsistências, ODS, órgão superior e UGs mais críticos, Pareto, mapa de risco por ODS e prioridades de atuação) chegam na mensagem do usuário, antes da pergunta.

${untrustedContentRule(CONTEXT_TAG_PREFIX)}

Responda de forma técnica, militar e objetiva. Use negrito para destacar pontos críticos.`

/** Mensagem do usuário: o contexto da tela delimitado e, depois dele, a pergunta. */
export function buildContaGenericaUserPrompt({ context, query, nonce }: { context: string; query: string; nonce: string }): string {
	const block = wrapUntrusted({ tagPrefix: CONTEXT_TAG_PREFIX, nonce, label: "Dados da análise atual da Conta Genérica", text: context })
	return `${block}\n\nPergunta:\n${query}`
}
