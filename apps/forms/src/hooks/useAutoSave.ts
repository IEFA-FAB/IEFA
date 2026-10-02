import { useCallback, useRef, useState } from "react"
import { saveAnswerFn } from "@/server/forms.fn"

type SaveStatus = "idle" | "saving" | "saved" | "error"

export function useAutoSave(questionnaireResponseId: string | null) {
	const [status, setStatus] = useState<SaveStatus>("idle")
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const pendingRef = useRef<Map<string, { value: unknown; observation: string | null }>>(new Map())

	/** Grava o que está na fila. `false` se algo ficou sem gravar (continua na fila). */
	const flush = useCallback(async (): Promise<boolean> => {
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
			setStatus("saved")
			return true
		} catch {
			// O que não foi gravado (rede, 429 do teto de escritas) volta para a fila e sai na
			// próxima alteração ou no flush do envio — sem sobrescrever o que já foi digitado depois.
			for (const [question_id, answer] of entries.slice(sent)) {
				if (!pendingRef.current.has(question_id)) pendingRef.current.set(question_id, answer)
			}
			setStatus("error")
			return false
		}
	}, [questionnaireResponseId])

	const save = useCallback(
		(questionId: string, value: unknown, observation: string | null = null) => {
			pendingRef.current.set(questionId, { value, observation })

			if (timeoutRef.current) clearTimeout(timeoutRef.current)
			timeoutRef.current = setTimeout(flush, 300)
		},
		[flush]
	)

	return { save, flush, status }
}
