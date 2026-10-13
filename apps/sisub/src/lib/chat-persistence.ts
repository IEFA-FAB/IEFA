import { toast } from "@/components/ui/toast"

/** Novas tentativas depois da primeira: esperas de 1 s, 2 s e 4 s. */
const SAVE_RETRIES = 3

/** Repete `run` com espera exponencial; esgotadas as tentativas, lança o último erro. */
export async function retryWithBackoff<T>(run: () => Promise<T>, retries = SAVE_RETRIES, baseDelayMs = 1000): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await run()
		} catch (err) {
			if (attempt >= retries) throw err
			await new Promise<void>((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt))
		}
	}
}

/**
 * Grava a resposta do assistente quando a sessão existir (a primeira mensagem cria a sessão
 * em paralelo), com novas tentativas. Se nada der certo, a resposta continua na tela mas não
 * volta ao reabrir a conversa: o usuário precisa saber disso, e o erro vai para o console.
 */
export function persistAssistantReply(sessionPromise: Promise<string> | null, save: (sessionId: string) => Promise<unknown>, retries = SAVE_RETRIES): void {
	if (!sessionPromise) return
	sessionPromise
		.then((sessionId) => retryWithBackoff(() => save(sessionId), retries))
		.catch((err: unknown) => {
			// biome-ignore lint/suspicious/noConsole: intencional — a falha de gravação não tem outro rastro no cliente
			console.error("[chat] resposta do assistente não foi salva:", err)
			toast.error("A resposta não foi salva", { description: "Ela continua na tela, mas não volta quando a conversa for reaberta." })
		})
}
