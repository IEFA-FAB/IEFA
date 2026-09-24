import { useLocation } from "@tanstack/react-router"
import { createContext, useContext, useEffect } from "react"

type SetCrumbLabel = (path: string, label: string | null) => void

export const CrumbLabelContext = createContext<SetCrumbLabel | null>(null)

/**
 * Dá nome ao registro aberto no breadcrumb e no título da aba — "Arroz carreteiro" em vez
 * de "Preparação". Chamar na página de detalhe com o nome carregado; `undefined` enquanto
 * carrega mantém o rótulo genérico. O rótulo é preso ao pathname e some ao desmontar,
 * então não vaza para a próxima página.
 */
export function useCrumbLabel(label: string | null | undefined) {
	const set = useContext(CrumbLabelContext)
	const { pathname } = useLocation()
	useEffect(() => {
		if (!set || !label) return
		set(pathname, label)
		return () => set(pathname, null)
	}, [set, pathname, label])
}
