import { useCallback, useRef, useState } from "react"
import { saveAnswerFn } from "@/server/forms.fn"

type SaveStatus = "idle" | "saving" | "saved" | "error"

export function useAutoSave(questionnaireResponseId: string | null) {
	const [status, setStatus] = useState<SaveStatus>("idle")
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const pendingRef = useRef<Map<string, { value: unknown; observation: string | null }>>(new Map())

	const flush = useCallback(async () => {
		if (!questionnaireResponseId || pendingRef.current.size === 0) return

		setStatus("saving")
		const entries = Array.from(pendingRef.current.entries())
		pendingRef.current.clear()

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
			}
			setStatus("saved")
		} catch {
			setStatus("error")
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
