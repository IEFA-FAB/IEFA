/**
 * @module storage.fn
 * Signed URLs para imagens dos uniformes (bucket privado rumaer-uniforms).
 * Download: qualquer um (a app é read-only pública).
 * Upload: exige grant `rumaer` nível 2 (requireUniformEditor) — não basta estar logado.
 */

import { createServerFn } from "@tanstack/react-start"
import { setResponseStatus } from "@tanstack/react-start/server"
import { z } from "zod"
import { requireUniformEditor } from "@/lib/auth.server"
import { getRumaerServerClient } from "@/lib/supabase.server"

const BUCKET = "rumaer-uniforms"

/**
 * O download é público de propósito (a app é uma consulta aberta de uniformes), mas
 * assinar QUALQUER caminho que chegue no payload transforma isto num oráculo de
 * assinatura para o bucket inteiro — inclusive rascunhos ainda não publicados e
 * qualquer arquivo que venha a ser guardado lá. Só caminhos que constam como imagem
 * de uma variante são assináveis.
 */
async function assertKnownImagePath(imagePath: string): Promise<void> {
	const supabase = getRumaerServerClient()
	const [variant, image] = await Promise.all([
		supabase.from("uniform_variant").select("id").eq("image_path", imagePath).limit(1).maybeSingle(),
		supabase.from("uniform_variant_image").select("id").eq("image_path", imagePath).limit(1).maybeSingle(),
	])
	if (!variant.data && !image.data) {
		setResponseStatus(404)
		throw new Error("Imagem não encontrada.")
	}
}

// Download público, porém restrito a imagens catalogadas — ver assertKnownImagePath.
// nosemgrep: server-fn-missing-auth-guard
export const getSignedImageUrlFn = createServerFn({ method: "GET" })
	.validator(z.object({ imagePath: z.string().min(1), expiresIn: z.number().optional() }))
	.handler(async ({ data }): Promise<string> => {
		await assertKnownImagePath(data.imagePath)
		const { data: result, error } = await getRumaerServerClient()
			.storage.from(BUCKET)
			.createSignedUrl(data.imagePath, data.expiresIn ?? 3600)
		if (error) throw new Error(error.message)
		return result.signedUrl
	})

/**
 * URLs assinadas de todas as imagens de um uniforme (base das variantes + looks),
 * deduplicadas, ordenadas e assinadas em lote — 1 round-trip para o slideshow de preview.
 */
// Público (mesma leitura do catálogo), e os caminhos vêm do próprio banco — o payload
// só informa o id do uniforme, nunca um path arbitrário.
// nosemgrep: server-fn-missing-auth-guard
export const getUniformPreviewImagesFn = createServerFn({ method: "GET" })
	.validator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }): Promise<string[]> => {
		const supabase = getRumaerServerClient()

		const { data: variants, error } = await supabase
			.from("uniform_variant")
			.select("image_path, ordem, images:uniform_variant_image(image_path, ordem)")
			.eq("uniform_id", data.id)
			.order("ordem", { ascending: true })
		if (error) throw new Error(error.message)

		const paths: string[] = []
		for (const v of variants ?? []) {
			if (v.image_path) paths.push(v.image_path)
			for (const img of [...(v.images ?? [])].sort((a, b) => a.ordem - b.ordem)) {
				if (img.image_path) paths.push(img.image_path)
			}
		}
		const unique = [...new Set(paths)]
		if (unique.length === 0) return []

		const { data: signed, error: signError } = await supabase.storage.from(BUCKET).createSignedUrls(unique, 3600)
		if (signError) throw new Error(signError.message)
		return (signed ?? []).map((s) => s.signedUrl).filter((url): url is string => !!url)
	})

export const getSignedUploadUrlFn = createServerFn({ method: "POST" })
	.validator(z.object({ filePath: z.string().min(1) }))
	.handler(async ({ data }) => {
		// Upload é operação de edição — exige grant rumaer nível 2 (não basta estar logado).
		await requireUniformEditor()
		const { data: result, error } = await getRumaerServerClient().storage.from(BUCKET).createSignedUploadUrl(data.filePath)
		if (error) throw new Error(error.message)
		return result // { signedUrl, token, path }
	})
