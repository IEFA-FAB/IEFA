/**
 * Captura de leitura de código de barras.
 *
 * Duas camadas, na ordem em que valem a pena:
 *
 *  1. **Campo focado** (`ScanInput`) — o caminho principal. O operador vê onde
 *     a leitura vai cair e nada depende de heurística.
 *  2. **Captura global** — para quando o foco escapou (clicou num botão, numa
 *     linha da tabela). A decisão de "isto é rajada" é pura e mora em
 *     `@/lib/scanner-burst`, que é onde ela é testada.
 *
 * O que a revisão adversarial derrubou do desenho anterior: "devolver ao input"
 * os caracteres bufferizados. Em input controlado do React isso é frágil, e a
 * rajada só é reconhecida no fim — os caracteres já teriam aparecido na tela.
 * Aqui a captura global só atua quando o foco NÃO está em campo editável, e o
 * que ela consome é descartado.
 */

import { useEffect, useRef } from "react"
import { type BurstConfig, type BurstState, closeOnIdle, EMPTY_BURST, feedKey, isStale } from "@/lib/scanner-burst"

export type ScannerTiming = BurstConfig

export const DEFAULT_TIMING: ScannerTiming = {
	maxKeyIntervalMs: 80,
	minLength: 8,
	terminator: "enter",
	idleTimeoutMs: 120,
}

/** O foco está num lugar onde teclar significa escrever? */
export function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false
	if (target.isContentEditable) return true
	const tag = target.tagName
	if (tag === "TEXTAREA" || tag === "SELECT") return true
	if (tag !== "INPUT") return false
	const type = (target as HTMLInputElement).type
	return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(type)
}

interface UseGlobalBarcodeCaptureOptions {
	onScan: (raw: string) => void
	timing?: ScannerTiming
	enabled?: boolean
}

/** Escuta o documento e entrega a rajada como leitura. */
export function useGlobalBarcodeCapture({ onScan, timing = DEFAULT_TIMING, enabled = true }: UseGlobalBarcodeCaptureOptions) {
	const stateRef = useRef<BurstState>(EMPTY_BURST)
	const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const onScanRef = useRef(onScan)
	onScanRef.current = onScan

	useEffect(() => {
		if (!enabled) return

		function clearTimer() {
			if (idleTimerRef.current) {
				clearTimeout(idleTimerRef.current)
				idleTimerRef.current = null
			}
		}

		function handleKeyDown(event: KeyboardEvent) {
			// campo editável tem dono: quem digita ali é o operador, e o ScanInput
			// já trata a própria leitura
			if (isEditableTarget(event.target)) return

			const now = performance.now()
			if (isStale(stateRef.current, now, timing)) stateRef.current = EMPTY_BURST

			const outcome = feedKey(stateRef.current, { key: event.key, timestamp: now, withModifier: event.ctrlKey || event.metaKey || event.altKey }, timing)
			stateRef.current = outcome.state

			if (outcome.action === "emit") {
				// o Enter/Tab do leitor não pode acionar botão nem mover foco
				if (outcome.preventDefault) {
					event.preventDefault()
					event.stopPropagation()
				}
				clearTimer()
				onScanRef.current(outcome.value)
				return
			}

			if (outcome.action !== "buffer") {
				clearTimer()
				return
			}

			clearTimer()
			if (timing.terminator === "none") {
				// leitor sem terminador: a leitura fecha quando as teclas param
				idleTimerRef.current = setTimeout(() => {
					const value = closeOnIdle(stateRef.current, timing)
					stateRef.current = EMPTY_BURST
					idleTimerRef.current = null
					if (value) onScanRef.current(value)
				}, timing.idleTimeoutMs)
			}
		}

		// fase de captura: chega antes do handler do botão que estiver com foco
		document.addEventListener("keydown", handleKeyDown, true)
		return () => {
			document.removeEventListener("keydown", handleKeyDown, true)
			clearTimer()
			stateRef.current = EMPTY_BURST
		}
	}, [enabled, timing])
}
