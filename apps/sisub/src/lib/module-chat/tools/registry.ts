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

/**
 * Returns the system prompt and permission-filtered TanStack AI tools for a module.
 * Tools with requiredLevel > userLevel are excluded from the LLM tool set.
 * ToolContext is injected via closure so each request gets its own auth/supabase.
 */
export function getModuleConfig(module: ChatModule, userLevel: number, toolCtx: ToolContext): ModuleConfig {
	const allTools = MODULE_TOOLS[module] ?? []
	const filteredDefs = allTools.filter((t) => t.requiredLevel <= userLevel)

	return {
		systemPrompt: MODULE_PROMPTS[module],
		tools: filteredDefs.map((def) => wrapTool(def, toolCtx)),
	}
}
