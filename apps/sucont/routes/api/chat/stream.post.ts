import { createAdapterFromEnv, enforceRequestRateLimit, RateLimitError } from "@iefa/ai-provider"
import { hasPermission, resolveUserPermissions } from "@iefa/pbac"
import { createCookieAuthClient } from "@iefa/supabase-kit"
import { chat, chatParamsFromRequestBody, toServerSentEventsResponse } from "@tanstack/ai"
import { defineHandler } from "nitro"
import { createError, getHeader, type H3Event, readBody } from "nitro/h3"
import { getServerCapabilities } from "#/lib/capabilities.server"
import { envServer } from "#/lib/env.server"
import { buildSystemPrompt } from "#/lib/oracle-prompt"
import { getAccessControlClient } from "#/lib/supabase.server"

/**
 * Rota Nitro — fora do contexto de request do TanStack Start, então os helpers de
 * `#/lib/auth.server` (que dependem de `getRequest()`) não valem aqui. A sessão é
 * lida do header `Cookie` do H3Event, e a permissão pela mesma engine PBAC do resto
 * do app.
 */
async function requireSucontUser(event: H3Event): Promise<{ id: string }> {
	const auth = createCookieAuthClient({
		url: envServer.VITE_SUCONT_SUPABASE_URL,
		key: envServer.VITE_SUCONT_SUPABASE_PUBLISHABLE_KEY,
		cookieHeader: getHeader(event, "cookie"),
	})

	const {
		data: { user },
		error,
	} = await auth.auth.getUser()
	if (!user || error) throw createError({ statusCode: 401, message: "Não autenticado" })

	const permissions = await resolveUserPermissions(user.id, getAccessControlClient())
	if (!hasPermission(permissions, "sucont", 1)) {
		throw createError({ statusCode: 403, message: "Permissão insuficiente" })
	}

	return { id: user.id }
}

export default defineHandler(async (event: H3Event) => {
	// Capability gate — sem SUCONT_AI_* o oráculo não está configurado neste
	// ambiente: 503 em vez de estourar na montagem do adapter.
	if (!getServerCapabilities().oracle) {
		throw createError({ statusCode: 503, message: "Oráculo indisponível — IA não configurada neste ambiente" })
	}

	// O guard de rota do __root é client-side: não alcança esta rota Nitro. Sem a
	// checagem aqui, o endpoint seria um caminho aberto para o Bedrock da conta.
	const user = await requireSucontUser(event)

	const rawBody = await readBody(event)

	let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>
	try {
		params = await chatParamsFromRequestBody(rawBody)
	} catch (err) {
		if (err instanceof Response) {
			throw createError({ statusCode: 400, message: "Corpo da requisição inválido (AG-UI format esperado)" })
		}
		throw err
	}

	const { messages, forwardedProps } = params
	const contextSummary = forwardedProps.contextSummary as string | undefined

	// Teto de requisições ANTES de abrir o SSE: depois que o stream começa não há
	// mais status HTTP para devolver, e o erro viraria conexão cortada sem mensagem.
	try {
		enforceRequestRateLimit("SUCONT", user.id)
	} catch (error) {
		if (error instanceof RateLimitError) {
			// `Retry-After` vai DENTRO do createError. O h3 v2 monta a resposta de erro a
			// partir de `error.headers`; um `setResponseHeader` no event é descartado nesse
			// caminho, e o cliente recebe o 429 sem saber quanto esperar.
			throw createError({
				statusCode: 429,
				message: error.message,
				headers: { "Retry-After": String(error.retryAfterSeconds) },
				data: { retryAfterSeconds: error.retryAfterSeconds },
			})
		}
		throw error
	}

	const adapter = createAdapterFromEnv("SUCONT", { rateLimitKey: user.id })
	const stream = chat({
		adapter,
		messages,
		systemPrompts: [buildSystemPrompt(contextSummary)],
	})

	return toServerSentEventsResponse(stream)
})
