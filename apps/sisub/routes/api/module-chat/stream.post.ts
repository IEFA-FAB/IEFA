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
 */

import { createError, getHeader, readBody, type H3Event } from "h3"
import { defineHandler } from "nitro"
import { chat, chatParamsFromRequestBody, toServerSentEventsResponse } from "@tanstack/ai"
import { otelMiddleware } from "@tanstack/ai/middlewares/otel"
import { trace, metrics } from "@opentelemetry/api"
import { createAdapterFromEnv, maxIterationsMiddleware } from "@iefa/ai-provider"
import type { Database } from "@iefa/database"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { hasPermission } from "@/auth/pbac"
import { getServerCapabilities } from "@/lib/capabilities.server"
import { envServer } from "@/lib/env.server"
import { getModuleConfig } from "@/lib/module-chat/tools/registry"
import { type ToolContext, getMaxLevel } from "@/lib/module-chat/tools/shared"
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
	const cookieHeader = getHeader(event, "cookie") ?? ""
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

function getDataClient() {
	return createClient<Database, "sisub">(envServer.VITE_SISUB_SUPABASE_URL, envServer.SISUB_SUPABASE_SECRET_KEY, {
		db: { schema: "sisub" },
		auth: { persistSession: false },
	})
}

async function loadUserPermissions(supabase: ReturnType<typeof getDataClient>, userId: string): Promise<UserPermission[]> {
	const { data, error } = await supabase.from("user_permissions").select("module, level, mess_hall_id, kitchen_id, unit_id").eq("user_id", userId)
	if (error) throw new Error("Erro ao carregar permissões")
	return ((data ?? []) as UserPermission[]).filter((p) => p.level > 0)
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default defineHandler(async (event: H3Event) => {
	// 0. Capability gate — fluxo não-essencial: sem secrets de IA o recurso fica
	// "Em breve" na UI e o endpoint responde 503 (em vez de quebrar o deploy).
	if (!getServerCapabilities().moduleChat) {
		throw createError({ statusCode: 503, message: "Assistente IA indisponível — não configurado neste ambiente" })
	}

	// 1. Auth
	const authClient = getAuthClientFromEvent(event)
	const {
		data: { user },
		error: authError,
	} = await authClient.auth.getUser()

	if (!user || authError) {
		throw createError({ statusCode: 401, message: "Não autenticado" })
	}

	// 2. Parse body
	const rawBody = await readBody(event)

	let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>
	try {
		params = await chatParamsFromRequestBody(rawBody)
	} catch {
		throw createError({ statusCode: 400, message: "Corpo da requisição inválido" })
	}

	const { messages } = params
	const fp = params.forwardedProps as Record<string, unknown>
	const module = fp?.module as ChatModule | undefined
	const scopeId = fp?.scopeId != null ? Number(fp.scopeId) : undefined

	if (!module || !CHAT_MODULES.includes(module)) {
		throw createError({ statusCode: 400, message: "Módulo inválido" })
	}

	// 3. PBAC check
	const supabase = getDataClient()
	const permissions = await loadUserPermissions(supabase, user.id)

	const appModule: AppModule = module
	const scope: PermissionScope | undefined =
		module === "kitchen" && scopeId != null
			? { type: "kitchen", id: scopeId }
			: (module === "unit" || module === "local-analytics") && scopeId != null
				? { type: "unit", id: scopeId }
				: undefined

	if (!hasPermission(permissions, appModule, 1, scope)) {
		throw createError({ statusCode: 403, message: "Permissão insuficiente" })
	}

	const userLevel = getMaxLevel(permissions, appModule, scopeId)

	// 4. Load module config + tools
	const toolCtx: ToolContext = {
		userId: user.id,
		permissions,
		module,
		scopeId,
		supabase,
	}

	const { systemPrompt, tools } = getModuleConfig(module, userLevel, toolCtx)

	// 5. Stream
	const adapter = createAdapterFromEnv("MODULE_CHAT")
	const stream = chat({
		adapter,
		messages,
		tools,
		systemPrompts: [systemPrompt],
		middleware: [otel, maxIterationsMiddleware(8)],
	})

	return toServerSentEventsResponse(stream)
})
