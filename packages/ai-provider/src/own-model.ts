/**
 * Preenche `options.model` com o modelo do próprio adapter.
 *
 * Os adapters em cima do `@tanstack/openai-base` (groq, nvidia, openrouter) e o da
 * Anthropic montam a requisição a partir de `options.model` — eles guardam o modelo
 * recebido no construtor, mas não o usam. Quem normalmente injeta esse campo é a
 * activity `chat()` do @tanstack/ai.
 *
 * Chamada direta a `adapter.chatStream` / `adapter.structuredOutput` não passa por
 * ela: é o caso das server functions e das rotas SSE deste monorepo. Sem este
 * preenchimento, o provider responde `400 'model' : property 'model' is missing` —
 * e como o adapter do Bedrock usa o modelo do construtor, a falha só aparece na
 * RESERVA, exatamente no momento em que o primário já caiu.
 *
 * Por adapter, e não uma constante de env: numa cadeia, o reserva tem modelo
 * próprio, e herdar o id do primário faria o reserva pedir um modelo que ele não
 * serve.
 */

import type { AnyTextAdapter } from "@tanstack/ai"

type WithModel = AnyTextAdapter & { model?: string }

type ChatStreamOptions = Parameters<AnyTextAdapter["chatStream"]>[0]
type StructuredOptions = Parameters<AnyTextAdapter["structuredOutput"]>[0]

export function withAdapterModel(adapter: AnyTextAdapter): AnyTextAdapter {
	const model = (adapter as WithModel).model
	if (!model) return adapter

	// `??` e não sobrescrita: quando `chat()` já resolveu o modelo, ele manda.
	const fill = (options: unknown): unknown => {
		const current = options as { model?: string } | null
		return current?.model ? options : { ...(current ?? {}), model }
	}

	return {
		...adapter,
		chatStream: (options: ChatStreamOptions) => adapter.chatStream(fill(options) as ChatStreamOptions),
		structuredOutput: (options: StructuredOptions) => {
			// Nesta chamada o modelo mora dentro de `chatOptions`, não na raiz.
			const args = options as unknown as { chatOptions?: unknown }
			const patched = args?.chatOptions ? { ...args, chatOptions: fill(args.chatOptions) } : args
			return adapter.structuredOutput(patched as unknown as StructuredOptions)
		},
	} as AnyTextAdapter
}
