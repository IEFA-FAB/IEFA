/**
 * Teto diário de perguntas por pessoa (`ALPHA_CHAT_MAX_TURNS_PER_DAY`).
 *
 * Janela deslizante de 24 h sobre `chat_message` (`role = 'user'`), em todas as conversas:
 * lê as `max` perguntas mais recentes na janela; se vieram `max`, o teto foi atingido, e o
 * envio volta a valer 24 h depois da MAIS ANTIGA delas — o momento em que ela sai da janela.
 *
 * Duas abas podem passar pela leitura ao mesmo tempo e enviar uma pergunta a mais cada. É
 * aceito: o teto é freio de custo, não controle de segurança, e o excesso se limita ao
 * número de abas abertas.
 */

import { supabase } from "../db/supabase.ts"
import { type DailyLimitState, decideDailyLimit, WINDOW_MS } from "./daily-limit.ts"

/** `null` = não foi possível conferir; a rota recusa (500) em vez de liberar sem teto. */
export async function dailyLimitState(userId: string, max: number, now: Date): Promise<DailyLimitState | null> {
	const { data, error } = await supabase
		.from("chat_message")
		.select("created_at")
		.eq("user_id", userId)
		.eq("role", "user")
		.gt("created_at", new Date(now.getTime() - WINDOW_MS).toISOString())
		.order("created_at", { ascending: false })
		.limit(max)
	if (error) {
		console.error(`[chat] teto diário não conferido: ${error.message}`)
		return null
	}
	return decideDailyLimit(
		(data ?? []).map((row) => row.created_at as string),
		max
	)
}
