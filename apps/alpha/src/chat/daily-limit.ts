/** Decisão pura do teto diário de perguntas — a leitura no banco mora em `rate-limit.ts`. */

export const WINDOW_MS = 24 * 60 * 60 * 1000

export type DailyLimitState = { blocked: false } | { blocked: true; retryAt: Date }

/** Decisão pura sobre as datas das perguntas mais recentes na janela, da mais nova para a mais antiga. */
export function decideDailyLimit(recentCreatedAt: readonly string[], max: number): DailyLimitState {
	if (recentCreatedAt.length < max) return { blocked: false }
	const oldestCounted = recentCreatedAt[max - 1]
	return { blocked: true, retryAt: new Date(new Date(oldestCounted).getTime() + WINDOW_MS) }
}
