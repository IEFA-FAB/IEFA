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

/**
 * O caminho inteiro por uma única regex ancorada, sem nenhuma normalização antes.
 *
 * O `..` literal não era a única travessia: o storage recebe o caminho numa URL, e o
 * `fetch` normaliza `%2e%2e` (e `%2E%2E`, `..%2f`) como segmento-pai — então
 * `<A>/%2e%2e/<B>/v1/manuscript.pdf` passava pelo gate do artigo A e assinava o
 * manuscrito de B (quebra do duplo-cego); dois deles saíam do bucket. Aqui cada
 * segmento tem alfabeto fechado — UUID em minúsculas, `v<n>`, nome fixo, extensão
 * alfanumérica — e isso já exclui `%`, `\`, `.`/`..` como segmento, segmento vazio e
 * barra inicial. Nada é decodificado: o que não casa byte a byte é negado.
 */
const STORAGE_PATH =
	/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/v([1-9]\d{0,2})\/(manuscript|source|supplementary_\d{1,2})\.([A-Za-z0-9]{1,5})$/

function matchStoragePath(path: string, extensionCase: "exact" | "insensitive"): SubmissionUploadPath | null {
	const match = STORAGE_PATH.exec(path)
	if (!match) return null
	const [, articleId, version, name, rawExtension] = match
	if (extensionCase === "exact" && rawExtension !== rawExtension.toLowerCase()) return null
	const extension = rawExtension.toLowerCase()
	const kind: SubmissionFileKind = name.startsWith("supplementary_") ? "supplementary" : (name as SubmissionFileKind)
	if (!ALLOWED_EXTENSIONS[kind].includes(extension)) return null
	return { articleId, version: Number(version), kind, extension }
}

/**
 * Caminho de UPLOAD: `{articleId}/v{n}/{manuscript|source|supplementary_i}.{ext}` com
 * extensão (minúscula) permitida para o tipo; qualquer outra coisa é `null` (o chamador nega).
 */
export function parseSubmissionUploadPath(path: string): SubmissionUploadPath | null {
	return matchStoragePath(path, "exact")
}

/**
 * Caminho já GRAVADO (numa versão) ou pedido para leitura/assinatura. Mesma convenção e
 * mesmo alfabeto fechado do upload; a única folga é a caixa da extensão — antes do
 * `toLowerCase()` do `uploadArticleFile` o cliente gravava `manuscript.PDF`, e esse
 * arquivo continua precisando abrir.
 */
export function parseStoredSubmissionPath(path: string): SubmissionUploadPath | null {
	return matchStoragePath(path, "insensitive")
}

/**
 * Caminho gravado numa versão tem de morar sob o prefixo do próprio artigo E ser do tipo
 * que o campo espera (`pdf_path` é o manuscrito, `source_path` a fonte) — sem o tipo,
 * `pdf_path` podia apontar para um suplementar `.zip` e ser servido como manuscrito.
 */
export function isPathOfArticle(articleId: string, path: string, kind?: SubmissionFileKind): boolean {
	const parsed = parseStoredSubmissionPath(path)
	return parsed !== null && parsed.articleId === articleId && (kind === undefined || parsed.kind === kind)
}

/** Caminhos de uma versão, cada um com o tipo que o campo exige. */
export type VersionPaths = {
	pdfPath: string
	sourcePath?: string | null
	supplementaryPaths?: readonly string[] | null
}

/** `true` se TODOS os caminhos da versão são do artigo e do tipo certo para o campo. */
export function areVersionPathsOfArticle(articleId: string, paths: VersionPaths): boolean {
	if (!isPathOfArticle(articleId, paths.pdfPath, "manuscript")) return false
	if (paths.sourcePath && !isPathOfArticle(articleId, paths.sourcePath, "source")) return false
	return (paths.supplementaryPaths ?? []).every((path) => isPathOfArticle(articleId, path, "supplementary"))
}
