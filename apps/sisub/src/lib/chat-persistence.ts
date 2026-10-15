import { toast } from "@/components/ui/toast"
import { ServerFnTransportError } from "@/lib/server-fn-response"

/** Novas tentativas depois da primeira: esperas de 1 s, 2 s e 4 s. */
const SAVE_RETRIES = 3

/** Status em que o servidor pode ter gravado antes de a resposta se perder (ver describeTransportFailure). */
const AMBIGUOUS_STATUSES: ReadonlySet<number> = new Set([0, 502, 504])

/**
 * Falha em que o handler certamente não gravou e que pode passar sozinha: erro montado FORA do
 * handler com status 5xx (503 do ALB sem task, erro de middleware) ou vindo de outro build (a
 * task do deploy rolante não conhece a função). Só essa se repete. Não se repetem: erro do
 * próprio handler (validação, permissão, limite de gravações), 4xx de fora do handler (403 do
 * WAF/ALB em HTML não muda na próxima tentativa) e queda de conexão, 502 e 504, que podem ter
 * gravado (repetir duplicaria a mensagem).
 */
export function isRetryableSaveError(err: unknown): boolean {
	if (!(err instanceof ServerFnTransportError) || AMBIGUOUS_STATUSES.has(err.status)) return false
	return err.status >= 500 || (err.fromOtherBuild && err.status >= 400)
}

/** A gravação pode ter acontecido mesmo com o erro (a resposta se perdeu no caminho). */
function isAmbiguousSaveError(err: unknown): boolean {
	return err instanceof ServerFnTransportError && AMBIGUOUS_STATUSES.has(err.status)
}

/** Repete `run` com espera exponencial enquanto `shouldRetry` aceitar o erro; senão, lança. */
export async function retryWithBackoff<T>(
	run: () => Promise<T>,
	{
		retries = SAVE_RETRIES,
		baseDelayMs = 1000,
		shouldRetry = isRetryableSaveError,
	}: { retries?: number; baseDelayMs?: number; shouldRetry?: (err: unknown) => boolean } = {}
): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await run()
		} catch (err) {
			if (attempt >= retries || !shouldRetry(err)) throw err
			await new Promise<void>((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt))
		}
	}
}

/**
 * Grava a resposta do assistente quando a sessão existir (a primeira mensagem cria a sessão
 * em paralelo), repetindo só o que é seguro repetir. Se não der, a resposta continua na tela
 * mas pode não voltar ao reabrir a conversa: o usuário precisa saber, e o erro vai para o console.
 */
export function persistAssistantReply(
	sessionPromise: Promise<string> | null,
	save: (sessionId: string) => Promise<unknown>,
	options?: Parameters<typeof retryWithBackoff>[1]
): void {
	if (!sessionPromise) return
	sessionPromise
		.then((sessionId) => retryWithBackoff(() => save(sessionId), options))
		.catch((err: unknown) => {
			// biome-ignore lint/suspicious/noConsole: intencional — a falha de gravação não tem outro rastro no cliente
			console.error("[chat] resposta do assistente não foi salva:", err)
			if (isAmbiguousSaveError(err)) {
				toast.error("A resposta pode não ter sido salva", {
					description: "A conexão caiu antes da confirmação. Ela continua na tela; ao reabrir a conversa, confira se está lá.",
				})
				return
			}
			toast.error("A resposta não foi salva", { description: "Ela continua na tela, mas não volta quando a conversa for reaberta." })
		})
}
