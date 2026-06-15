import { useEffect, useRef } from "react"

/**
 * Executa `effect` após `delayMs` de inatividade nas `deps`.
 * Ignora o primeiro render (mount) — só dispara em mudanças subsequentes.
 * Uso típico: auto-save debounced ao editar formulários.
 */
export function useDebouncedEffect(effect: () => void, deps: unknown[], delayMs: number) {
	const skipInitial = useRef(true)
	const effectRef = useRef(effect)
	effectRef.current = effect

	useEffect(() => {
		if (skipInitial.current) {
			skipInitial.current = false
			return
		}
		const t = setTimeout(() => effectRef.current(), delayMs)
		return () => clearTimeout(t)
		// biome-ignore lint/correctness/useExhaustiveDependencies: deps são controladas pelo chamador (padrão de hook genérico)
	}, deps)
}
