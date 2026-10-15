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
import { getRequest, setResponseStatus } from "@tanstack/react-start/server"
import { silentAdapterLogger } from "#/lib/ai-logger"
import { getServerCapabilities } from "#/lib/capabilities.server"
import { withGenerationDeadline } from "#/lib/generation-deadline"

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

/**
 * Prazo das chamadas ao modelo feitas por server function, ABAIXO do `idle_timeout` de 60 s
 * do ALB compartilhado (`infra/foundation/alb.tf`). Server function não manda byte nenhum até
 * terminar: com o prazo igual ao do ALB, o balanceador cortava primeiro e o usuário via um 504
 * em vez da mensagem de prazo. Os 10 s de folga cobrem o que a função faz depois da geração
 * (gravar histórico) e a volta da resposta. O caminho de documento mediu 16–22 s com o
 * opus-4-6 (`AI-PROVIDERS.md`, bench de 2026-08-21). Geração que precise encostar nisto vai
 * para SSE com keep-alive, como `routes/api/sacdgc/analyze.post.ts`, não para um número maior.
 */
export const SERVER_FN_AI_DEADLINE_MS = 50_000

const DEFAULT_TIMEOUT_MESSAGE = "A IA demorou mais que o esperado (timeout). Tente novamente com uma entrada menor."

/**
 * Sinal da requisição da server function: o cliente que fecha a aba ou perde a rede aborta a
 * geração, em vez de deixá-la correr até o prazo por uma resposta que ninguém vai ler. Fora de
 * um request (teste, script) não há o que encadear.
 */
function requestSignal(): AbortSignal | undefined {
	try {
		return getRequest()?.signal
	} catch {
		return undefined
	}
}

/** `code` do RUN_ERROR que o teto de consumo emite (os `limit` do `RateLimitError`). */
const RATE_LIMIT_CODES: ReadonlySet<string> = new Set<RateLimitError["limit"]>([
	"requests-per-minute",
	"tokens-per-minute",
	"tokens-per-day",
	"tokens-per-day-per-user",
])

type GenerationLimits = {
	/** Mensagem quando o prazo vence — é o que chega à tela. */
	timeoutMessage?: string
}

function withServerFnDeadline<T>({ timeoutMessage = DEFAULT_TIMEOUT_MESSAGE }: GenerationLimits, run: (controller: AbortController) => Promise<T>) {
	return withGenerationDeadline({ deadlineMs: SERVER_FN_AI_DEADLINE_MS, timeoutMessage, signal: requestSignal() }, run)
}

/** Geração de texto livre (não streaming): acumula os deltas do chatStream, com prazo e abort. */
export async function generateText({ userId, user, system, ...limits }: { userId: string; user: string; system?: string } & GenerationLimits): Promise<string> {
	const adapter = getSucontAdapter(userId)
	return withServerFnDeadline(limits, (abortController) =>
		collectStreamText(adapter.chatStream({ ...buildOptions(user, system), abortController } as ChatStreamOptions))
	)
}

/**
 * Texto de um `chatStream`. O teto de tokens no meio do stream (e a falha dos adapters que não
 * lançam) chega como RUN_ERROR, não como exceção: ignorá-lo devolvia "" e a tela mostrava uma
 * mensagem genérica no lugar de "limite atingido". Exportado para teste.
 */
export async function collectStreamText(stream: AsyncIterable<unknown>): Promise<string> {
	let text = ""
	for await (const chunk of stream) {
		const c = chunk as { type?: string; delta?: string; message?: string; code?: string }
		if (c.type === "TEXT_MESSAGE_CONTENT" && typeof c.delta === "string") text += c.delta
		if (c.type === "RUN_ERROR") {
			if (c.code && RATE_LIMIT_CODES.has(c.code)) setResponseStatus(429)
			throw new Error(c.message || "Falha ao gerar a resposta da IA.")
		}
	}
	return text
}

/** Geração de saída estruturada (JSON): instrui o modelo com o JSON Schema e parseia, com prazo e abort. */
export async function generateJson<T>({
	userId,
	user,
	system,
	schema,
	...limits
}: { userId: string; user: string; system?: string; schema: unknown } & GenerationLimits): Promise<T> {
	const adapter = getSucontAdapter(userId)
	type StructuredArgs = Parameters<ReturnType<typeof getSucontAdapter>["structuredOutput"]>[0]
	const result = await withServerFnDeadline(limits, (abortController) =>
		adapter.structuredOutput({
			chatOptions: { ...buildOptions(user, system), abortController } as unknown as StructuredArgs["chatOptions"],
			outputSchema: schema as StructuredArgs["outputSchema"],
		})
	)
	return result.data as T
}
