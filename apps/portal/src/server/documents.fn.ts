/**
 * @module documents.fn
 * Persistência das comunicações oficiais no schema `documents`.
 *
 * O dono é sempre lido da SESSÃO e nunca do payload, e toda leitura/escrita filtra por
 * `owner_id`. Isso importa mais aqui do que a assinatura sugere: o client é service role
 * e bypassa RLS, e `/_serverFn/<id>` é endpoint HTTP cru — o `beforeLoad` da rota protege
 * a navegação, não o endpoint. Sem o filtro, um id de documento alheio bastaria.
 */

import { createServerFn } from "@tanstack/react-start"
import { setResponseStatus } from "@tanstack/react-start/server"
import { z } from "zod"
import { requireUserId } from "@/lib/auth.server"
import { DocumentPayloadSchema } from "@/lib/comaer/schema"
import { getDocumentsServerClient } from "@/lib/supabase.server"

export interface DocumentSummary {
	id: string
	kind: string
	title: string | null
	scope: string
	classification: string
	updated_at: string
}

/** Título da lista: o assunto é a ementa (art. 37), e é assim que o redator reconhece o documento. */
function titleOf(payload: z.infer<typeof DocumentPayloadSchema>): string | null {
	const subject = payload.subject?.trim()
	if (subject) return subject.slice(0, 200)
	const primeiro = payload.paragraphs[0]?.text.trim()
	return primeiro ? primeiro.slice(0, 200) : null
}

/** Erro do usuário, não do servidor: o Start só preserva o status via `setResponseStatus`. */
function notFound(): never {
	setResponseStatus(404)
	throw new Error("Documento não encontrado.")
}

export const listDocumentsFn = createServerFn({ method: "GET" }).handler(async (): Promise<DocumentSummary[]> => {
	const userId = await requireUserId()
	const { data, error } = await getDocumentsServerClient()
		.from("official_document")
		.select("id, kind, title, scope, classification, updated_at")
		.eq("owner_id", userId)
		.is("deleted_at", null)
		.order("updated_at", { ascending: false })
		.limit(100)
	if (error) throw new Error(error.message)
	return (data ?? []) as DocumentSummary[]
})

export const loadDocumentFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const { data: linha, error } = await getDocumentsServerClient()
			.from("official_document")
			.select("id, payload")
			.eq("id", data.id)
			.eq("owner_id", userId)
			.is("deleted_at", null)
			.maybeSingle()
		if (error) throw new Error(error.message)
		// Documento de outro dono e documento inexistente respondem igual: distinguir os
		// dois transformaria a rota num verificador de existência de id alheio.
		if (!linha) notFound()

		// `parse` cru transformaria qualquer aperto futuro do schema em documento
		// permanentemente inabrível, com um erro de Zod na cara do usuário. O `safeParse`
		// troca isso por uma mensagem que diz o que aconteceu — e o payload continua no
		// banco, intacto, para ser migrado.
		const payload = DocumentPayloadSchema.safeParse(linha.payload)
		if (!payload.success) {
			setResponseStatus(422)
			throw new Error("Este documento foi salvo em um formato que a versão atual não abre. Ele continua guardado — avise a equipe do portal.")
		}
		return { id: linha.id as string, payload: payload.data }
	})

export const saveDocumentFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.uuid().optional(), payload: DocumentPayloadSchema }))
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const { payload } = data
		const columns = {
			kind: payload.kind,
			scope: payload.scope,
			classification: payload.classification,
			title: titleOf(payload),
			payload,
		}
		const db = getDocumentsServerClient()

		if (data.id) {
			// O `owner_id` entra no WHERE, não no SET: quem não é dono não atualiza, e a
			// ausência de linha afetada é a própria negativa — sem SELECT prévio, sem janela
			// entre checar e escrever.
			const { data: linha, error } = await db
				.from("official_document")
				.update(columns)
				.eq("id", data.id)
				.eq("owner_id", userId)
				.is("deleted_at", null)
				.select("id")
				.maybeSingle()
			if (error) throw new Error(error.message)
			if (!linha) notFound()
			return { id: linha.id as string }
		}

		const { data: linha, error } = await db
			.from("official_document")
			.insert({ ...columns, owner_id: userId })
			.select("id")
			.single()
		if (error) throw new Error(error.message)
		return { id: linha.id as string }
	})

export const deleteDocumentFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		// Exclusão lógica: o documento pode já ter virado expediente no SIGADAER, e a
		// versão que o originou é o que explica o que foi despachado.
		const { data: linha, error } = await getDocumentsServerClient()
			.from("official_document")
			.update({ deleted_at: new Date().toISOString() })
			.eq("id", data.id)
			.eq("owner_id", userId)
			.is("deleted_at", null)
			.select("id")
			.maybeSingle()
		if (error) throw new Error(error.message)
		if (!linha) notFound()

		// A conversa morre com o documento, ainda que o documento só saia de vista: ela
		// guarda pedido em linguagem natural, às vezes mais revelador que o próprio
		// expediente, e não tem por que sobreviver ao que ajudou a construir.
		await getDocumentsServerClient().from("chat_message").delete().eq("document_id", data.id).eq("owner_id", userId)
		return { id: linha.id as string }
	})
