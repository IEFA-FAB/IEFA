/**
 * Module tool registry — maps module → tools + system prompt, filtered by user permission level.
 */

import type { ChatModule } from "@/types/domain/module-chat"
import { GLOBAL_SYSTEM_PROMPT } from "../prompts/global"
import { KITCHEN_SYSTEM_PROMPT } from "../prompts/kitchen"
import { UNIT_SYSTEM_PROMPT } from "../prompts/unit"
import { globalTools } from "./global"
import { kitchenTools } from "./kitchen"
import type { ModuleToolDefinition } from "./shared"
import { unitTools } from "./unit"

interface ModuleConfig {
	systemPrompt: string
	tools: ModuleToolDefinition[]
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
 * Returns the system prompt and permission-filtered tools for a module.
 * Tools with requiredLevel > userLevel are excluded from the LLM tool set.
 */
export function getModuleConfig(module: ChatModule, userLevel: number): ModuleConfig {
	const allTools = MODULE_TOOLS[module] ?? []
	const filteredTools = allTools.filter((t) => t.requiredLevel <= userLevel)

	return {
		systemPrompt: MODULE_PROMPTS[module],
		tools: filteredTools,
	}
}

/**
 * Finds a tool handler by name from the full (unfiltered) tool registry for a module.
 * Used by the stream handler to execute tool calls.
 */
export function findToolHandler(module: ChatModule, toolName: string): ModuleToolDefinition | undefined {
	return MODULE_TOOLS[module]?.find((t) => t.name === toolName)
}
