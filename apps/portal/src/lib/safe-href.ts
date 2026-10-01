/**
 * @module safe-href
 * `href` vindo de conteúdo (Portable Text do Sanity, por exemplo) passa por allowlist de
 * esquema antes de virar link: `http:`, `https:`, `mailto:` ou caminho interno começando
 * com uma única `/`. Sem isso, um `javascript:` salvo no CMS (por conta comprometida ou
 * colagem descuidada) executava no domínio do portal no clique do leitor.
 *
 * `//host` e `/\host` ficam de fora: o navegador lê os dois como outro domínio, não como
 * caminho. O resto é recusado (o chamador renderiza sem link).
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"])

/** `true` para link interno (caminho do próprio portal). */
export function isInternalHref(href: string): boolean {
	return href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\")
}

/** `href` seguro para renderizar, ou `undefined` quando o valor não passa na allowlist. */
export function safeHref(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined
	const href = value.trim()
	if (href === "") return undefined
	if (href.startsWith("/")) return isInternalHref(href) ? href : undefined
	try {
		// Sem base: o que não é URL absoluta lança e é recusado. O parser do WHATWG descarta
		// tab/quebra de linha embutidos (`java\tscript:`) antes de ler o esquema, como o navegador.
		return ALLOWED_PROTOCOLS.has(new URL(href).protocol) ? href : undefined
	} catch {
		return undefined
	}
}
