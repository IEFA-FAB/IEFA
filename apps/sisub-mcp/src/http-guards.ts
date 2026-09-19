/**
 * Guardas do transporte HTTP — separadas de `index.ts` para serem testáveis sem subir o
 * servidor (o `index.ts` executa o `listen` no carregamento do módulo).
 */

import type { IncomingMessage } from "node:http"

/** Teto do corpo de uma requisição MCP. Chamada de tool é JSON pequeno; 1 MiB sobra. */
export const MAX_BODY_BYTES = 1024 * 1024

/** Sessões simultâneas por usuário — o teto global sozinho deixava UM usuário ocupar todas. */
export const MAX_SESSIONS_PER_USER = 10

/**
 * IP do cliente para o rate limit.
 *
 * O serviço roda atrás do ALB, que ACRESCENTA ao fim do `X-Forwarded-For` o endereço de quem
 * abriu a conexão com ele. O que vem antes disso é o que o próprio cliente escreveu no
 * cabeçalho: usar o PRIMEIRO item — como era — deixava qualquer um trocar de "IP" a cada
 * requisição e escapar do limite. O último item é o único que o cliente não controla.
 *
 * Sem o cabeçalho (acesso direto, desenvolvimento), vale o endereço do socket.
 */
export function clientIpFrom(forwardedFor: string | string[] | undefined, remoteAddress: string | undefined): string {
	const header = Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor
	if (header) {
		const hops = header
			.split(",")
			.map((h) => h.trim())
			.filter((h) => h.length > 0)
		const last = hops.at(-1)
		if (last) return last
	}
	return remoteAddress ?? "unknown"
}

export class BodyTooLargeError extends Error {
	constructor(readonly limit: number) {
		super(`Corpo da requisição acima de ${limit} bytes`)
		this.name = "BodyTooLargeError"
	}
}

/**
 * Lê o corpo como string com teto de tamanho. Recusa pelo `Content-Length` declarado antes de
 * ler um byte e, para corpo chunked (sem o cabeçalho), aborta assim que o acumulado passa do
 * teto — sem isso, um POST de gigabytes era bufferizado inteiro na memória da task.
 */
export function readBodyCapped(req: IncomingMessage, maxBytes: number = MAX_BODY_BYTES): Promise<string> {
	return new Promise((resolve, reject) => {
		const declared = Number(req.headers["content-length"])
		if (Number.isFinite(declared) && declared > maxBytes) {
			reject(new BodyTooLargeError(maxBytes))
			return
		}

		const chunks: Buffer[] = []
		let received = 0
		let aborted = false
		req.on("data", (chunk: Buffer) => {
			if (aborted) return
			received += chunk.length
			if (received > maxBytes) {
				aborted = true
				chunks.length = 0
				// Para de consumir: o restante do upload não é lido nem guardado.
				req.pause()
				reject(new BodyTooLargeError(maxBytes))
				return
			}
			chunks.push(chunk)
		})
		req.on("end", () => {
			if (!aborted) resolve(Buffer.concat(chunks).toString("utf-8"))
		})
		req.on("error", (err) => {
			if (!aborted) reject(err)
		})
	})
}

/** Quantas sessões vivas pertencem a este usuário. */
export function countUserSessions(sessions: Iterable<{ userId: string }>, userId: string): number {
	let count = 0
	for (const entry of sessions) if (entry.userId === userId) count++
	return count
}
