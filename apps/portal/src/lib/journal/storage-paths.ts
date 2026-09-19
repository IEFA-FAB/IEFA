/**
 * @module storage-paths
 * Convenção de caminho do bucket de submissões e a lista do que pode ser gravado nele.
 *
 * O upload é por signed URL: o servidor assina o CAMINHO e o navegador sobe os bytes
 * direto no storage. A única coisa que o servidor controla é, portanto, o caminho — e
 * era o cliente que decidia a extensão (`file.name.split(".").pop()`). Com isso um
 * autor gravava `manuscript.html` ou `supplementary_0.svg` no bucket que editores e
 * revisores abrem. Aqui o caminho é validado por inteiro: artigo, versão, tipo de
 * arquivo e extensão permitida para aquele tipo — a mesma lista que a UI oferece no
 * `FileUploader` do passo 4.
 *
 * Módulo puro: usado pela server fn e pelo client (que deriva o Content-Type daqui).
 */

export const SUBMISSIONS_BUCKET = "journal-submissions"

export type SubmissionFileKind = "manuscript" | "source" | "supplementary"

/** Extensões aceitas por tipo — espelho do `accept` do Step4FileUpload. */
export const ALLOWED_EXTENSIONS: Record<SubmissionFileKind, readonly string[]> = {
	manuscript: ["pdf"],
	source: ["typ", "zip"],
	supplementary: ["pdf", "zip", "csv", "png", "jpg", "jpeg"],
}

/** Content-Type gravado junto com o arquivo — derivado da extensão, nunca do navegador. */
export const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
	pdf: "application/pdf",
	typ: "text/plain",
	zip: "application/zip",
	csv: "text/csv",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
}

export type SubmissionUploadPath = {
	articleId: string
	version: number
	kind: SubmissionFileKind
	extension: string
}

const UPLOAD_PATH =
	/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/v([1-9]\d{0,2})\/(manuscript|source|supplementary_\d{1,2})\.([a-z0-9]{1,5})$/

/**
 * `{articleId}/v{n}/{manuscript|source|supplementary_i}.{ext}` com extensão permitida
 * para o tipo; qualquer outra coisa é `null` (o chamador nega).
 */
export function parseSubmissionUploadPath(path: string): SubmissionUploadPath | null {
	const match = UPLOAD_PATH.exec(path)
	if (!match) return null
	const [, articleId, version, name, extension] = match
	const kind: SubmissionFileKind = name.startsWith("supplementary_") ? "supplementary" : (name as SubmissionFileKind)
	if (!ALLOWED_EXTENSIONS[kind].includes(extension)) return null
	return { articleId, version: Number(version), kind, extension }
}

/** Caminho gravado numa versão tem de morar sob o prefixo do próprio artigo. */
export function isPathOfArticle(articleId: string, path: string): boolean {
	return path.startsWith(`${articleId}/`) && !path.includes("..")
}
