/**
 * @module chat-links
 * Classifica o destino de um link escrito pelo modelo nos chats de IA.
 *
 * O texto da resposta vem de um modelo, e um modelo sob prompt injection (texto plantado numa
 * receita, numa nota, num nome de template) escreve `[ver detalhes](https://x/?d=<o que leu>)`.
 * Um clique e a conversa sai na query string. Link interno (para o próprio sisub) segue normal;
 * externo passa a mostrar o domínio e pedir confirmação; esquema que não é http(s) não vira link.
 *
 * Puro de propósito: o teste cobra a regra sem DOM.
 * @domain app
 */

export type ChatLinkTarget =
	| { kind: "internal"; href: string }
	| { kind: "external"; href: string; host: string }
	/** `javascript:`, `data:`, `mailto:`, URL malformada… — vira só texto. */
	| { kind: "blocked" }

/** Caractere de controle ASCII, espaço ou DEL em qualquer posição. */
function hasControlOrSpace(text: string): boolean {
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i)
		if (code <= 0x20 || code === 0x7f) return true
	}
	return false
}

/** Teto do endereço mostrado no aviso; o resto vira reticências (o domínio aparece à parte). */
export const MAX_SHOWN_URL_CHARS = 300

/**
 * `origin` é o do app no navegador (`window.location.origin`); no servidor não há, e todo link
 * absoluto conta como externo, o que só pede uma confirmação a mais.
 */
export function classifyChatLink(href: unknown, origin?: string): ChatLinkTarget {
	if (typeof href !== "string") return { kind: "blocked" }
	const trimmed = href.trim()
	if (!trimmed) return { kind: "blocked" }
	// O navegador descarta tab e quebra de linha do meio da URL (WHATWG URL): `/<tab>/evil` vira
	// `//evil`, outro domínio. Markdown entrega esses caracteres por entidade (`&#9;`). Qualquer
	// caractere de controle ou espaço no meio do endereço recusa o link.
	if (hasControlOrSpace(trimmed)) return { kind: "blocked" }

	// Caminho do próprio app. `//host` é absoluto sem esquema (vai para outro domínio) e `/\host`
	// o navegador normaliza para o mesmo: os dois ficam de fora.
	if (/^\/(?![/\\])/.test(trimmed) || trimmed.startsWith("#")) return { kind: "internal", href: trimmed }

	let url: URL
	try {
		url = new URL(trimmed)
	} catch {
		return { kind: "blocked" }
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return { kind: "blocked" }
	if (origin && url.origin === origin) return { kind: "internal", href: url.href }
	return { kind: "external", href: url.href, host: url.host }
}

/** Endereço para o aviso de confirmação, cortado no teto. */
export function shownUrl(href: string): string {
	return href.length > MAX_SHOWN_URL_CHARS ? `${href.slice(0, MAX_SHOWN_URL_CHARS)}…` : href
}
