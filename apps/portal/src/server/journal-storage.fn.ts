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
 * O gate usa a convenção de caminho `{articleId}/v{n}/{arquivo}` (ver storage-paths.ts
 * e uploadArticleFile em lib/journal/client.ts): o primeiro segmento identifica o
 * artigo, e a autorização é a mesma do artigo — leitura para autor/revisor
 * designado/editor, escrita para autor (nos status em que ele edita) ou editor.
 * Manuscrito em avaliação é confidencial e sustenta o duplo-cego.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { forbidden, requireArticleAccess, requireArticleWriteAccess } from "@/lib/auth.server"
import { parseStoredSubmissionPath, parseSubmissionUploadPath, SUBMISSIONS_BUCKET } from "@/lib/journal/storage-paths"
import { getJournalServerClient } from "@/lib/supabase.server"

/** Storage service-role pelo kit (com os deadlines de fetch) — o schema não importa aqui. */
function getStorageClient() {
	return getJournalServerClient().storage
}

/** Teto da validade do link assinado. O valor do cliente era repassado sem limite. */
const MAX_DOWNLOAD_EXPIRES_IN = 3600

/**
 * Extrai o articleId do caminho, validado INTEIRO contra a convenção (storage-paths.ts).
 * Recusar só o `..` literal não bastava: `<A>/%2e%2e/<B>/v1/manuscript.pdf` passava pelo
 * gate do artigo A e o storage, ao normalizar a URL, assinava o manuscrito de B. O
 * default é negar, não assinar o que vier.
 */
function articleIdFromPath(path: string): string {
	const parsed = parseStoredSubmissionPath(path)
	if (!parsed) forbidden("Caminho inválido.")
	return parsed.articleId
}

/**
 * O caminho inteiro é validado (storage-paths.ts): tipo de arquivo e extensão da lista
 * que a UI oferece. E o autor só grava na versão que o fluxo dele espera — v1 enquanto
 * rascunho, v2+ quando o editor pediu revisão; sem isso o `upsert: true` deixava trocar
 * o PDF que os revisores estão avaliando. Editor grava em qualquer versão.
 */
export const getSignedUploadUrlFn = createServerFn({ method: "POST" })
	.validator(z.object({ filePath: z.string().min(1).max(200) }))
	.handler(async ({ data }) => {
		const parsed = parseSubmissionUploadPath(data.filePath)
		if (!parsed) forbidden("Arquivo não permitido: envie PDF (manuscrito), .typ/.zip (fonte) ou PDF/ZIP/CSV/PNG/JPG (suplementar).")
		const { isEditor, status } = await requireArticleWriteAccess(parsed.articleId)
		if (!isEditor) {
			const expectsFirstVersion = status === "draft"
			if (expectsFirstVersion !== (parsed.version === 1)) forbidden("Versão do arquivo não corresponde ao status da submissão.")
		}
		// `upsert: true` é decidido AQUI, na assinatura — o `upsert` que o cliente passa ao
		// `uploadToSignedUrl` não tem efeito. Sem ele, um arquivo recusado pela checagem de
		// assinatura (file-signature.server.ts) ficava no caminho fixo e nenhum reenvio o
		// substituía: o rascunho travava. Quem regrava é só o autor, no status que as
		// checagens acima já exigem.
		const { data: result, error } = await getStorageClient().from(SUBMISSIONS_BUCKET).createSignedUploadUrl(data.filePath, { upsert: true })
		if (error) throw new Error(error.message)
		return result // { signedUrl, token, path }
	})

/**
 * Leitor público (artigo publicado, sem vínculo com ele) baixa SÓ o PDF da versão
 * corrente — o mesmo `latest_pdf` de `published_articles`. Antes, o anônimo assinava
 * qualquer caminho sob `<articleId>/`: versões anteriores, fonte e suplementares, que
 * nunca foram publicados.
 */
export const getSignedDownloadUrlFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			bucket: z.string(),
			path: z.string().min(1).max(200),
			expiresIn: z.number().int().positive().max(MAX_DOWNLOAD_EXPIRES_IN).optional(),
		})
	)
	.handler(async ({ data }) => {
		// Bucket vindo do cliente é assinado só se for o de submissões: era por aqui que
		// um caminho de qualquer outro bucket do projeto podia ser assinado.
		if (data.bucket !== SUBMISSIONS_BUCKET) forbidden("Bucket não permitido.")
		const articleId = articleIdFromPath(data.path)
		const access = await requireArticleAccess(articleId)
		if (access.isPublicReader) {
			const { data: latest } = await getJournalServerClient()
				.from("article_versions")
				.select("pdf_path")
				.eq("article_id", articleId)
				.order("version_number", { ascending: false })
				.limit(1)
				.maybeSingle()
			if (!latest?.pdf_path || latest.pdf_path !== data.path) forbidden("Arquivo não publicado.")
		}
		const { data: result, error } = await getStorageClient()
			.from(SUBMISSIONS_BUCKET)
			.createSignedUrl(data.path, data.expiresIn ?? MAX_DOWNLOAD_EXPIRES_IN)
		if (error) throw new Error(error.message)
		return result.signedUrl
	})
