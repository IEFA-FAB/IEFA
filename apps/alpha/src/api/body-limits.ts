/**
 * Teto de corpo das rotas `/api/v1/*`.
 *
 * O upload tem teto de 25 MB, mas ele só era conferido DEPOIS de o multipart inteiro ser
 * lido — e o corpo que o Bun aceita vai a 128 MB. O `bodyLimit` corta no stream, antes do
 * parse. Toda outra rota recebe JSON pequeno (pergunta, triagem, parecer, trecho de regra).
 */

import type { Context, MiddlewareHandler } from "hono"
import { bodyLimit } from "hono/body-limit"
import { MAX_SUBMISSION_BYTES } from "./submission-file.ts"

/** A folga cobre o envelope do multipart e os demais campos do formulário. */
export const MAX_UPLOAD_BODY_BYTES = MAX_SUBMISSION_BYTES + 1024 * 1024

export const MAX_JSON_BODY_BYTES = 1024 * 1024

const UPLOAD_PATH = "/api/v1/submissions"

/** Anexo do chat avulso: o mesmo arquivo de até 25 MB, noutra rota. */
const CHAT_ATTACHMENT_PATH = /^\/api\/v1\/chats\/[^/]+\/attachments$/

/** Rotas de upload — só elas leem corpo acima de 1 MB. */
export function isUploadRequest(method: string, path: string): boolean {
	return method === "POST" && (path === UPLOAD_PATH || CHAT_ATTACHMENT_PATH.test(path))
}

const payloadTooLarge = (maxBytes: number) => (c: Context) => c.json({ error: "Payload Too Large", code: "BODY_TOO_LARGE", max_bytes: maxBytes }, 413)

const uploadBodyLimit = bodyLimit({ maxSize: MAX_UPLOAD_BODY_BYTES, onError: payloadTooLarge(MAX_UPLOAD_BODY_BYTES) })
const jsonBodyLimit = bodyLimit({ maxSize: MAX_JSON_BODY_BYTES, onError: payloadTooLarge(MAX_JSON_BODY_BYTES) })

/** Só os uploads (submissão e anexo do chat) levam o teto largo. */
export const requestBodyLimit: MiddlewareHandler = (c, next) => (isUploadRequest(c.req.method, c.req.path) ? uploadBodyLimit(c, next) : jsonBodyLimit(c, next))
