/**
 * @module module-chat-action.fn
 * Descrição da ação de escrita que o chat dos módulos pede para aprovar: troca o UUID do
 * argumento pelo que o usuário reconhece (receita, cardápio, anexo quantitativo). Só leitura.
 *
 * Auth: sessão + leitura no módulo da conversa e no escopo da rota, como a rota do stream; a
 * entidade resolvida passa de novo pelo PBAC e pelo escopo em `describeChatAction`. Falha de
 * descrição não é erro: volta `unavailable` e o cartão mostra a ação sem ela.
 * @domain app
 */

import { hasPermission } from "@iefa/pbac"
import { ChatModuleSchema } from "@iefa/sisub-domain/schemas"
import type { PermissionScope } from "@iefa/sisub-domain/types"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { createChatActionReader } from "@/lib/module-chat/action-reader.server"
import { type ChatActionDescription, describeChatAction, UNAVAILABLE } from "@/lib/module-chat/describe-action"

const DescribeChatActionSchema = z.object({
	module: ChatModuleSchema,
	scopeId: z.number().int().positive().optional(),
	toolName: z.string().min(1).max(64),
	args: z.record(z.string(), z.unknown()),
})

/** Escopo da rota no formato do PBAC — o mesmo cálculo de `module-chat/stream.post.ts`. */
function routeScope(module: z.infer<typeof ChatModuleSchema>, scopeId: number | undefined): PermissionScope | undefined {
	if (scopeId == null) return undefined
	if (module === "kitchen") return { type: "kitchen", id: scopeId }
	if (module === "unit" || module === "local-analytics") return { type: "unit", id: scopeId }
	return undefined
}

export const describeChatActionFn = createServerFn({ method: "GET" })
	.validator(DescribeChatActionSchema)
	.handler(async ({ data }): Promise<ChatActionDescription> => {
		const ctx = await requireAuthWithPermission(data.module, 1, routeScope(data.module, data.scopeId))
		try {
			return await describeChatAction(
				{ toolName: data.toolName, args: data.args },
				{
					module: data.module,
					scopeId: data.scopeId,
					canRead: (module, scope) => hasPermission(ctx.permissions, module, 1, scope),
				},
				createChatActionReader()
			)
		} catch (error) {
			// biome-ignore lint/suspicious/noConsole: server-side error logging
			console.error("[describeChatActionFn]", error instanceof Error ? error.message : error)
			return UNAVAILABLE
		}
	})
