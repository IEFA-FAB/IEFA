/**
 * @module chat-history-rate-limit
 * Teto de gravações no histórico dos chats de IA (`saveChatMessageFn`, `saveModuleChatMessageFn`),
 * por usuário, no servidor.
 *
 * As duas fns gravam o que o navegador manda, e o navegador é de quem está logado: sem teto, um
 * script com a sessão enche `kitchen.analytics_chat_message`/`module_chat_message` em laço. O
 * tamanho de cada linha já tem teto no schema (`@iefa/sisub-domain`, `schemas/chat.ts`); isto
 * limita quantas.
 *
 * Um turno normal grava 2 a 4 linhas (pergunta, resposta, ferramentas), e o chat aceita 12 turnos
 * por minuto (`SISUB_AI_RATE_LIMIT_DEFAULTS`): 120 por minuto é folga de sobra para o uso real.
 *
 * Em memória, por processo — mesma limitação consciente de `@iefa/ai-provider` (`rate-limit.ts`):
 * com N tasks o teto efetivo é N × o configurado. Arquivo puro, sem import do provider (as fns
 * importam isto, e o pacote de IA não tem o que fazer no bundle delas).
 * @domain app
 */

export const CHAT_HISTORY_WRITES_PER_MINUTE = 120

const WINDOW_MS = 60_000

type Bucket = { startedAt: number; used: number }

export type ChatHistoryWriteVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number; message: string }

/** Janela fixa por usuário. Classe para o teste ter estado limpo e relógio próprio. */
export class ChatHistoryWriteLimiter {
	private readonly buckets = new Map<string, Bucket>()

	constructor(private readonly perMinute = CHAT_HISTORY_WRITES_PER_MINUTE) {}

	/** Conta uma gravação de `userId` e diz se ela cabe na janela. */
	admit(userId: string, now = Date.now()): ChatHistoryWriteVerdict {
		let bucket = this.buckets.get(userId)
		if (!bucket || now - bucket.startedAt >= WINDOW_MS) {
			bucket = { startedAt: now, used: 0 }
			this.buckets.set(userId, bucket)
			// Janelas vencidas de outros usuários saem junto, para o mapa não crescer sem fim.
			if (this.buckets.size > 1000) {
				for (const [key, other] of this.buckets) if (now - other.startedAt >= WINDOW_MS) this.buckets.delete(key)
			}
		}
		if (bucket.used >= this.perMinute) {
			return {
				allowed: false,
				retryAfterSeconds: Math.max(1, Math.ceil((bucket.startedAt + WINDOW_MS - now) / 1000)),
				message: "Muitas mensagens gravadas no histórico em pouco tempo. Aguarde um instante e tente de novo.",
			}
		}
		bucket.used += 1
		return { allowed: true }
	}
}

/** Estado do processo. */
export const CHAT_HISTORY_WRITE_LIMITER = new ChatHistoryWriteLimiter()
