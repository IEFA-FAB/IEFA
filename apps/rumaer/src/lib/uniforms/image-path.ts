/**
 * Caminho de imagem de uniforme no bucket `rumaer-uniforms`.
 *
 * O caminho é DERIVADO dos ids — nunca texto livre do cliente:
 *   - imagem base da variante: `<uniform_id>/<variant_id>.<ext>`
 *   - look (variante + peça):  `<uniform_id>/<variant_id>__<piece_id>.<ext>`
 *
 * Antes o upload assinava qualquer `filePath` e as variantes gravavam qualquer
 * `image_path`: um editor subia `.svg`/`.html` em qualquer lugar do bucket, ou apontava
 * a variante para um objeto alheio — que passava a ser assinável pelo download público
 * (que só assina caminho catalogado) e apagável pela limpeza de órfãos.
 *
 * Só png, jpeg e webp — o mesmo recorte que o bucket aceita (migration 20260921160200).
 * Puro: usado pela tela de upload e pelas server functions.
 */

/** Extensão gravada por tipo MIME. O `file.name` não decide nada: é texto do usuário. */
export const IMAGE_EXTENSION_BY_MIME = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
} as const

export type ImageMime = keyof typeof IMAGE_EXTENSION_BY_MIME

export const ACCEPTED_IMAGE_MIMES = Object.keys(IMAGE_EXTENSION_BY_MIME) as ImageMime[]

export const UNSUPPORTED_IMAGE_MESSAGE = "Formato não aceito. Envie uma imagem PNG, JPEG ou WebP."

/** Teto do bucket por arquivo (migration 20260921160200). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export const IMAGE_TOO_LARGE_MESSAGE = "Imagem acima de 10 MB. Reduza o arquivo e envie de novo."

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

/** `jpe?g`: o servidor aceita `.jpeg` também, mas a tela sempre grava `.jpg`. */
export const IMAGE_PATH_PATTERN = new RegExp(`^(${UUID})/(${UUID})(?:__(${UUID}))?\\.(png|jpe?g|webp)$`)

/** A extensão a gravar para o arquivo, pelo tipo; `null` quando o formato não é aceito. */
export function imageExtensionFor(mime: string): (typeof IMAGE_EXTENSION_BY_MIME)[ImageMime] | null {
	return (IMAGE_EXTENSION_BY_MIME as Record<string, (typeof IMAGE_EXTENSION_BY_MIME)[ImageMime]>)[mime] ?? null
}

export function variantImagePath(uniformId: string, variantId: string, ext: string): string {
	return `${uniformId}/${variantId}.${ext}`
}

export function lookImagePath(uniformId: string, variantId: string, pieceId: string, ext: string): string {
	return `${uniformId}/${variantId}__${pieceId}.${ext}`
}

export type ParsedImagePath = { uniformId: string; variantId: string; pieceId: string | null; ext: string }

/** Decompõe um caminho no formato acima; `null` se não for um. */
export function parseImagePath(path: string): ParsedImagePath | null {
	const match = IMAGE_PATH_PATTERN.exec(path)
	if (!match) return null
	const [, uniformId, variantId, pieceId, ext] = match
	return { uniformId, variantId, pieceId: pieceId ?? null, ext }
}

/**
 * O caminho é o da PRÓPRIA variante (ou do próprio look)? `pieceId` ausente/nulo exige o
 * caminho da imagem base; presente, o do look daquela peça.
 */
export function isOwnImagePath(path: string, owner: { uniformId: string; variantId: string; pieceId?: string | null }): boolean {
	const parsed = parseImagePath(path)
	if (!parsed) return false
	return parsed.uniformId === owner.uniformId && parsed.variantId === owner.variantId && parsed.pieceId === (owner.pieceId ?? null)
}
