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
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { createChatActionReader } from "@/lib/module-chat/action-reader.server"
import { type ChatActionDescription, describeChatAction, UNAVAILABLE } from "@/lib/module-chat/describe-action"
import { resolveRouteScope } from "@/lib/module-chat/tools/shared"

const DescribeChatActionSchema = z.object({
	module: ChatModuleSchema,
	scopeId: z.number().int().positive().optional(),
	toolName: z.string().min(1).max(64),
	args: z.record(z.string(), z.unknown()),
})

export const describeChatActionFn = createServerFn({ method: "GET" })
	.validator(DescribeChatActionSchema)
	.handler(async ({ data }): Promise<ChatActionDescription> => {
		const ctx = await requireAuthWithPermission(data.module, 1, resolveRouteScope(data.module, data.scopeId))
		try {
			return await describeChatAction(
				{ toolName: data.toolName, args: data.args },
				{
					module: data.module,
					scopeId: data.scopeId,
					hasReadPermission: (module, scope) => hasPermission(ctx.permissions, module, 1, scope),
				},
				createChatActionReader()
			)
		} catch (error) {
			// biome-ignore lint/suspicious/noConsole: server-side error logging
			console.error("[describeChatActionFn]", error instanceof Error ? error.message : error)
			return UNAVAILABLE
		}
	})
