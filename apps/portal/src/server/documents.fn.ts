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
import { DocumentoPayloadSchema } from "@/lib/comaer/schema"
import { getDocumentsServerClient } from "@/lib/supabase.server"

export interface DocumentoResumo {
	id: string
	especie: string
	titulo: string | null
	ambito: string
	sigilo: string
	updated_at: string
}

/** Título da lista: o assunto é a ementa (art. 37), e é assim que o redator reconhece o documento. */
function tituloDe(payload: z.infer<typeof DocumentoPayloadSchema>): string | null {
	const assunto = payload.assunto?.trim()
	if (assunto) return assunto.slice(0, 200)
	const primeiro = payload.paragrafos[0]?.texto.trim()
	return primeiro ? primeiro.slice(0, 200) : null
}

/** Erro do usuário, não do servidor: o Start só preserva o status via `setResponseStatus`. */
function naoEncontrado(): never {
	setResponseStatus(404)
	throw new Error("Documento não encontrado.")
}

export const listDocumentsFn = createServerFn({ method: "GET" }).handler(async (): Promise<DocumentoResumo[]> => {
	const userId = await requireUserId()
	const { data, error } = await getDocumentsServerClient()
		.from("official_document")
		.select("id, especie, titulo, ambito, sigilo, updated_at")
		.eq("owner_id", userId)
		.is("deleted_at", null)
		.order("updated_at", { ascending: false })
		.limit(100)
	if (error) throw new Error(error.message)
	return (data ?? []) as DocumentoResumo[]
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
		if (!linha) naoEncontrado()

		// `parse` cru transformaria qualquer aperto futuro do schema em documento
		// permanentemente inabrível, com um erro de Zod na cara do usuário. O `safeParse`
		// troca isso por uma mensagem que diz o que aconteceu — e o payload continua no
		// banco, intacto, para ser migrado.
		const payload = DocumentoPayloadSchema.safeParse(linha.payload)
		if (!payload.success) {
			setResponseStatus(422)
			throw new Error("Este documento foi salvo em um formato que a versão atual não abre. Ele continua guardado — avise a equipe do portal.")
		}
		return { id: linha.id as string, payload: payload.data }
	})

export const saveDocumentFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.uuid().optional(), payload: DocumentoPayloadSchema }))
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const { payload } = data
		const colunas = {
			especie: payload.especie,
			ambito: payload.ambito,
			sigilo: payload.sigilo,
			titulo: tituloDe(payload),
			payload,
		}
		const db = getDocumentsServerClient()

		if (data.id) {
			// O `owner_id` entra no WHERE, não no SET: quem não é dono não atualiza, e a
			// ausência de linha afetada é a própria negativa — sem SELECT prévio, sem janela
			// entre checar e escrever.
			const { data: linha, error } = await db
				.from("official_document")
				.update(colunas)
				.eq("id", data.id)
				.eq("owner_id", userId)
				.is("deleted_at", null)
				.select("id")
				.maybeSingle()
			if (error) throw new Error(error.message)
			if (!linha) naoEncontrado()
			return { id: linha.id as string }
		}

		const { data: linha, error } = await db
			.from("official_document")
			.insert({ ...colunas, owner_id: userId })
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
		if (!linha) naoEncontrado()
		return { id: linha.id as string }
	})
