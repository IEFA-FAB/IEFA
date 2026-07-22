/**
 * @module journal-storage.fn
 * Server functions para geração de signed URLs de upload/download.
 * O upload de bytes é feito client-side via signed URL — nunca trafega pelo servidor.
 *
 * Estas fns são oráculos de assinatura: o client é service-role, então assinariam
 * QUALQUER caminho de QUALQUER bucket para quem pedisse. Sem gate, o download era
 * leitura anônima de todo o storage do projeto (não só do journal) e o upload deixava
 * qualquer um gravar no bucket de submissões.
 *
 * O gate usa a convenção de caminho `{articleId}/v{n}/{arquivo}` (ver uploadArticleFile
 * em lib/journal/client.ts): o primeiro segmento identifica o artigo, e a autorização
 * é a mesma do artigo — leitura para autor/revisor designado/editor, escrita para autor
 * ou editor. Manuscrito em avaliação é confidencial e sustenta o duplo-cego.
 */

import { createClient } from "@supabase/supabase-js"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { forbidden, requireArticleAccess, requireArticleOwnerOrEditor } from "@/lib/auth.server"
import { envServer } from "@/lib/env.server"

function getStorageClient() {
	return createClient(envServer.VITE_IEFA_SUPABASE_URL, envServer.IEFA_SUPABASE_SECRET_KEY, {
		auth: { persistSession: false },
	})
}

const SUBMISSIONS_BUCKET = "journal-submissions"

/**
 * Extrai o articleId do caminho. Rejeita `..` (escapa do prefixo pretendido) e caminho
 * sem prefixo de artigo — o default é negar, não assinar o que vier.
 */
function articleIdFromPath(path: string): string {
	if (path.includes("..")) forbidden("Caminho inválido.")
	const articleId = path.split("/")[0]
	if (!articleId) forbidden("Caminho inválido.")
	return articleId
}

export const getSignedUploadUrlFn = createServerFn({ method: "POST" })
	.validator(z.object({ filePath: z.string().min(1) }))
	.handler(async ({ data }) => {
		await requireArticleOwnerOrEditor(articleIdFromPath(data.filePath))
		const { data: result, error } = await getStorageClient().storage.from(SUBMISSIONS_BUCKET).createSignedUploadUrl(data.filePath)
		if (error) throw new Error(error.message)
		return result // { signedUrl, token, path }
	})

export const getSignedDownloadUrlFn = createServerFn({ method: "GET" })
	.validator(z.object({ bucket: z.string(), path: z.string(), expiresIn: z.number().optional() }))
	.handler(async ({ data }) => {
		// Bucket vindo do cliente é assinado só se for o de submissões: era por aqui que
		// um caminho de qualquer outro bucket do projeto podia ser assinado.
		if (data.bucket !== SUBMISSIONS_BUCKET) forbidden("Bucket não permitido.")
		await requireArticleAccess(articleIdFromPath(data.path))
		const { data: result, error } = await getStorageClient()
			.storage.from(data.bucket)
			.createSignedUrl(data.path, data.expiresIn ?? 3600)
		if (error) throw new Error(error.message)
		return result.signedUrl
	})
