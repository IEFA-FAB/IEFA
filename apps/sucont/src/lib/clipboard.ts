/**
 * Cópia para a área de transferência com confirmação honesta.
 *
 * As telas marcavam "Copiado" logo depois de chamar `navigator.clipboard.writeText`, sem
 * esperar a promessa: sem permissão, fora de contexto seguro ou com o documento sem foco,
 * a escrita falha e a tela dizia que copiou. Aqui o "Copiado" só vem depois de a escrita
 * resolver; a falha vai para quem chamou mostrar o erro.
 */

/** O pedaço da Clipboard API que a cópia usa. */
export interface ClipboardWriter {
	writeText(text: string): Promise<void>
}

/** Escreve o texto; `true` só depois de a escrita resolver. Sem Clipboard API, `false`. */
export async function copyText(text: string, clipboard: ClipboardWriter | undefined = globalThis.navigator?.clipboard): Promise<boolean> {
	if (!clipboard) return false
	try {
		await clipboard.writeText(text)
		return true
	} catch {
		return false
	}
}

/** Mensagem do aviso quando a cópia falha. */
export const COPY_FAILED_MESSAGE = "Não foi possível copiar. Selecione o texto e copie manualmente."

export interface CopyFeedback {
	/** Marca a chave como copiada (o botão troca para "Copiado"). */
	onCopied: (key: string) => void
	/** A escrita falhou: a tela avisa e o botão continua em "Copiar". */
	onFailed: () => void
}

/** Copia e só então confirma; a falha não marca nada como copiado. */
export async function copyWithFeedback(text: string, key: string, feedback: CopyFeedback, clipboard?: ClipboardWriter): Promise<void> {
	// `undefined` cai no padrão de `copyText`, a Clipboard API do navegador.
	const isCopied = await copyText(text, clipboard)
	if (isCopied) feedback.onCopied(key)
	else feedback.onFailed()
}
