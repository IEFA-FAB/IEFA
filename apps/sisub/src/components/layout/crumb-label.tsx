import { useMatch } from "@tanstack/react-router"
import { createContext, useContext, useEffect } from "react"
import { normalizePath } from "@/lib/nav-paths"

type SetCrumbLabel = (path: string, label: string | null) => void

export const CrumbLabelContext = createContext<SetCrumbLabel | null>(null)

/**
 * Dá nome ao registro aberto no breadcrumb e no título da aba — "Arroz carreteiro" em vez
 * de "Preparação". Chamar na página de detalhe com o nome carregado; `undefined` enquanto
 * carrega mantém o rótulo genérico. O rótulo é preso ao pathname do MATCH da própria rota
 * (não ao `useLocation`, que já aponta para a URL nova enquanto a página antiga segue montada
 * esperando o loader) e some ao desmontar, então não vaza para a próxima página.
 */
export function useCrumbLabel(label: string | null | undefined) {
	const set = useContext(CrumbLabelContext)
	const pathname = useMatch({ strict: false, select: (match) => normalizePath(match.pathname) })
	useEffect(() => {
		if (!set || !label) return
		set(pathname, label)
		return () => set(pathname, null)
	}, [set, pathname, label])
}
