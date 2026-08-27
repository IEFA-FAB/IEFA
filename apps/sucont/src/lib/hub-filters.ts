import { useNavigate, useSearch } from "@tanstack/react-router"

/** Categoria sentinela: nenhuma filtragem, mostra o catálogo inteiro. */
export const ALL_CATEGORIES = "Visão Geral"

export interface HubFilters {
	query: string
	category: string
	isFiltered: boolean
	setQuery: (value: string) => void
	setCategory: (value: string) => void
	clear: () => void
}

/**
 * Busca e categoria do hub, lidas e escritas na URL (`?q=`/`?cat=`) — ver o
 * `validateSearch` da rota raiz. Digitar troca a URL com `replace` para não
 * empilhar uma entrada de histórico por tecla.
 */
export function useHubFilters(): HubFilters {
	const search = useSearch({ strict: false })
	const navigate = useNavigate()

	const query = search.q ?? ""
	const category = search.cat ?? ALL_CATEGORIES

	return {
		query,
		category,
		isFiltered: query.trim() !== "" || category !== ALL_CATEGORIES,
		setQuery: (value) => {
			navigate({ to: ".", search: (prev) => ({ ...prev, q: value.trim() === "" ? undefined : value }), replace: true })
		},
		// Categoria filtra o dashboard: escolher uma a partir de outra tela leva para lá.
		setCategory: (value) => {
			navigate({ to: "/", search: (prev) => ({ ...prev, cat: value === ALL_CATEGORIES ? undefined : value }) })
		},
		clear: () => {
			navigate({ to: ".", search: (prev) => ({ ...prev, q: undefined, cat: undefined }), replace: true })
		},
	}
}
