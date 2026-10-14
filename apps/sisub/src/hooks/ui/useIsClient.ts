import { useSyncExternalStore } from "react"

const noSubscription = () => () => {}

/**
 * `false` no servidor e na hidratação, `true` no navegador logo em seguida. Para o que só existe
 * no cliente (`createPortal` no `document`, consulta que não deve sair do SSR) sem divergir o HTML
 * da hidratação.
 *
 * Substitui o `useEffect(() => setMounted(true), [])`, que custa um render a mais em toda montagem
 * (`react-hooks-js/set-state-in-effect`). Montado depois da hidratação, já começa em `true`.
 */
export function useIsClient(): boolean {
	return useSyncExternalStore(
		noSubscription,
		() => true,
		() => false
	)
}
