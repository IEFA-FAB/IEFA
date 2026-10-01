/**
 * Module Chat SSE streaming endpoint.
 * Agentic loop with TanStack AI tools — executes tools server-side.
 *
 * Flow:
 * 1. Auth (cookie → getUser)
 * 2. Parse body (AG-UI format) — module + scopeId come from forwardedProps
 * 3. PBAC check (module + scope)
 * 4. Load module config (system prompt + tools filtered by user level)
 * 5. chat() with maxIterationsMiddleware(8) + otelMiddleware
 * 6. toServerSentEventsResponse() → AG-UI SSE stream
 *
 * Aprovação humana: tool de escrita para no interrupt `approval_<toolCallId>` e o run termina.
 * O turno seguinte traz a decisão em `resume` (+ `parentRunId`); só então a call pendente do
 * histórico sobrevive à higiene e o `chat()` executa (ou devolve a recusa ao modelo).
 */

import { createAdapterFromEnv, enforceRequestRateLimit, maxIterationsMiddleware, RateLimitError } from "@iefa/ai-provider"
import { checkSameOriginJsonRequest } from "@iefa/auth-kit"
import type { Database } from "@iefa/database"
import { resolveUserPermissions } from "@iefa/pbac"
import { metrics, trace } from "@opentelemetry/api"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { chat, chatParamsFromRequestBody, toServerSentEventsResponse } from "@tanstack/ai"
import { otelMiddleware } from "@tanstack/ai/middlewares/otel"
import { type H3Event, HTTPError, readBody } from "h3"
import { defineHandler } from "nitro"
import { hasPermission } from "@/auth/pbac"
import { getServerCapabilities } from "@/lib/capabilities.server"
import { assertResumeMatchesPending, ChatRequestError, checkChatPayloadSize, parseApprovalResume, sanitizeClientMessages } from "@/lib/chat-client-messages"
import { getDb } from "@/lib/db.server"
import { envServer } from "@/lib/env.server"
import { getModuleConfig } from "@/lib/module-chat/tools/registry"
import { getMaxLevel, type ToolContext } from "@/lib/module-chat/tools/shared"
import { getAccessControlClient } from "@/lib/supabase.server"
import type { ChatModule } from "@/types/domain/module-chat"
import type { AppModule, PermissionScope, UserPermission } from "@/types/domain/permissions"

const CHAT_MODULES: ChatModule[] = ["global", "kitchen", "unit", "local-analytics"]

const otel = otelMiddleware({
	tracer: trace.getTracer("sisub-module-chat"),
	meter: metrics.getMeter("sisub-module-chat"),
	captureContent: false,
})

// ── Auth helpers ────────────────────────────────────────────────────────────

function getAuthClientFromEvent(event: H3Event) {
	const cookieHeader = event.req.headers.get("cookie") ?? ""
	const parsedCookies = cookieHeader.split(";").map((c: string) => {
		const [name, ...v] = c.split("=")
		return { name: name.trim(), value: v.join("=") }
	})

	return createServerClient<Database, "sisub">(envServer.VITE_SISUB_SUPABASE_URL, envServer.SISUB_SUPABASE_SECRET_KEY, {
		db: { schema: "sisub" },
		cookies: {
			getAll: () => parsedCookies,
			setAll: () => {},
		},
	})
}

// Client default no schema kitchen (maioria das tools); queries a core/procurement
// usam `.schema()` explícito. Permissões vêm de access_control (`.schema(...)`).
function getDataClient() {
	return createClient<Database, "kitchen">(envServer.VITE_SISUB_SUPABASE_URL, envServer.SISUB_SUPABASE_SECRET_KEY, {
		db: { schema: "kitchen" },
		auth: { persistSession: false },
	})
}

/**
 * Permissões EFETIVAS do usuário — grants inline + políticas, com os denies (level 0).
 *
 * Esta função era uma query escrita à mão em `user_permissions` terminando em
 * `.filter((p) => p.level > 0)`: descartava o deny antes de `hasPermission`, que depende
 * de vê-lo para negar, e nem lia as permissões vindas de política. Quem tinha allow global
 * e deny numa cozinha escrevia nela pelo chat. O comensal implícito que o resolver injeta
 * é inofensivo aqui: `diner` não é módulo de chat.
 */
function loadUserPermissions(userId: string): Promise<UserPermission[]> {
	return resolveUserPermissions(userId, getAccessControlClient()) as Promise<UserPermission[]>
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default defineHandler(async (event: H3Event) => {
	// 0. Capability gate — fluxo não-essencial: sem secrets de IA o recurso fica
	// "Em breve" na UI e o endpoint responde 503 (em vez de quebrar o deploy).
	if (!getServerCapabilities().moduleChat) {
		throw new HTTPError({ status: 503, message: "Assistente IA indisponível — não configurado neste ambiente" })
	}

	// CSRF: o corpo é lido com a sessão do cookie, e `readBody` aceita `text/plain`.
	const origin = checkSameOriginJsonRequest(event.req.headers, event.req.url)
	if (!origin.ok) {
		throw new HTTPError({ status: 403, message: origin.reason })
	}

	// 1. Auth
	const authClient = getAuthClientFromEvent(event)
	const {
		data: { user },
		error: authError,
	} = await authClient.auth.getUser()

	if (!user || authError) {
		throw new HTTPError({ status: 401, message: "Não autenticado" })
	}

	// 2. Parse body
	const rawBody = await readBody(event)

	let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>
	try {
		params = await chatParamsFromRequestBody(rawBody)
	} catch {
		throw new HTTPError({ status: 400, message: "Corpo da requisição inválido" })
	}

	const sizeError = checkChatPayloadSize(params.messages)
	if (sizeError) {
		throw new HTTPError({ status: 413, message: sizeError })
	}

	// A decisão de aprovação viaja no `resume`, não no histórico: `chatParamsFromRequestBody`
	// apaga as `parts` das mensagens. Forma fora de `{ approved: boolean }` (inclusive
	// `editedArgs`, que executaria com argumentos que o cartão não mostrou) é 400.
	let resume: ReturnType<typeof parseApprovalResume>
	try {
		resume = parseApprovalResume(params.resume)
	} catch (error) {
		if (error instanceof ChatRequestError) throw new HTTPError({ status: error.status, message: error.message })
		throw error
	}
	if (resume && resume.length > 0 && !params.parentRunId) {
		throw new HTTPError({ status: 400, message: "Resposta de aprovação sem o run de origem" })
	}

	const fp = params.forwardedProps as Record<string, unknown>
	const module = fp?.module as ChatModule | undefined
	const scopeId = fp?.scopeId != null ? Number(fp.scopeId) : undefined

	if (!module || !CHAT_MODULES.includes(module)) {
		throw new HTTPError({ status: 400, message: "Módulo inválido" })
	}

	// 3. PBAC check
	const supabase = getDataClient()
	const permissions = await loadUserPermissions(user.id)

	const appModule: AppModule = module
	const scope: PermissionScope | undefined =
		module === "kitchen" && scopeId != null
			? { type: "kitchen", id: scopeId }
			: (module === "unit" || module === "local-analytics") && scopeId != null
				? { type: "unit", id: scopeId }
				: undefined

	if (!hasPermission(permissions, appModule, 1, scope)) {
		throw new HTTPError({ status: 403, message: "Permissão insuficiente" })
	}

	const userLevel = getMaxLevel(permissions, appModule, scopeId)

	// 4. Load module config + tools
	const toolCtx: ToolContext = {
		userId: user.id,
		permissions,
		module,
		scopeId,
		supabase,
		// Tools que leem algo já modelado no domínio usam este cliente, não PostgREST cru.
		db: getDb(),
	}

	const { systemPrompt, tools, approvalToolNames } = getModuleConfig(module, userLevel, toolCtx)

	// Higiene do histórico DEPOIS de saber quais tools esta conversa tem: só call pendente de
	// tool que exige aprovação, com decisão neste `resume`, chega ao `chat()`.
	const messages = sanitizeClientMessages(params.messages, { approvalTools: approvalToolNames, resume })
	try {
		assertResumeMatchesPending(messages, resume)
	} catch (error) {
		if (error instanceof ChatRequestError) throw new HTTPError({ status: error.status, message: error.message })
		throw error
	}

	// 5. Teto de consumo — aplicado ANTES de abrir o SSE. Depois que o stream começa não há
	// mais status HTTP para devolver: o erro vira conexão cortada, sem mensagem.
	try {
		enforceRequestRateLimit("MODULE_CHAT", user.id)
	} catch (error) {
		if (error instanceof RateLimitError) {
			// `Retry-After` vai DENTRO do erro. O h3 v2 monta a resposta de erro a partir de
			// `error.headers`; um header setado no event é descartado nesse caminho, e o
			// cliente recebe o 429 sem saber quanto esperar.
			throw new HTTPError({
				status: 429,
				message: error.message,
				headers: { "Retry-After": String(error.retryAfterSeconds) },
				data: { retryAfterSeconds: error.retryAfterSeconds },
			})
		}
		throw error
	}

	// 6. Stream
	const adapter = createAdapterFromEnv("MODULE_CHAT", { rateLimitKey: user.id })
	const stream = chat({
		adapter,
		messages,
		tools,
		systemPrompts: [systemPrompt],
		middleware: [otel, maxIterationsMiddleware(8)],
		// Identificam o run no AG-UI. `parentRunId` + `resume` é o que faz o `chat()` aplicar a
		// decisão de aprovação; sem eles a call pendente pararia de novo no mesmo interrupt.
		threadId: params.threadId,
		runId: params.runId,
		parentRunId: params.parentRunId,
		resume,
	})

	return toServerSentEventsResponse(stream)
})
