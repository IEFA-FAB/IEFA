/**
 * Nome e caminho do arquivo submetido.
 *
 * Puro de propósito — sem Supabase, sem env — para o teste provar o caminho sem
 * fabricar credencial.
 *
 * ## Por que o nome enviado não entra no caminho do Storage
 *
 * O caminho era `${user.id}/${uuid}-${file.name}`. O `storage-js` não codifica o
 * caminho, e o `fetch` normaliza `..` na URL: um `filename="/../../../<bucket>/x.pdf"`
 * no multipart saía do prefixo do usuário e do próprio bucket, gravando com a chave
 * de serviço onde bem entendesse. O caminho agora é montado só com o que o servidor
 * controla — o id do usuário (do JWT), um UUID e a extensão derivada do MIME JÁ
 * validado. O nome original vai só para a coluna `filename`, saneado.
 */

/** MIME aceito → extensão gravada no Storage. */
export const SUBMISSION_EXTENSIONS: ReadonlyMap<string, string> = new Map([
	["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
	["application/pdf", "pdf"],
])

/** Teto do arquivo enviado. O `bodyLimit` (`body-limits.ts`) barra o corpo antes do parse. */
export const MAX_SUBMISSION_BYTES = 25 * 1024 * 1024

/** Teto do nome exibido — o limite usual de nome de arquivo em sistema de arquivos. */
export const MAX_FILENAME_LENGTH = 255

/** Caminho no bucket de submissões, ou `null` se o MIME não é aceito. */
export function buildSubmissionStoragePath(userId: string, mimeType: string, id: string = crypto.randomUUID()): string | null {
	const extension = SUBMISSION_EXTENSIONS.get(mimeType)
	if (!extension) return null
	return `${userId}/${id}.${extension}`
}

/** Controles C0/C1 e os separadores de linha/parágrafo Unicode — não pertencem a nome exibido. */
const CONTROL_CHARACTERS = /[\p{Cc}\u2028\u2029]/gu

/**
 * Nome original para exibição: só o último segmento (o browser pode mandar o caminho
 * inteiro), sem caractere de controle, com teto de tamanho. Vazio vira um nome neutro
 * com a extensão do MIME, para a tela nunca mostrar célula em branco.
 */
export function sanitizeSubmissionFilename(name: string, mimeType: string): string {
	const lastSegment = name.split(/[/\\]/).pop() ?? ""
	const cleaned = lastSegment.replace(CONTROL_CHARACTERS, "").trim()
	const truncated = [...cleaned].slice(0, MAX_FILENAME_LENGTH).join("")
	if (truncated && truncated !== "." && truncated !== "..") return truncated
	return `documento.${SUBMISSION_EXTENSIONS.get(mimeType) ?? "bin"}`
}
