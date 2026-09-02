/**
 * @module ai-options
 * Opções da chamada ao modelo, no módulo mais raso possível.
 *
 * Separado de `ai.server` de propósito: assim o smoke do provider manda ao Bedrock
 * EXATAMENTE o que a produção manda, em vez de uma segunda montagem parecida — que é o
 * tipo de cópia que deixa de cobrir a opção nova em silêncio. `ai.server` arrasta
 * `@tanstack/react-start/server`; aqui não há nada além do logger.
 */

import { silentAdapterLogger } from "./ai-logger"

/**
 * Teto de saída do documento.
 *
 * Um ofício com itens e alíneas passa de 2 mil tokens de saída, e o teto padrão do Converse
 * não é declarado em lugar nenhum — depende do caminho. Sem valor explícito, a resposta é
 * cortada no meio de uma string do JSON e o que chega à tela é "falha ao parsear", que não
 * diz nada sobre a causa. Foi exatamente esse o bug do SAC-DGC no sucont
 * (`apps/sucont/src/sacdgc/README.md`), e o caminho aqui é o mesmo.
 */
export const MAX_OUTPUT_TOKENS = 4096

/** Opções de chamada — o mesmo objeto usado pela server function e pelo smoke. */
export function buildChatOptions(user: string, system?: string) {
	return {
		messages: [{ role: "user" as const, content: user }],
		systemPrompts: system ? [system] : [],
		modelOptions: {
			maxTokens: MAX_OUTPUT_TOKENS,
			// Redação oficial é impessoal e padronizada (art. 4º e 5º da NSCA 5-3). Variação
			// alta aqui rende sinônimo criativo em documento que deve ser previsível.
			temperature: 0.2,
		},
		// Obrigatório: os adapters do TanStack chamam `logger.request`/`logger.errors` sem
		// guarda — ver `./ai-logger`.
		logger: silentAdapterLogger,
	}
}
