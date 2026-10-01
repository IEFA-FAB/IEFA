/**
 * @module safe-href
 * `href` vindo de conteúdo (Portable Text do Sanity, por exemplo) passa por allowlist de
 * esquema antes de virar link: `http:`, `https:`, `mailto:`, caminho interno ou âncora da
 * própria página. Sem isso, um `javascript:` salvo no CMS (por conta comprometida ou colagem
 * descuidada) executava no domínio do portal no clique do leitor.
 *
 * Caminho interno é o `isInternalPath` do `@iefa/auth-kit` — o mesmo guard do `?redirect=`,
 * que já recusa `//host`, `/\host` e `/\t/host` (o navegador descarta TAB/LF e lê
 * `//host`). O resto é recusado (o chamador renderiza sem link).
 */

import { isInternalPath } from "@iefa/auth-kit"

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"])

/** Âncora ou query da própria página (`#secao`, `?q=`): não troca de origem nem executa. */
function isSameDocumentRef(href: string): boolean {
	if (!href.startsWith("#") && !href.startsWith("?")) return false
	// Mesmo raciocínio do `isInternalPath`: caractere de controle não tem uso legítimo aqui.
	for (const char of href) {
		const code = char.charCodeAt(0)
		if (code < 0x20 || code === 0x7f) return false
	}
	return true
}

/** `true` para link que fica no portal (caminho interno ou âncora da própria página). */
export function isInternalHref(href: string): boolean {
	return isInternalPath(href) || isSameDocumentRef(href)
}

/** `href` seguro para renderizar, ou `undefined` quando o valor não passa na allowlist. */
export function safeHref(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined
	const href = value.trim()
	if (href === "") return undefined
	if (href.startsWith("/") || href.startsWith("#") || href.startsWith("?")) return isInternalHref(href) ? href : undefined
	try {
		// Sem base: o que não é URL absoluta lança e é recusado. O parser do WHATWG descarta
		// tab/quebra de linha embutidos (`java\tscript:`) antes de ler o esquema, como o navegador.
		return ALLOWED_PROTOCOLS.has(new URL(href).protocol) ? href : undefined
	} catch {
		return undefined
	}
}
