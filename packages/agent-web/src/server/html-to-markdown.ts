/**
 * Conversão do HTML renderizado pelo SSR para Markdown, usada na negociação de
 * conteúdo (`Accept: text/markdown`).
 *
 * A extração se ancora numa região de conteúdo do app (`main#conteudo` nos apps
 * que usam `AppLayout`, `main` como fallback), o que descarta cabeçalho, navegação
 * lateral, rodapé e o estado serializado do router.
 */

import { NodeHtmlMarkdown } from "node-html-markdown"
import { type HTMLElement, parse } from "node-html-parser"

/** Elementos sem conteúdo textual útil para um agente. */
const NOISE_SELECTOR = "script, style, noscript, template, svg, [aria-hidden='true']"

export const DEFAULT_CONTENT_SELECTORS = ["main#conteudo", "main", "body"] as const

const translator = new NodeHtmlMarkdown({
	keepDataImages: false,
	useLinkReferenceDefinitions: false,
	useInlineLinks: true,
})

function firstMatch(root: HTMLElement, selectors: readonly string[]): HTMLElement | null {
	for (const selector of selectors) {
		const found = root.querySelector(selector)
		if (found) return found
	}
	return null
}

function metaContent(root: HTMLElement, name: string): string | undefined {
	const el = root.querySelector(`meta[name='${name}']`) ?? root.querySelector(`meta[property='${name}']`)
	const content = el?.getAttribute("content")?.trim()
	return content && content.length > 0 ? content : undefined
}

export interface MarkdownDocument {
	markdown: string
	title?: string
}

/**
 * Retorna `null` quando o HTML não tem região de conteúdo reconhecível ou o
 * resultado sai vazio — nesse caso o chamador devolve o HTML original em vez de
 * um Markdown inútil.
 */
export function htmlToMarkdown(html: string, sourceUrl: string, contentSelectors: readonly string[] = DEFAULT_CONTENT_SELECTORS): MarkdownDocument | null {
	const root = parse(html)

	const content = firstMatch(root, contentSelectors)
	if (!content) return null

	for (const noise of content.querySelectorAll(NOISE_SELECTOR)) {
		noise.remove()
	}

	const body = translator.translate(content.innerHTML).trim()
	if (body.length === 0) return null

	const title = root.querySelector("title")?.text?.trim()
	const description = metaContent(root, "description")

	const header = [title ? `# ${title}` : null, description ? `> ${description}` : null, `Fonte: <${sourceUrl}>`, "", "---"].filter(
		(line): line is string => line !== null
	)

	return { markdown: `${header.join("\n\n")}\n\n${body}\n`, title }
}
