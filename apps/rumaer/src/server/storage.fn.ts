/**
 * @module storage.fn
 * Signed URLs para imagens dos uniformes (bucket privado rumaer-uniforms).
 * Download: qualquer um (a app é read-only pública).
 * Upload: exige grant `rumaer` nível 2 (requireUniformEditor) — não basta estar logado.
 */

import type { CirculoHierarquico, Genero } from "@iefa/database/rumaer"
import { createServerFn } from "@tanstack/react-start"
import { setResponseStatus } from "@tanstack/react-start/server"
import { z } from "zod"
import { requireUniformEditor } from "@/lib/auth.server"
import { getRumaerServerClient } from "@/lib/supabase.server"
import { IMAGE_PATH_PATTERN, parseImagePath } from "@/lib/uniforms/image-path"

const BUCKET = "rumaer-uniforms"

/**
 * Validade da URL assinada de download, em segundos. O endpoint é público: sem teto,
 * quem chama pede `expiresIn` de anos e fica com um link permanente para a imagem —
 * que continua valendo mesmo depois de a imagem sair do catálogo.
 */
const SIGNED_URL_DEFAULT_SECONDS = 3600
const SIGNED_URL_MAX_SECONDS = 3600

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
	.validator(z.object({ imagePath: z.string().min(1), expiresIn: z.number().int().min(60).max(SIGNED_URL_MAX_SECONDS).optional() }))
	.handler(async ({ data }): Promise<string> => {
		await assertKnownImagePath(data.imagePath)
		const { data: result, error } = await getRumaerServerClient()
			.storage.from(BUCKET)
			.createSignedUrl(data.imagePath, data.expiresIn ?? SIGNED_URL_DEFAULT_SECONDS)
		if (error) throw new Error(error.message)
		return result.signedUrl
	})

/**
 * Imagem de preview de um uniforme: a URL assinada mais o gênero/círculo da
 * variante de onde ela veio. A lista da home separa o resultado por gênero, e
 * sem essa etiqueta a ilustração feminina apareceria no card masculino (as
 * imagens são peças diferentes, não recortes da mesma foto).
 */
export type UniformPreviewImage = {
	url: string
	genero: Genero
	circulo: CirculoHierarquico
	/**
	 * LQIP da imagem (data URL PNG de ~1,5 KB). Vem do mesmo SELECT que resolve os
	 * caminhos, então não custa round trip: o card já pinta a prévia borrada enquanto a
	 * imagem assinada — grande e privada — ainda está baixando. `null` em linha que ainda
	 * não passou pelo backfill ou cuja geração falhou.
	 */
	placeholder: string | null
}

/**
 * URLs assinadas de todas as imagens de um uniforme (base das variantes + looks),
 * deduplicadas por caminho, ordenadas e assinadas em lote — 1 round-trip para o
 * slideshow de preview.
 */
// Público (mesma leitura do catálogo), e os caminhos vêm do próprio banco — o payload
// só informa o id do uniforme, nunca um path arbitrário.
// nosemgrep: server-fn-missing-auth-guard
export const getUniformPreviewImagesFn = createServerFn({ method: "GET" })
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ data }): Promise<UniformPreviewImage[]> => {
		const supabase = getRumaerServerClient()

		const { data: variants, error } = await supabase
			.from("uniform_variant")
			.select("image_path, blur_placeholder, ordem, genero, circulo, images:uniform_variant_image(image_path, blur_placeholder, ordem)")
			.eq("uniform_id", data.id)
			.order("ordem", { ascending: true })
		if (error) throw new Error(error.message)

		// Um mesmo caminho pode ser reaproveitado por variantes de círculos diferentes;
		// vale a primeira ocorrência (a de menor `ordem`), que é a mais representativa.
		// O placeholder acompanha o caminho: é derivado do arquivo, não da variante.
		const byPath = new Map<string, { genero: Genero; circulo: CirculoHierarquico; placeholder: string | null }>()
		for (const v of variants ?? []) {
			const tag = { genero: v.genero, circulo: v.circulo }
			if (v.image_path && !byPath.has(v.image_path)) byPath.set(v.image_path, { ...tag, placeholder: v.blur_placeholder })
			for (const img of [...(v.images ?? [])].sort((a, b) => a.ordem - b.ordem)) {
				if (img.image_path && !byPath.has(img.image_path)) byPath.set(img.image_path, { ...tag, placeholder: img.blur_placeholder })
			}
		}
		const unique = [...byPath.keys()]
		if (unique.length === 0) return []

		const { data: signed, error: signError } = await supabase.storage.from(BUCKET).createSignedUrls(unique, SIGNED_URL_DEFAULT_SECONDS)
		if (signError) throw new Error(signError.message)

		const images: UniformPreviewImage[] = []
		for (const s of signed ?? []) {
			// `createSignedUrls` devolve na mesma ordem da entrada e ecoa o path pedido.
			const tag = s.path ? byPath.get(s.path) : undefined
			if (s.signedUrl && tag) images.push({ url: s.signedUrl, ...tag })
		}
		return images
	})

/**
 * URL de upload assinada. O caminho só pode ser o de uma imagem de variante que existe:
 * `<uniform_id>/<variant_id>(__<piece_id>)?.(png|jpg|jpeg|webp)` — ver
 * `@/lib/uniforms/image-path`. Antes qualquer `filePath` era assinado: um editor gravava
 * `.svg`/`.html` em qualquer lugar do bucket.
 */
export const getSignedUploadUrlFn = createServerFn({ method: "POST" })
	.validator(z.object({ filePath: z.string().regex(IMAGE_PATH_PATTERN, "Caminho de imagem inválido.") }))
	.handler(async ({ data }) => {
		// Upload é operação de edição — exige grant rumaer nível 2 (não basta estar logado).
		await requireUniformEditor()
		const parsed = parseImagePath(data.filePath)
		if (!parsed) {
			setResponseStatus(400)
			throw new Error("Caminho de imagem inválido.")
		}
		const supabase = getRumaerServerClient()
		const [variant, piece] = await Promise.all([
			supabase.from("uniform_variant").select("id").eq("id", parsed.variantId).eq("uniform_id", parsed.uniformId).maybeSingle(),
			parsed.pieceId ? supabase.from("piece").select("id").eq("id", parsed.pieceId).maybeSingle() : Promise.resolve(null),
		])
		if (variant.error) throw new Error(variant.error.message)
		if (piece?.error) throw new Error(piece.error.message)
		if (!variant.data || (piece && !piece.data)) {
			setResponseStatus(404)
			throw new Error("Variante ou peça não encontrada.")
		}
		// `upsert: true` na ASSINATURA: o caminho é fixo por variante/peça, e trocar a foto é
		// regravar o mesmo objeto. O `upsert` passado ao `uploadToSignedUrl` não tem efeito.
		const { data: result, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(data.filePath, { upsert: true })
		if (error) throw new Error(error.message)
		return result // { signedUrl, token, path }
	})
