import type { DocsIndex } from "./docs-index.server"

/**
 * Árvore de páginas + mapa slug → path do MDX, acessível dos dois lados.
 *
 * O site é estático: em navegação client-side não existe servidor para responder
 * um `createServerFn`. No prerender lemos o `source` direto; no navegador
 * buscamos o JSON que o Nitro materializou em `/api/docs-index`. O import
 * dinâmico dentro do galho SSR é o que mantém todo o MDX fora do bundle do
 * cliente — um import estático de `docs-index.server` traria junto o conteúdo
 * inteiro da documentação.
 */
let cached: Promise<DocsIndex> | undefined

export function getDocsIndex(): Promise<DocsIndex> {
	if (import.meta.env.SSR) {
		return import("./docs-index.server").then((mod) => mod.buildDocsIndex())
	}

	cached ??= fetch("/api/docs-index").then((res) => {
		if (!res.ok) throw new Error(`Falha ao carregar o índice da documentação (HTTP ${res.status})`)
		return res.json() as Promise<DocsIndex>
	})

	return cached
}

export type { DocsIndex }
