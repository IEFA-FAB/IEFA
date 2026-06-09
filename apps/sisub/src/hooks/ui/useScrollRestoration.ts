import { type RefObject, useEffect, useRef } from "react"

/**
 * Persiste e restaura a posição de scroll vertical de um container rolável em
 * `sessionStorage`. Pensado para listas virtualizadas: a restauração é aplicada
 * ao longo de alguns frames para esperar o virtualizer medir a altura total.
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

export function useScrollRestoration(
	/** Chave do storage. `null` desativa. */
	key: string | null,
	ref: RefObject<HTMLElement | null>,
	/** `true` quando o conteúdo já tem altura (dados carregados) — necessário para restaurar. */
	ready: boolean
): void {
	const restoredRef = useRef(false)

	// Restaura uma única vez, quando o conteúdo estiver pronto.
	useEffect(() => {
		if (key == null || !ready || restoredRef.current) return
		const el = ref.current
		if (!el) return
		restoredRef.current = true
		const saved = readScroll(key)
		if (saved == null || Number.isNaN(saved) || saved <= 0) return

		let cancelled = false
		let raf = 0
		// Reaplica por alguns frames: o virtualizer pode medir a altura tardiamente.
		const apply = (attempt: number) => {
			if (cancelled) return
			if (ref.current) ref.current.scrollTop = saved
			if (attempt < 2) raf = requestAnimationFrame(() => apply(attempt + 1))
		}
		raf = requestAnimationFrame(() => apply(0))
		return () => {
			cancelled = true
			cancelAnimationFrame(raf)
		}
	}, [key, ready, ref])

	// Salva a posição (throttle via rAF) enquanto o container existir.
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
