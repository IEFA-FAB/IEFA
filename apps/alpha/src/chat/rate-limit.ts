/**
 * Teto diário de perguntas por pessoa (`ALPHA_CHAT_MAX_TURNS_PER_DAY`).
 *
 * Janela deslizante de 24 h sobre `chat_turn_usage` — um registro por pergunta, SEM ligação com
 * a conversa. Contar em `chat_message` deixava o teto ser zerado apagando a conversa (as
 * mensagens caem em cascata). Em todas as conversas:
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
		.from("chat_turn_usage")
		.select("created_at")
		.eq("user_id", userId)
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

/** Registra uma pergunta no teto. `false` = não gravou: a rota recusa o turno (sem teto não há turno). */
export async function recordTurnUsage(userId: string): Promise<boolean> {
	const { error } = await supabase.from("chat_turn_usage").insert({ user_id: userId })
	if (error) console.error(`[chat] uso do teto diário não registrado: ${error.message}`)
	return !error
}

/** Apaga os registros que já saíram da janela do teto (a rotina diária de expurgo chama). */
export async function purgeTurnUsage(now: Date): Promise<number> {
	const { data, error } = await supabase
		.from("chat_turn_usage")
		.delete()
		.lt("created_at", new Date(now.getTime() - 2 * WINDOW_MS).toISOString())
		.select("id")
	if (error) throw new Error(`registros do teto diário não expurgados: ${error.message}`)
	return data?.length ?? 0
}
