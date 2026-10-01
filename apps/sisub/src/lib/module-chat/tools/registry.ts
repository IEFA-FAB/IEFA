/**
 * Module tool registry — maps module → tools + system prompt, filtered by user permission level.
 */

import type { AnyServerTool } from "@tanstack/ai"
import type { ChatModule } from "@/types/domain/module-chat"
import { ANSWER_STYLE_PROMPT } from "../prompts/answer-style"
import { GLOBAL_SYSTEM_PROMPT } from "../prompts/global"
import { KITCHEN_SYSTEM_PROMPT } from "../prompts/kitchen"
import { LOCAL_ANALYTICS_SYSTEM_PROMPT } from "../prompts/local-analytics"
import { UNIT_SYSTEM_PROMPT } from "../prompts/unit"
import { globalTools } from "./global"
import { kitchenTools } from "./kitchen"
import { localAnalyticsTools } from "./local-analytics"
import type { ModuleToolDefinition, ToolContext } from "./shared"
import { parseToolArgs, requiresApproval, wrapTool } from "./shared"
import { unitTools } from "./unit"

interface ModuleConfig {
	systemPrompt: string
	tools: AnyServerTool[]
	/**
	 * Tools desta conversa que exigem aprovação humana. A rota usa o conjunto para decidir
	 * qual call pendente do histórico pode sobreviver à higiene (`sanitizeClientMessages`).
	 */
	approvalToolNames: ReadonlySet<string>
}

const MODULE_TOOLS: Record<ChatModule, ModuleToolDefinition[]> = {
	global: globalTools,
	kitchen: kitchenTools,
	unit: unitTools,
	"local-analytics": localAnalyticsTools,
}

function listApprovalToolNames(defs: readonly ModuleToolDefinition[]): ReadonlySet<string> {
	return new Set(defs.filter(requiresApproval).map((def) => def.name))
}

/**
 * Tools de escrita (as que exigem aprovação humana) de cada módulo, sem o filtro de nível do
 * usuário. A descrição do cartão de aprovação (`describe-action.ts`) lê daqui, em vez de manter
 * uma lista própria que divergiria quando uma tool de escrita nova entrasse.
 */
export const APPROVAL_TOOL_NAMES_BY_MODULE = Object.fromEntries(
	Object.entries(MODULE_TOOLS).map(([module, defs]) => [module, listApprovalToolNames(defs)])
) as Readonly<Record<ChatModule, ReadonlySet<string>>>

/** Todas as tools de escrita do chat, em qualquer módulo — as que exigem aprovação humana. */
export const APPROVAL_TOOL_NAMES: ReadonlySet<string> = new Set(Object.values(APPROVAL_TOOL_NAMES_BY_MODULE).flatMap((names) => [...names]))

/**
 * Argumentos de uma tool de escrita do módulo exatamente como o `wrapTool` os entrega ao handler
 * (`parseToolArgs`: os `null` de ausência fora, depois o `parseArgs` da tool). É por aqui que o
 * cartão de aprovação valida e descreve a ação, sem schema próprio.
 *
 * `undefined` quando a tool não é de escrita neste módulo. Argumento inválido lança o mesmo erro
 * que a tool lançaria (`ToolValidationError`, já com o `ZodError` convertido).
 */
export function parseApprovalToolArgs(module: ChatModule, toolName: string, raw: Record<string, unknown>): Record<string, unknown> | undefined {
	const def = MODULE_TOOLS[module]?.find((candidate) => candidate.name === toolName && requiresApproval(candidate))
	return def ? parseToolArgs(def, raw) : undefined
}

const MODULE_PROMPTS: Record<ChatModule, string> = {
	global: GLOBAL_SYSTEM_PROMPT,
	kitchen: KITCHEN_SYSTEM_PROMPT,
	unit: UNIT_SYSTEM_PROMPT,
	"local-analytics": LOCAL_ANALYTICS_SYSTEM_PROMPT,
}

/**
 * As regras de apresentação valem para os quatro módulos — o modelo transcreve o JSON da
 * tool em qualquer um deles. Ficam no fim, depois do escopo da rota, para serem a última
 * coisa que o modelo lê antes da conversa.
 */
function scopedSystemPrompt(module: ChatModule, basePrompt: string, toolCtx: ToolContext): string {
	return `${routeScopedPrompt(module, basePrompt, toolCtx)}

${ANSWER_STYLE_PROMPT}`
}

function routeScopedPrompt(module: ChatModule, basePrompt: string, toolCtx: ToolContext): string {
	if (module === "unit" && toolCtx.scopeId != null) {
		return `${basePrompt}

## Escopo obrigatório da rota
- Esta conversa está dentro da unidade de ID ${toolCtx.scopeId}.
- Para ferramentas de unidade, use sempre a unidade atual da rota.
- Não peça, não invente e não mencione outro ID de unidade como se tivesse sido informado pelo usuário.`
	}

	if (module === "kitchen" && toolCtx.scopeId != null) {
		return `${basePrompt}

## Escopo obrigatório da rota
- Esta conversa está dentro da cozinha de ID ${toolCtx.scopeId}.
- Para ferramentas de cozinha, use sempre a cozinha atual da rota.
- Não peça, não invente e não mencione outro ID de cozinha como se tivesse sido informado pelo usuário.`
	}

	if (module === "local-analytics" && toolCtx.scopeId != null) {
		return `${basePrompt}

## Escopo obrigatório da rota
- Esta conversa está dentro da unidade de ID ${toolCtx.scopeId}.
- Para todas as ferramentas, use sempre a unidade atual da rota.
- Não peça, não invente e não mencione outro ID de unidade como se tivesse sido informado pelo usuário.`
	}

	return basePrompt
}

/**
 * Returns the system prompt and permission-filtered TanStack AI tools for a module.
 * Tools with requiredLevel > userLevel are excluded from the LLM tool set.
 * ToolContext is injected via closure so each request gets its own auth/supabase.
 */
export function getModuleConfig(module: ChatModule, userLevel: number, toolCtx: ToolContext): ModuleConfig {
	const allTools = MODULE_TOOLS[module] ?? []
	const filteredDefs = allTools.filter((t) => t.requiredLevel <= userLevel)

	return {
		systemPrompt: scopedSystemPrompt(module, MODULE_PROMPTS[module], toolCtx),
		tools: filteredDefs.map((def) => wrapTool(def, toolCtx)),
		approvalToolNames: listApprovalToolNames(filteredDefs),
	}
}
