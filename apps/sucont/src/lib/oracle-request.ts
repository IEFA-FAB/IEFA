/**
 * @module oracle-request
 * Tetos do corpo aceito por `POST /api/chat/stream` (oráculo dos Subitens Genéricos).
 *
 * O corpo inteiro vira prompt: o histórico de mensagens vai para o modelo e o
 * `contextSummary` é colado no system prompt. Sem teto, uma única requisição
 * carrega megabytes para o Bedrock e a conta é paga pelo teto de consumo do usuário
 * (ou estoura o limite do provider e a run morre sem mensagem). As outras duas rotas
 * de IA do app já validam o corpo com Zod e tetos por campo; esta é a que recebia o
 * formato AG-UI cru.
 *
 * Os valores ficam folgados sobre o uso real: o resumo que o `AIAssistant` monta
 * (listas por ODS, órgão superior e RAC, top 10 UGs, Pareto) fica na casa de dezenas
 * de KB, e uma conversa longa não passa de algumas dezenas de mensagens.
 */

/** Mensagens por requisição (o histórico inteiro trafega a cada turno). */
export const MAX_ORACLE_MESSAGES = 60
/** Tamanho do histórico serializado, em caracteres de JSON. */
export const MAX_ORACLE_MESSAGES_CHARS = 200_000
/** Tamanho do `contextSummary`, que vai inteiro para o system prompt. */
export const MAX_ORACLE_CONTEXT_CHARS = 60_000

export type OracleRequestCheck = { ok: true; contextSummary: string | undefined } | { ok: false; status: 400 | 413; message: string }

export function checkOracleRequestLimits(messages: readonly unknown[], contextSummary: unknown): OracleRequestCheck {
	if (contextSummary !== undefined && contextSummary !== null && typeof contextSummary !== "string") {
		return { ok: false, status: 400, message: "Contexto do oráculo inválido — recarregue a tela e tente novamente." }
	}
	if (messages.length > MAX_ORACLE_MESSAGES) {
		return { ok: false, status: 413, message: "Conversa longa demais — limpe o histórico e recomece." }
	}
	if (JSON.stringify(messages).length > MAX_ORACLE_MESSAGES_CHARS) {
		return { ok: false, status: 413, message: "Conversa longa demais — limpe o histórico e recomece." }
	}
	if (typeof contextSummary === "string" && contextSummary.length > MAX_ORACLE_CONTEXT_CHARS) {
		return { ok: false, status: 413, message: "Recorte de dados grande demais para o oráculo — aplique filtros e tente novamente." }
	}
	return { ok: true, contextSummary: contextSummary ?? undefined }
}
