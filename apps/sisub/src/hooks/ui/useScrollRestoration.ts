import { type RefObject, useEffect } from "react"

/**
 * Restauração de scroll para listas virtualizadas (TanStack Virtual).
 *
 * A restauração NÃO é feita setando `scrollTop` na mão (sofre com clamping
 * enquanto o virtualizer ainda não mediu a altura total). Em vez disso:
 *
 * - **Restaurar**: passe `getStoredScrollOffset(key)` em `initialOffset` do
 *   `useVirtualizer`. Ao montar o scroll element, o virtualizer posiciona o DOM
 *   no offset salvo — já integrado à medição.
 * - **Salvar**: `usePersistScrollOffset(key, ref, ready)` escuta o scroll do
 *   container e grava o offset exato em `sessionStorage` (throttle via rAF).
 */

const memoryFallback = new Map<string, number>()

function readScroll(key: string): number | null {
	try {
		const raw = window.sessionStorage.getItem(key)
		return raw == null ? null : Number(raw)
	} catch {
		return memoryFallback.has(key) ? (memoryFallback.get(key) as number) : null
	}
}

function writeScroll(key: string, value: number): void {
	try {
		window.sessionStorage.setItem(key, String(value))
	} catch {
		memoryFallback.set(key, value)
	}
}

/** Lê o offset salvo (síncrono). Use em `initialOffset` do `useVirtualizer`. SSR-safe (retorna 0). */
export function getStoredScrollOffset(key: string | null): number {
	if (key == null) return 0
	const value = readScroll(key)
	return value != null && !Number.isNaN(value) && value > 0 ? value : 0
}

/** Persiste o offset de scroll vertical do container enquanto ele existir. */
export function usePersistScrollOffset(
	/** Chave do storage. `null` desativa. */
	key: string | null,
	ref: RefObject<HTMLElement | null>,
	/** `true` quando o container já está montado (dados carregados). Reanexa o listener ao montar. */
	ready: boolean
): void {
	// biome-ignore lint/correctness/useExhaustiveDependencies: `ready` é sinal de re-trigger — ao virar true o container monta e o listener precisa reanexar
	useEffect(() => {
		if (key == null) return
		const el = ref.current
		if (!el) return
		let frame = 0
		const onScroll = () => {
			if (frame) return
			frame = requestAnimationFrame(() => {
				frame = 0
				writeScroll(key, el.scrollTop)
			})
		}
		el.addEventListener("scroll", onScroll, { passive: true })
		return () => {
			el.removeEventListener("scroll", onScroll)
			if (frame) cancelAnimationFrame(frame)
		}
	}, [key, ready, ref])
}
