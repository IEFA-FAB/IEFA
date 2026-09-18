import { useEffect, useState } from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Mesmo breakpoint do sisub e do sucont (768px): é onde a barra lateral deixa de
 * ser coluna fixa e vira gaveta.
 *
 * Começa `false` e só resolve no efeito: no SSR não há `window`, e chutar um valor
 * faria o servidor renderizar um layout que o cliente descarta na hidratação. A
 * coluna fixa já some sozinha abaixo de `md` pelo CSS, então o primeiro quadro no
 * celular não mostra barra nenhuma — só não tem a gaveta montada ainda.
 */
export function useIsMobile(): boolean {
	const [isMobile, setIsMobile] = useState(false)

	useEffect(() => {
		const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
		const onChange = () => setIsMobile(mql.matches)
		mql.addEventListener("change", onChange)
		setIsMobile(mql.matches)
		return () => mql.removeEventListener("change", onChange)
	}, [])

	return isMobile
}
