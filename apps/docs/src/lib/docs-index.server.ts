import { source } from "./source"

/**
 * Monta o índice do site a partir do `source` do fumadocs.
 *
 * Roda apenas no servidor — durante o prerender do Nitro. `collections/server`
 * carrega todo o MDX de forma eager, então este módulo nunca pode acabar no
 * bundle do cliente; quem garante isso é o import dinâmico em `docs-index.ts`.
 */
export async function buildDocsIndex() {
	const paths: Record<string, string> = {}
	for (const page of source.getPages()) {
		paths[page.slugs.join("/")] = page.path
	}

	return {
		pageTree: await source.serializePageTree(source.getPageTree()),
		paths,
	}
}

export type DocsIndex = Awaited<ReturnType<typeof buildDocsIndex>>
