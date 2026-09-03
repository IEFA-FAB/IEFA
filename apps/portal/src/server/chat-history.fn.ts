/**
 * @module chat-history.fn
 * Histórico da conversa de um documento.
 *
 * Só documento SALVO tem histórico: enquanto é rascunho de navegador, a conversa é de
 * memória. E o histórico morre com o documento — ele guarda pedido em linguagem natural,
 * às vezes mais revelador que o expediente, e não há razão para sobreviver ao que ajudou
 * a construir.
 *
 * O dono vem da sessão e entra em toda consulta: o `document_id` é do cliente e não prova
 * nada sozinho.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireUserId } from "@/lib/auth.server"
import { getDocumentsServerClient } from "@/lib/supabase.server"

export interface ChatHistoryMessage {
	role: "user" | "assistant"
	content: string
}

export const loadChatHistoryFn = createServerFn({ method: "POST" })
	.validator(z.object({ documentId: z.uuid() }))
	.handler(async ({ data }): Promise<ChatHistoryMessage[]> => {
		const userId = await requireUserId()
		const { data: rows, error } = await getDocumentsServerClient()
			.from("chat_message")
			.select("role, content")
			.eq("document_id", data.documentId)
			.eq("owner_id", userId)
			.order("created_at", { ascending: true })
			.limit(200)
		if (error) throw new Error(error.message)
		return (rows ?? []) as ChatHistoryMessage[]
	})

export const appendChatHistoryFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			documentId: z.uuid(),
			messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(20_000) })).max(10),
		})
	)
	.handler(async ({ data }) => {
		const userId = await requireUserId()

		// O documento precisa ser do chamador: sem isto, um id alheio penduraria mensagens
		// na conversa de outra pessoa — a FK aceitaria, e só o dono do documento veria.
		const { data: owned, error: lookupError } = await getDocumentsServerClient()
			.from("official_document")
			.select("id")
			.eq("id", data.documentId)
			.eq("owner_id", userId)
			.is("deleted_at", null)
			.maybeSingle()
		if (lookupError) throw new Error(lookupError.message)
		if (!owned) return { saved: 0 }

		const { error } = await getDocumentsServerClient()
			.from("chat_message")
			.insert(data.messages.map((message) => ({ ...message, document_id: data.documentId, owner_id: userId })))
		if (error) throw new Error(error.message)
		return { saved: data.messages.length }
	})
