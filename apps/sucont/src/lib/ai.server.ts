/**
 * @module ai.server
 * Acesso à IA do SUCONT via @iefa/ai-provider (AWS Bedrock em prod, Converse API).
 * Provider/model/região vêm do prefixo de env `SUCONT` (SUCONT_AI_PROVIDER etc.).
 * Autenticação keyless pela cadeia de credenciais AWS (task role em prod, profile
 * local em dev). Use apenas em server functions.
 *
 * Este módulo é o ponto único por onde as server functions falam com o modelo, e
 * aplica — na mesma ordem do sisub — as três camadas antes de qualquer chamada:
 *
 *   1. capability gate  → 503 quando `SUCONT_AI_*` não está configurado;
 *   2. dono da chamada  → o `userId` é obrigatório e vem do guard de sessão, nunca
 *                         do input do cliente;
 *   3. teto de consumo  → `enforceRequestRateLimit` + `rateLimitKey` no adapter.
 *
 * O `userId` ser parâmetro obrigatório é o que impede uma server function nova de
 * chamar o modelo sem dono: não existe overload sem ele.
 */

import { createAdapterFromEnv, enforceRequestRateLimit, RateLimitError } from "@iefa/ai-provider"
import { setResponseStatus } from "@tanstack/react-start/server"
import { silentAdapterLogger } from "#/lib/ai-logger"
import { getServerCapabilities } from "#/lib/capabilities.server"

/**
 * Capability gate + teto de requisições. Server functions do TanStack Start
 * resolvem `throw Response` como DADO — por isso o status vai por
 * `setResponseStatus` e o que se lança é um `Error`.
 */
function guardAiRequest(userId: string) {
	if (!getServerCapabilities().oracle) {
		setResponseStatus(503)
		throw new Error("Recurso de IA indisponível — não configurado neste ambiente")
	}

	try {
		enforceRequestRateLimit("SUCONT", userId)
	} catch (error) {
		if (error instanceof RateLimitError) {
			// Sem `Retry-After` aqui: o Start remonta a resposta de erro da server function
			// e só o status sobrevive — o header seria mentira e o `retryAfterSeconds` do
			// RateLimitError se perde ao virar Error. Por isso a espera vai na MENSAGEM,
			// que é o único campo que chega à tela.
			setResponseStatus(429)
			throw new Error(`${error.message} (aguarde ${error.retryAfterSeconds}s)`)
		}
		throw error
	}
}

/**
 * Cria o adapter de IA do SUCONT a partir do env, já com as guardas aplicadas.
 * @param userId dono da chamada (do guard de sessão) — chaveia os tetos por usuário.
 */
export function getSucontAdapter(userId: string) {
	guardAiRequest(userId)
	return createAdapterFromEnv("SUCONT", { rateLimitKey: userId })
}

// O TextOptions do @tanstack/ai exige vários campos (logger, runId, …) que os
// adapters tratam como opcionais em runtime. Montamos o mínimo e fazemos o cast.
type ChatStreamOptions = Parameters<ReturnType<typeof getSucontAdapter>["chatStream"]>[0]

function buildOptions(user: string, system?: string): ChatStreamOptions {
	return {
		messages: [{ role: "user", content: user }],
		systemPrompts: system ? [system] : [],
		// Obrigatório: os adapters do TanStack chamam `logger.request`/`logger.errors`
		// sem guarda. Ver `#/lib/ai-logger`.
		logger: silentAdapterLogger,
	} as unknown as ChatStreamOptions
}

/** Geração de texto livre (não streaming): acumula os deltas do chatStream. */
export async function generateText({ userId, user, system }: { userId: string; user: string; system?: string }): Promise<string> {
	const adapter = getSucontAdapter(userId)
	let text = ""
	for await (const chunk of adapter.chatStream(buildOptions(user, system))) {
		const c = chunk as { type?: string; delta?: string }
		if (c.type === "TEXT_MESSAGE_CONTENT" && typeof c.delta === "string") text += c.delta
	}
	return text
}

/** Geração de saída estruturada (JSON): instrui o modelo com o JSON Schema e parseia. */
export async function generateJson<T>({ userId, user, system, schema }: { userId: string; user: string; system?: string; schema: unknown }): Promise<T> {
	const adapter = getSucontAdapter(userId)
	type StructuredArgs = Parameters<ReturnType<typeof getSucontAdapter>["structuredOutput"]>[0]
	const result = await adapter.structuredOutput({
		chatOptions: buildOptions(user, system) as unknown as StructuredArgs["chatOptions"],
		outputSchema: schema as StructuredArgs["outputSchema"],
	})
	return result.data as T
}
