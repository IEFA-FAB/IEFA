/**
 * Teto de corpo das rotas admin que recebem arquivo (SIAFI, NF-e).
 *
 * Sem ele o corpo aceito ia ao limite do Bun (128 MB) e era lido inteiro na memória de um
 * container de 512 MB antes de qualquer validação. O `bodyLimit` corta no stream.
 *
 * Montado DEPOIS do guard do `x-admin-secret` de cada rota: sem `content-length` (corpo
 * chunked) o `bodyLimit` lê o stream até o teto para contar, e um anônimo faria o
 * processo bufferizar o corpo inteiro antes de receber o 401.
 */

import type { Context, MiddlewareHandler } from "hono"
import { bodyLimit } from "hono/body-limit"

/**
 * O sisub manda o relatório SIAFI em base64 com teto de 20 M caracteres
 * (`SIAFI_REPORT_MAX_BASE64_CHARS`) — ~15 MB decodificados.
 */
export const MAX_SIAFI_REPORT_BODY_BYTES = 16 * 1024 * 1024

/**
 * O sisub aceita XML de NF-e até 5 M caracteres (`NFE_XML_MAX_CHARS`). Em UTF-8 isso pode
 * passar de 5 MB; 16 MB cobre o pior caso plausível de acentuação.
 */
export const MAX_NFE_XML_BODY_BYTES = 16 * 1024 * 1024

export function uploadBodyLimit(maxBytes: number): MiddlewareHandler {
	return bodyLimit({
		maxSize: maxBytes,
		onError: (c: Context) => c.json({ error: `Arquivo acima do limite de ${Math.floor(maxBytes / (1024 * 1024))} MB` }, 413),
	})
}
