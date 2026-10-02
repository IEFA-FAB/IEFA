import { z } from "zod"

/**
 * Histórico dos dois chats persistidos do sisub: o de analytics (`analytics_chat_*`) e o
 * agêntico por módulo (`module_chat_*`).
 *
 * O que os dois compartilham é a REFERÊNCIA à sessão e o título — e só isso está fatorado
 * aqui. O corpo da mensagem diverge (gráfico vs. chamada de ferramenta), então cada um tem
 * o seu schema; unificá-los exigiria um campo opcional por coluna de cada lado e deixaria
 * de reprovar payload trocado entre os chats.
 *
 * Nenhum destes schemas é exposto a modelo (não são tools de IA), então `.optional()` aqui
 * significa "campo ausente" no sentido normal — a regra de `dropUnexpectedNulls`/`.nullish()`
 * do contrato de tools não se aplica.
 *
 * `dono da sessão` nunca entra em input: vem do `UserContext`.
 */

/** Espelha o CHECK `analytics_chat_message_chart_type_override_check`. */
export const CHART_TYPES = ["bar", "line", "area", "pie", "table"] as const
export const ChartTypeSchema = z.enum(CHART_TYPES)
export type ChartType = z.infer<typeof ChartTypeSchema>

/** Espelha o CHECK `module_chat_session_module_check`. */
export const CHAT_MODULES = ["global", "kitchen", "unit", "local-analytics"] as const
export const ChatModuleSchema = z.enum(CHAT_MODULES)
export type ChatModule = z.infer<typeof ChatModuleSchema>

const ChatSessionTitleSchema = z.string().min(1).max(200)

// ── Tetos do corpo da mensagem ───────────────────────────────────────────────
//
// As fns de gravação aceitam o que o navegador manda; sem teto, uma linha só podia ter
// megabytes. Os tetos ficam acima do que o chat produz de verdade e abaixo do que quebraria:
//   - o histórico inteiro de uma conversa viaja de volta ao modelo a cada turno, e o endpoint
//     recusa acima de 400 mil caracteres (`MAX_CHAT_PAYLOAD_CHARS` no app). Uma linha maior que
//     isso sozinha já tornaria a conversa impossível de continuar;
//   - medido em 2026-10-01 no banco: texto até 4.791 caracteres, gráfico até 802, ferramentas até
//     21.366. Gráfico do analytics tem no máximo 500 linhas (LIMIT da RPC).
//
// O texto usa o MESMO teto do endpoint, não um menor: o que o endpoint aceitou (uma planilha colada
// na pergunta) tem de caber no histórico, senão a gravação falha e a pergunta some ao recarregar.

/** Texto da mensagem (pergunta do usuário ou resposta do modelo) — o teto do payload do endpoint. */
export const MAX_CHAT_CONTENT_CHARS = 400_000
/** Gráfico, chamadas e resultado de ferramenta, medidos em JSON. */
export const MAX_CHAT_JSON_CHARS = 400_000
const MAX_CHAT_ERROR_CHARS = 16_000
const MAX_CHAT_LABEL_CHARS = 200

const ChatContentSchema = z
	.string()
	.max(MAX_CHAT_CONTENT_CHARS, `Mensagem longa demais (máximo de ${MAX_CHAT_CONTENT_CHARS.toLocaleString("pt-BR")} caracteres)`)
const ChatErrorSchema = z.string().max(MAX_CHAT_ERROR_CHARS)
const ChatLabelSchema = z.string().max(MAX_CHAT_LABEL_CHARS)

/** jsonb livre, com teto pelo tamanho serializado. */
const ChatJsonSchema = z.unknown().refine((value) => value === undefined || (JSON.stringify(value)?.length ?? 0) <= MAX_CHAT_JSON_CHARS, {
	message: `Conteúdo estruturado grande demais (máximo de ${MAX_CHAT_JSON_CHARS.toLocaleString("pt-BR")} caracteres em JSON)`,
})

/** Referência a uma sessão de chat — usada por leitura de mensagens e exclusão, nos dois chats. */
export const ChatSessionRefSchema = z.object({ sessionId: z.uuid() })
export type ChatSessionRef = z.infer<typeof ChatSessionRefSchema>

export const RenameChatSessionSchema = z.object({
	sessionId: z.uuid(),
	title: ChatSessionTitleSchema,
})
export type RenameChatSession = z.infer<typeof RenameChatSessionSchema>

// ── Chat de analytics ────────────────────────────────────────────────────────

export const CreateAnalyticsChatSessionSchema = z.object({ title: ChatSessionTitleSchema })
export type CreateAnalyticsChatSession = z.infer<typeof CreateAnalyticsChatSessionSchema>

export const SaveAnalyticsChatMessageSchema = z
	.object({
		sessionId: z.uuid(),
		role: z.enum(["user", "assistant"]),
		content: ChatContentSchema,
		chart: ChatJsonSchema.optional(),
		chartTypeOverride: ChartTypeSchema.optional(),
		error: ChatErrorSchema.optional(),
		// Observabilidade
		model: ChatLabelSchema.optional(),
		latencyMs: z.number().int().nonnegative().optional(),
		langsmithRunId: ChatLabelSchema.optional(),
		inputTokens: z.number().int().nonnegative().optional(),
		outputTokens: z.number().int().nonnegative().optional(),
	})
	// Espelha o CHECK `analytics_chat_message_has_payload`: mensagem sem conteúdo, gráfico
	// nem erro é linha vazia no histórico — reprovar aqui dá mensagem, o CHECK dá 23514.
	.superRefine((data, ctx) => {
		const hasContent = data.content.trim().length > 0
		const hasChart = data.chart != null
		const hasError = Boolean(data.error?.trim())

		if (data.role === "user" && !hasContent) {
			ctx.addIssue({ code: "custom", path: ["content"], message: "Mensagem do usuário não pode ser vazia" })
		}

		if (data.role === "assistant" && !hasContent && !hasChart && !hasError) {
			ctx.addIssue({ code: "custom", path: ["content"], message: "Mensagem do assistente precisa ter conteúdo, gráfico ou erro" })
		}
	})
export type SaveAnalyticsChatMessage = z.infer<typeof SaveAnalyticsChatMessageSchema>

export const UpdateMessageChartTypeSchema = z.object({
	messageId: z.uuid(),
	chartTypeOverride: ChartTypeSchema,
})
export type UpdateMessageChartType = z.infer<typeof UpdateMessageChartTypeSchema>

// ── Chat agêntico por módulo ─────────────────────────────────────────────────

export const ListModuleChatSessionsSchema = z.object({
	module: ChatModuleSchema,
	scopeId: z.number().int().positive().optional(),
})
export type ListModuleChatSessions = z.infer<typeof ListModuleChatSessionsSchema>

export const CreateModuleChatSessionSchema = z.object({
	title: ChatSessionTitleSchema,
	module: ChatModuleSchema,
	scopeId: z.number().int().positive().optional(),
})
export type CreateModuleChatSession = z.infer<typeof CreateModuleChatSessionSchema>

/** Status em que uma chamada de ferramenta do chat agêntico terminou e pode ir ao histórico. */
export const MODULE_CHAT_TERMINAL_TOOL_STATUSES = ["done", "error", "denied"] as const
export type ModuleChatTerminalToolStatus = (typeof MODULE_CHAT_TERMINAL_TOOL_STATUSES)[number]

export const SaveModuleChatMessageSchema = z
	.object({
		sessionId: z.uuid(),
		role: z.enum(["user", "assistant", "tool"]),
		content: ChatContentSchema,
		toolCalls: ChatJsonSchema.optional(),
		toolCallId: ChatLabelSchema.optional(),
		toolName: ChatLabelSchema.optional(),
		toolResult: ChatJsonSchema.optional(),
		error: ChatErrorSchema.optional(),
		// Observabilidade
		model: ChatLabelSchema.optional(),
		latencyMs: z.number().int().nonnegative().optional(),
		langsmithRunId: ChatLabelSchema.optional(),
		inputTokens: z.number().int().nonnegative().optional(),
		outputTokens: z.number().int().nonnegative().optional(),
	})
	// Espelha o CHECK `module_chat_message_has_payload`. A chamada de ferramenta só conta
	// como payload quando TERMINOU (`done`/`error`/`denied`): gravar uma ainda em `calling`
	// ou esperando aprovação deixaria no histórico uma linha que nunca resolve. `denied` é a
	// ação de escrita que o usuário recusou no chat — terminou, sem executar.
	.superRefine((data, ctx) => {
		const hasContent = data.content.trim().length > 0
		const hasError = Boolean(data.error?.trim())
		const hasToolResult = data.toolResult != null
		const hasTerminalToolCall =
			Array.isArray(data.toolCalls) &&
			data.toolCalls.some((tc: unknown) => {
				if (!tc || typeof tc !== "object") return false
				const status = (tc as { status?: unknown }).status
				return typeof status === "string" && MODULE_CHAT_TERMINAL_TOOL_STATUSES.includes(status as ModuleChatTerminalToolStatus)
			})

		if (data.role === "user" && !hasContent) {
			ctx.addIssue({ code: "custom", path: ["content"], message: "Mensagem do usuário não pode ser vazia" })
		}

		if (data.role === "assistant" && !hasContent && !hasTerminalToolCall && !hasError) {
			ctx.addIssue({ code: "custom", path: ["content"], message: "Mensagem do assistente precisa ter conteúdo, ferramenta concluída ou erro" })
		}

		if (data.role === "tool" && !hasContent && !hasToolResult && !hasError) {
			ctx.addIssue({ code: "custom", path: ["content"], message: "Mensagem de ferramenta precisa ter conteúdo, resultado ou erro" })
		}
	})
export type SaveModuleChatMessage = z.infer<typeof SaveModuleChatMessageSchema>
