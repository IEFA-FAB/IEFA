/**
 * @module hooks/use-copy-feedback
 * Estado do "Copiado" das mensagens institucionais, por chave.
 *
 * A chave identifica a mensagem (`ug:120001`, `rac:RAC 28`, `unica`), não a posição na
 * lista: com índice, a primeira mensagem por UG e a primeira por questão RAC dividiam o
 * mesmo "Copiado", e trocar o filtro passava o "Copiado" para outra UG.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "#/components/ui/toast"
import { COPY_FAILED_MESSAGE, copyWithFeedback } from "#/lib/clipboard"

/** Quanto tempo o botão fica em "Copiado". */
const COPIED_RESET_MS = 2000

export interface CopyOptions {
	/** Depois de marcar "Copiado". */
	onCopied?: () => void
	/** No lugar do aviso de erro padrão. */
	onFailed?: () => void
}

export function useCopyFeedback() {
	const [copiedKey, setCopiedKey] = useState<string | null>(null)
	const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(
		() => () => {
			if (resetTimer.current) clearTimeout(resetTimer.current)
		},
		[]
	)

	/**
	 * Copia e marca a chave. `options` deixa a tela dar o próprio aviso (sucesso ou falha)
	 * no lugar do padrão, como o modal do auditor, que registra a mensagem antes de copiar.
	 */
	const copy = useCallback((text: string, key: string, options?: CopyOptions) => {
		return copyWithFeedback(text, key, {
			onCopied: (copied) => {
				// Um timer só: o da cópia anterior apagaria o "Copiado" desta antes da hora.
				if (resetTimer.current) clearTimeout(resetTimer.current)
				setCopiedKey(copied)
				resetTimer.current = setTimeout(() => setCopiedKey(null), COPIED_RESET_MS)
				options?.onCopied?.()
			},
			onFailed: () => {
				if (options?.onFailed) options.onFailed()
				else toast.error(COPY_FAILED_MESSAGE)
			},
		})
	}, [])

	/** Apaga o "Copiado" (a tela reabriu sobre outro registro). */
	const reset = useCallback(() => {
		if (resetTimer.current) clearTimeout(resetTimer.current)
		setCopiedKey(null)
	}, [])

	return { copiedKey, copy, reset }
}
