import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { searchUsersByEmailFn, type UserSearchResult } from "@/server/permissions.fn"

/** Mínimo de caracteres antes de consultar — evita varrer a base a cada tecla. */
const MIN_LENGTH = 3
const DEBOUNCE_MS = 300

/**
 * Busca de usuário por email, com debounce e limiar mínimo.
 *
 * Compartilhada entre o console de acesso e a turma de treino: eram duas cópias do mesmo
 * `useEffect` + `useQuery`, e divergir no limiar ou no debounce daria a duas telas
 * comportamentos de busca diferentes sem motivo.
 */
export function useUserSearch(input: string): { results: UserSearchResult[]; isSearching: boolean; canSearch: boolean } {
	const [debounced, setDebounced] = React.useState("")

	React.useEffect(() => {
		const timer = setTimeout(() => setDebounced(input), DEBOUNCE_MS)
		return () => clearTimeout(timer)
	}, [input])

	const canSearch = debounced.length >= MIN_LENGTH

	const { data: results = [], isLoading: isSearching } = useQuery({
		queryKey: ["userSearch", debounced],
		queryFn: () => searchUsersByEmailFn({ data: { email: debounced } }),
		enabled: canSearch,
		staleTime: 30_000,
	})

	return { results, isSearching, canSearch }
}
