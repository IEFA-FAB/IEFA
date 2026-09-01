import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Mesmo breakpoint do sisub (768px), para que a sidebar troque para o modo
 * gaveta no mesmo ponto nos dois apps.
 *
 * Começa `undefined` e só resolve no efeito: no SSR não há `window`, e chutar um
 * valor faria a árvore renderizar no servidor com um layout que o cliente
 * descarta na hidratação.
 */
export function useIsMobile() {
	const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

	React.useEffect(() => {
		const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
		const onChange = () => {
			setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
		}
		mql.addEventListener("change", onChange)
		setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
		return () => mql.removeEventListener("change", onChange)
	}, [])

	return !!isMobile
}
