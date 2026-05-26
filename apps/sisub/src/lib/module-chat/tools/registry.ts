/**
 * Module tool registry — maps module → tools + system prompt, filtered by user permission level.
 */

import type { ServerTool } from "@tanstack/ai"
import type { ChatModule } from "@/types/domain/module-chat"
import { GLOBAL_SYSTEM_PROMPT } from "../prompts/global"
import { KITCHEN_SYSTEM_PROMPT } from "../prompts/kitchen"
import { UNIT_SYSTEM_PROMPT } from "../prompts/unit"
import { globalTools } from "./global"
import { kitchenTools } from "./kitchen"
import type { ModuleToolDefinition, ToolContext } from "./shared"
import { wrapTool } from "./shared"
import { unitTools } from "./unit"

interface ModuleConfig {
	systemPrompt: string
	tools: ServerTool[]
}

const MODULE_TOOLS: Record<ChatModule, ModuleToolDefinition[]> = {
	global: globalTools,
	kitchen: kitchenTools,
	unit: unitTools,
}

const MODULE_PROMPTS: Record<ChatModule, string> = {
	global: GLOBAL_SYSTEM_PROMPT,
	kitchen: KITCHEN_SYSTEM_PROMPT,
	unit: UNIT_SYSTEM_PROMPT,
}

function scopedSystemPrompt(module: ChatModule, basePrompt: string, toolCtx: ToolContext): string {
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
	}
}
