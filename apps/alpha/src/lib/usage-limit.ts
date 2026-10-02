/**
 * Tetos diários por pessoa — o freio de custo de toda rota que chama modelo ou recebe arquivo.
 *
 * Janela deslizante de 24 h sobre `chat_turn_usage` (o nome é histórico: a tabela nasceu para
 * o chat do contrate e virou o livro de uso de todo o α, com a coluna `kind`). Um registro por
 * chamada cobrada, SEM ligação com a conversa ou a submissão: contar no próprio objeto deixava
 * o teto ser zerado apagando o objeto.
 *
 * Antes deste módulo, só o chat do contrate tinha teto. ChatRADA, extração, verificação de
 * conformidade, avaliação de regra e coleta de fonte chamavam o modelo para qualquer JWT
 * válido, sem limite — e uma verificação são dezenas de chamadas (uma por regra ativa).
 *
 * `claimUsage` confere e registra na MESMA transação (`alpha.claim_usage`, com advisory lock
 * por pessoa e tipo). A versão anterior lia e depois gravava: um script com cem requisições
 * em paralelo passava inteiro pela leitura antes da primeira gravação. `dailyLimitState` é só
 * leitura, para a rota recusar cedo (antes do SSE, antes de gravar a pergunta); quem decide é
 * o `claimUsage`.
 */

import type { Context } from "hono"
import { type DailyLimitState, decideDailyLimit, WINDOW_MS } from "../chat/daily-limit.ts"
import { supabase } from "../db/supabase.ts"
import { env } from "../env.ts"

export const USAGE_KINDS = ["chat", "rada", "extraction", "compliance", "upload", "rule_evaluation", "source_refresh"] as const

export type UsageKind = (typeof USAGE_KINDS)[number]

/** Variável de ambiente que fixa cada teto (ver `env.ts`). */
const LIMIT_ENV = {
	chat: "ALPHA_CHAT_MAX_TURNS_PER_DAY",
	rada: "ALPHA_RADA_MAX_TURNS_PER_DAY",
	extraction: "ALPHA_EXTRACTIONS_MAX_PER_DAY",
	compliance: "ALPHA_COMPLIANCE_RUNS_MAX_PER_DAY",
	upload: "ALPHA_UPLOADS_MAX_PER_DAY",
	rule_evaluation: "ALPHA_RULE_EVALUATIONS_MAX_PER_DAY",
	source_refresh: "ALPHA_SOURCE_REFRESHES_MAX_PER_DAY",
} as const satisfies Record<UsageKind, keyof typeof env>

/** Código da resposta 429 e o que a mensagem conta, por teto. */
const LIMIT_COPY: Record<UsageKind, { code: string; noun: string }> = {
	chat: { code: "CHAT_DAILY_LIMIT", noun: "perguntas" },
	rada: { code: "RADA_DAILY_LIMIT", noun: "perguntas ao ChatRADA" },
	extraction: { code: "EXTRACTION_DAILY_LIMIT", noun: "extrações" },
	compliance: { code: "COMPLIANCE_DAILY_LIMIT", noun: "verificações de conformidade" },
	upload: { code: "UPLOAD_DAILY_LIMIT", noun: "envios de arquivo" },
	rule_evaluation: { code: "RULE_EVALUATION_DAILY_LIMIT", noun: "avaliações de regra" },
	source_refresh: { code: "SOURCE_REFRESH_DAILY_LIMIT", noun: "coletas de fonte" },
}

export function usageLimit(kind: UsageKind): number {
	return env[LIMIT_ENV[kind]]
}

/**
 * Leitura do teto, sem registrar nada. `null` = não foi possível conferir; a rota recusa (500)
 * em vez de liberar sem teto.
 */
export async function dailyLimitState(userId: string, kind: UsageKind, now: Date): Promise<DailyLimitState | null> {
	const max = usageLimit(kind)
	const { data, error } = await supabase
		.from("chat_turn_usage")
		.select("created_at")
		.eq("user_id", userId)
		.eq("kind", kind)
		.gt("created_at", new Date(now.getTime() - WINDOW_MS).toISOString())
		.order("created_at", { ascending: false })
		.limit(max)
	if (error) {
		console.error(`[usage] teto ${kind} não conferido: ${error.message}`)
		return null
	}
	return decideDailyLimit(
		(data ?? []).map((row) => row.created_at as string),
		max
	)
}

/**
 * Confere e registra um uso, atômico. `{ blocked: false }` = registrado; `{ blocked: true }` =
 * teto atingido, nada registrado; `null` = o banco não respondeu (a rota recusa).
 */
export async function claimUsage(userId: string, kind: UsageKind): Promise<DailyLimitState | null> {
	const { data, error } = await supabase.rpc("claim_usage", { p_user_id: userId, p_kind: kind, p_max: usageLimit(kind) })
	if (error) {
		console.error(`[usage] uso ${kind} não registrado: ${error.message}`)
		return null
	}
	const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; retry_at?: string | null } | undefined
	if (row?.allowed === true) return { blocked: false }
	if (row?.allowed === false && row.retry_at) return { blocked: true, retryAt: new Date(row.retry_at) }
	console.error(`[usage] resposta inesperada de claim_usage (${kind}): ${JSON.stringify(data)}`)
	return null
}

/** 429 legível, com `retry_after` no corpo e `Retry-After` em segundos. */
export function dailyLimitResponse(c: Context, kind: UsageKind, retryAt: Date) {
	const { code, noun } = LIMIT_COPY[kind]
	return c.json(
		{
			error: "Too Many Requests",
			code,
			message: `limite de ${usageLimit(kind)} ${noun} em 24 horas atingido`,
			retry_after: retryAt.toISOString(),
		},
		429,
		{ "retry-after": String(Math.max(1, Math.ceil((retryAt.getTime() - Date.now()) / 1000))) }
	)
}

/**
 * Cobra um uso antes da chamada cara. Devolve a resposta de recusa (429 no teto, 500 se o
 * teto não pôde ser conferido) ou `null` quando a rota pode seguir.
 */
export async function enforceUsage(c: Context, userId: string, kind: UsageKind): Promise<Response | null> {
	const state = await claimUsage(userId, kind)
	if (state === null) return c.json({ error: "Internal Server Error", code: "RATE_LIMIT_RECORD_FAILED" }, 500)
	if (state.blocked) return dailyLimitResponse(c, kind, state.retryAt)
	return null
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
