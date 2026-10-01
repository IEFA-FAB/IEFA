/**
 * Utilitários dos testes das tools do chat. Só os `*.test.ts` importam este arquivo.
 */

import { type ModuleToolDefinition, runTool, type ToolContext } from "./shared"

/**
 * A tool `name` de `tools` como o `wrapTool` a roda: argumento normalizado e validado pelo
 * `parseArgs` antes do handler. Chamar `def.handler` direto pularia o crivo do argumento.
 */
export function findWrappedTool(tools: readonly ModuleToolDefinition[], name: string): ModuleToolDefinition {
	const def = tools.find((t) => t.name === name)
	if (!def) throw new Error(`tool ${name} não existe`)
	return { ...def, handler: (args: Record<string, unknown>, ctx: ToolContext) => runTool(def, args, ctx) }
}
