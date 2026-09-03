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

/** Anexo enviado ao modelo — imagem (digitalização) ou documento (PDF e afins). */
export interface Attachment {
	kind: "image" | "document"
	mimeType: string
	/** Conteúdo em base64, sem o prefixo `data:`. */
	base64: string
}

/**
 * Opções de chamada — o mesmo objeto usado pela server function, pela importação e pelo
 * smoke.
 *
 * Com anexo, o conteúdo vira lista de partes: o texto continua presente porque o Bedrock
 * EXIGE um bloco de texto junto do documento, e porque o anexo precisa vir anunciado como
 * dado — o conteúdo de uma minuta é texto de terceiro, e "desconsidere as instruções
 * anteriores" dentro dela é um ataque plausível.
 */
export function buildChatOptions(user: string, system?: string, attachments: Attachment[] = []) {
	const content =
		attachments.length === 0
			? user
			: [
					{ type: "text" as const, content: user },
					...attachments.map((a) => ({ type: a.kind, source: { type: "data" as const, mimeType: a.mimeType, value: a.base64 } })),
				]
	return {
		messages: [{ role: "user" as const, content }],
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
