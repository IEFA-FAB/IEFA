/**
 * Parser de Server-Sent Events, portado do cliente do ChatRADA (`apps/portal/src/lib/alpha/chat.ts`).
 *
 * Cópia, e não pacote: são poucas linhas e cada app tem o seu design system em volta. O teste
 * vem junto (`sse.test.ts`).
 */

export interface SseEvent {
	event: string
	data: string
}

/**
 * Separa os eventos completos do buffer e devolve o resto incompleto. Comentário (`: …`, o
 * keep-alive do α) é ignorado; `data:` em várias linhas é juntado com `\n`.
 */
export function parseSseBuffer(buffer: string): { events: SseEvent[]; rest: string } {
	const parts = buffer.replace(/\r\n/g, "\n").split("\n\n")
	const rest = parts.pop() ?? ""
	const events: SseEvent[] = []

	for (const block of parts) {
		let event = "message"
		const dataLines: string[] = []

		for (const rawLine of block.split("\n")) {
			const line = rawLine.trimEnd()
			if (line.startsWith(":")) continue
			if (line.startsWith("event:")) event = line.slice(6).trim()
			else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""))
		}

		if (dataLines.length > 0) events.push({ event, data: dataLines.join("\n") })
	}

	return { events, rest }
}
