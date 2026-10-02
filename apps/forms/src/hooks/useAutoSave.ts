import { useCallback, useEffect, useRef, useState } from "react"
import { saveAnswerFn } from "@/server/forms.fn"

type SaveStatus = "idle" | "saving" | "saved" | "error"

/** Espera antes de tentar de novo o que falhou (rede, 429 do teto de escritas). */
const RETRY_MS = 5_000
/** Tentativas automáticas seguidas; depois disso a próxima alteração ou o envio tentam de novo. */
const MAX_AUTO_RETRIES = 3

export function useAutoSave(questionnaireResponseId: string | null) {
	const [status, setStatus] = useState<SaveStatus>("idle")
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const pendingRef = useRef<Map<string, { value: unknown; observation: string | null }>>(new Map())
	// Um flush por vez: o próximo espera o que está em voo. Sem isto, o envio via a fila vazia
	// (o debounce já a tinha tirado) e seguia antes de a última resposta chegar ao banco; e a
	// falha de um flush antigo recolocava um valor mais velho que o já gravado por outro.
	const chainRef = useRef<Promise<boolean>>(Promise.resolve(true))
	const retriesRef = useRef(0)
	const mountedRef = useRef(true)
	const flushRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true))

	const schedule = useCallback((run: () => void, ms: number) => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current)
		timeoutRef.current = setTimeout(run, ms)
	}, [])

	/** Grava a fila atual. `false` se algo ficou sem gravar (volta para a fila). */
	const drain = useCallback(async (): Promise<boolean> => {
		if (!questionnaireResponseId || pendingRef.current.size === 0) return true

		setStatus("saving")
		const entries = Array.from(pendingRef.current.entries())
		pendingRef.current.clear()

		let sent = 0
		try {
			for (const [question_id, { value, observation }] of entries) {
				await saveAnswerFn({
					data: {
						questionnaire_response_id: questionnaireResponseId,
						question_id,
						value,
						observation,
					},
				})
				sent += 1
			}
			setStatus(pendingRef.current.size > 0 ? "saving" : "saved")
			return true
		} catch {
			// O que não foi gravado volta para a fila, sem sobrescrever o que foi digitado depois.
			for (const [question_id, answer] of entries.slice(sent)) {
				if (!pendingRef.current.has(question_id)) pendingRef.current.set(question_id, answer)
			}
			setStatus("error")
			return false
		}
	}, [questionnaireResponseId])

	/** Grava tudo o que está pendente, depois do que já estiver em voo. `false` se algo falhou. */
	const flush = useCallback((): Promise<boolean> => {
		const next = chainRef.current.then(drain, drain)
		chainRef.current = next
		return next.then((ok) => {
			if (ok) {
				retriesRef.current = 0
			} else if (mountedRef.current && retriesRef.current < MAX_AUTO_RETRIES) {
				// Falhou: tenta de novo sozinho, sem depender da próxima alteração.
				retriesRef.current += 1
				schedule(() => void flushRef.current(), RETRY_MS)
			}
			return ok
		})
	}, [drain, schedule])

	const save = useCallback(
		(questionId: string, value: unknown, observation: string | null = null) => {
			pendingRef.current.set(questionId, { value, observation })
			retriesRef.current = 0
			schedule(() => void flushRef.current(), 300)
		},
		[schedule]
	)

	// Descarrega ao sair: aba escondida/fechada e troca de rota (desmontagem).
	useEffect(() => {
		flushRef.current = flush
	}, [flush])
	useEffect(() => {
		mountedRef.current = true
		const onHide = () => {
			if (document.visibilityState === "hidden") void flushRef.current()
		}
		const onPageHide = () => void flushRef.current()
		document.addEventListener("visibilitychange", onHide)
		window.addEventListener("pagehide", onPageHide)
		return () => {
			document.removeEventListener("visibilitychange", onHide)
			window.removeEventListener("pagehide", onPageHide)
			mountedRef.current = false
			if (timeoutRef.current) clearTimeout(timeoutRef.current)
			void flushRef.current()
		}
	}, [])

	return { save, flush, status }
}
