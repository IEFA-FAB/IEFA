/**
 * `alpha.claim_usage` de memória, para os PostgREST falsos dos testes de rota.
 *
 * Mesma regra da função SQL (migration `20261001170000_alpha_abuse_limits.sql`): conta os usos
 * de (pessoa, tipo) nas últimas 24 h; no teto, recusa com `retry_at` = a mais antiga das `max`
 * mais recentes + 24 h; senão, devolve a linha a inserir.
 */

import { WINDOW_MS } from "../chat/daily-limit.ts"

type Row = Record<string, unknown>

export function fakeClaimUsage(
	rows: readonly Row[],
	args: Record<string, unknown>,
	now: number = Date.now()
): { reply: { allowed: boolean; retry_at: string | null }; inserted: Row | null } {
	const max = Number(args.p_max)
	const recent = rows
		.filter((row) => row.user_id === args.p_user_id && (row.kind ?? "chat") === args.p_kind)
		.map((row) => new Date(String(row.created_at)).getTime())
		.filter((at) => at > now - WINDOW_MS)
		.sort((left, right) => right - left)
		.slice(0, max)

	if (recent.length >= max) {
		const oldest = recent[recent.length - 1] ?? now
		return { reply: { allowed: false, retry_at: new Date(oldest + WINDOW_MS).toISOString() }, inserted: null }
	}
	return { reply: { allowed: true, retry_at: null }, inserted: { user_id: args.p_user_id, kind: args.p_kind, created_at: new Date(now).toISOString() } }
}
