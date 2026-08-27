import { ALL_CATEGORIES } from "#/lib/hub-filters"
import type { Tool } from "#/lib/types"

/**
 * Filtro do dashboard. Categoria casa por IGUALDADE — o casamento frouxo anterior
 * (`includes` nos dois sentidos) fazia uma categoria cujo nome estivesse contido
 * em outra casar sozinha, sem ninguém ter pedido.
 */
export function filterTools(tools: Tool[], { query, category }: { query: string; category: string }): Tool[] {
	const term = query.trim().toLowerCase()
	return tools
		.filter((tool) => category === ALL_CATEGORIES || tool.category === category)
		.filter(
			(tool) =>
				term === "" || tool.title.toLowerCase().includes(term) || tool.description.toLowerCase().includes(term) || tool.category.toLowerCase().includes(term)
		)
}
