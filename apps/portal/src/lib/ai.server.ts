/**
 * @module ai.server
 * Acesso à IA do portal via @iefa/ai-provider (AWS Bedrock no primário, keyless pela
 * task role do ECS). Provider/model/região vêm do prefixo de env `PORTAL`.
 *
 * Ponto ÚNICO por onde as server functions do portal falam com modelo, aplicando — na
 * mesma ordem do sisub e do sucont — as três camadas antes de qualquer chamada:
 *
 *   1. capability gate  → 503 quando `PORTAL_AI_*` não está configurado;
 *   2. dono da chamada  → `userId` obrigatório, vindo do guard de sessão e nunca do input;
 *   3. teto de consumo  → `enforceRequestRateLimit` + `rateLimitKey` no adapter.
 *
 * O `userId` ser parâmetro obrigatório é o que impede uma server function nova de chamar
 * o modelo sem dono: não existe overload sem ele.
 */

import { createAdapterFromEnv, enforceRequestRateLimit, RateLimitError } from "@iefa/ai-provider"
import { setResponseStatus } from "@tanstack/react-start/server"
import { buildChatOptions } from "./ai-options"
import { getServerCapabilities } from "./capabilities.server"

/**
 * Capability gate + teto de requisições. Server functions do TanStack Start resolvem
 * `throw Response` como DADO — por isso o status vai por `setResponseStatus` e o que se
 * lança é um `Error`.
 */
function guardAiRequest(userId: string) {
	if (!getServerCapabilities().documentAi) {
		setResponseStatus(503)
		throw new Error("Redação assistida indisponível — não configurada neste ambiente.")
	}

	try {
		enforceRequestRateLimit("PORTAL", userId)
	} catch (error) {
		if (error instanceof RateLimitError) {
			// O Start remonta a resposta de erro da server function e só o status sobrevive:
			// um header `Retry-After` seria mentira. A espera vai na MENSAGEM, que é o único
			// campo que chega à tela.
			setResponseStatus(429)
			throw new Error(`${error.message} (aguarde ${error.retryAfterSeconds}s)`)
		}
		throw error
	}
}

/** Adapter do portal já com as guardas aplicadas. @param userId dono da chamada, do guard de sessão. */
export function getPortalAdapter(userId: string) {
	guardAiRequest(userId)
	return createAdapterFromEnv("PORTAL", { rateLimitKey: userId })
}

// O TextOptions do @tanstack/ai exige campos (logger, runId, …) que os adapters tratam
// como opcionais em runtime. `buildChatOptions` monta o mínimo e o cast fica aqui.
type ChatStreamOptions = Parameters<ReturnType<typeof getPortalAdapter>["chatStream"]>[0]

function buildOptions(user: string, system?: string): ChatStreamOptions {
	return buildChatOptions(user, system) as unknown as ChatStreamOptions
}

/** Saída estruturada (JSON): instrui o modelo com o JSON Schema e devolve o objeto. */
export async function generateJson<T>({ userId, user, system, schema }: { userId: string; user: string; system?: string; schema: unknown }): Promise<T> {
	const adapter = getPortalAdapter(userId)
	type StructuredArgs = Parameters<ReturnType<typeof getPortalAdapter>["structuredOutput"]>[0]
	const result = await adapter.structuredOutput({
		chatOptions: buildOptions(user, system) as unknown as StructuredArgs["chatOptions"],
		outputSchema: schema as StructuredArgs["outputSchema"],
	})
	return result.data as T
}
