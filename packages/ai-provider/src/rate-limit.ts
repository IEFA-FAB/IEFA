/**
 * Freio de consumo dos adapters de IA — teto de requisições e de tokens.
 *
 * O custo do Bedrock é por token consumido, e um chat com tools consome o histórico
 * INTEIRO a cada turno: 8 iterações de uma conversa longa custam bem mais que 8 perguntas
 * soltas. Sem teto, uma aba esquecida em loop ou um usuário curioso viram fatura.
 *
 * Três limites, todos opcionais (ausente = sem teto):
 *   - requisições por minuto, por chave (o usuário) — corta loop de UI e martelada em botão;
 *   - tokens por minuto, por chave — corta a conversa que cresceu demais;
 *   - tokens por dia, por PROCESSO — o teto de custo propriamente dito.
 *
 * Limitação consciente: o estado é em memória, por processo. Com N tasks no ECS o teto
 * efetivo é N × o configurado. Dimensione considerando a contagem de tasks; um teto
 * distribuído (Redis/Postgres) só se justifica quando a frota crescer.
 */

/** Erro de teto atingido. Os endpoints do sisub traduzem em 429 com o header `Retry-After`. */
export class RateLimitError extends Error {
	constructor(
		message: string,
		readonly retryAfterSeconds: number,
		readonly limit: "requests-per-minute" | "tokens-per-minute" | "tokens-per-day"
	) {
		super(message)
		this.name = "RateLimitError"
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

/**
 * Chave de janela com o consumidor embutido. Sem o prefixo, MODULE_CHAT e ANALYTICS
 * dividiriam o mesmo balde: 12 mensagens no chat dos módulos faziam o assistente de
 * analytics responder 429 para o mesmo usuário.
 */
export function scopedKey(prefix: string | undefined, key: string): string {
	return prefix ? `${prefix}:${key}` : key
}

export interface RateLimitConfig {
	/** Requisições por minuto, por chave. */
	requestsPerMinute?: number
	/** Tokens (prompt + resposta) por minuto, por chave. */
	tokensPerMinute?: number
	/** Tokens por dia, somados de TODAS as chaves deste processo. */
	tokensPerDay?: number
}

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * 60 * 1000

interface Window {
	/** Início da janela corrente, em ms. */
	startedAt: number
	used: number
}

/** Contadores de janela fixa. Exportado para o teste conseguir um estado limpo. */
export class RateLimitStore {
	private readonly windows = new Map<string, Window>()

	private window(key: string, sizeMs: number, now: number): Window {
		const existing = this.windows.get(key)
		if (existing && now - existing.startedAt < sizeMs) return existing
		const fresh = { startedAt: now, used: 0 }
		this.windows.set(key, fresh)
		return fresh
	}

	/** Quanto falta para a janela virar, em segundos (mínimo 1). */
	private retryAfter(window: Window, sizeMs: number, now: number): number {
		return Math.max(1, Math.ceil((window.startedAt + sizeMs - now) / 1000))
	}

	/**
	 * Verifica os tetos de TOKENS. Não consome nada — é o que roda a cada iteração do loop
	 * agêntico, e uma pergunta do usuário não deve contar como N requisições.
	 */
	checkTokenBudgets(key: string, config: RateLimitConfig, now = Date.now()): void {
		if (config.tokensPerDay != null) {
			const day = this.window(this.dayKey(key), DAY_MS, now)
			if (day.used >= config.tokensPerDay) {
				throw new RateLimitError(
					`Orçamento diário de IA esgotado (${day.used.toLocaleString("pt-BR")} tokens). Tente novamente amanhã ou aumente o teto.`,
					this.retryAfter(day, DAY_MS, now),
					"tokens-per-day"
				)
			}
		}

		if (config.tokensPerMinute != null) {
			const tokens = this.window(`tokens:minute:${key}`, MINUTE_MS, now)
			if (tokens.used >= config.tokensPerMinute) {
				throw new RateLimitError(
					"Você atingiu o limite de tokens por minuto. Aguarde um instante antes de continuar.",
					this.retryAfter(tokens, MINUTE_MS, now),
					"tokens-per-minute"
				)
			}
		}
	}

	/** Verifica todos os tetos e consome UMA requisição. Chamado uma vez por turno do usuário. */
	admitRequest(key: string, config: RateLimitConfig, now = Date.now()): void {
		this.checkTokenBudgets(key, config, now)

		if (config.requestsPerMinute != null) {
			const requests = this.window(`requests:minute:${key}`, MINUTE_MS, now)
			if (requests.used >= config.requestsPerMinute) {
				throw new RateLimitError(
					"Você atingiu o limite de mensagens por minuto. Aguarde um instante antes de continuar.",
					this.retryAfter(requests, MINUTE_MS, now),
					"requests-per-minute"
				)
			}
			requests.used += 1
		}
	}

	/**
	 * A janela diária é do CONSUMIDOR, não do usuário: é teto de custo, e some todo mundo.
	 * `MODULE_CHAT:user-1` e `MODULE_CHAT:user-2` caem no mesmo `tokens:day:MODULE_CHAT`,
	 * enquanto `ANALYTICS:user-1` tem o seu.
	 */
	private dayKey(key: string): string {
		const scope = key.includes(":") ? key.slice(0, key.indexOf(":")) : ""
		return scope ? `tokens:day:${scope}` : "tokens:day"
	}

	/** Contabiliza os tokens de um turno já concluído. */
	recordTokens(key: string, tokens: number, now = Date.now()): void {
		if (!Number.isFinite(tokens) || tokens <= 0) return
		this.window(`tokens:minute:${key}`, MINUTE_MS, now).used += tokens
		this.window(this.dayKey(key), DAY_MS, now).used += tokens
	}

	/** Uso corrente — para observabilidade e teste. */
	snapshot(key: string, now = Date.now()): { requestsThisMinute: number; tokensThisMinute: number; tokensToday: number } {
		return {
			requestsThisMinute: this.window(`requests:minute:${key}`, MINUTE_MS, now).used,
			tokensThisMinute: this.window(`tokens:minute:${key}`, MINUTE_MS, now).used,
			tokensToday: this.window(this.dayKey(key), DAY_MS, now).used,
		}
	}

	reset(): void {
		this.windows.clear()
	}
}

/** Estado compartilhado do processo. */
export const defaultRateLimitStore = new RateLimitStore()

function positiveInt(name: string, raw: string | undefined): number | undefined {
	if (!raw) return undefined
	const parsed = Number(raw)
	if (!Number.isFinite(parsed) || parsed <= 0) {
		// Sem este aviso, um "1O000" (letra no lugar do zero) desliga o teto e nada denuncia:
		// a var está setada, o gráfico de custo é que responde, semanas depois.
		// biome-ignore lint/suspicious/noConsole: aviso de configuração, server-side
		console.warn(`[ai-provider] ${name}="${raw}" não é um inteiro positivo — teto ignorado.`)
		return undefined
	}
	return Math.trunc(parsed)
}

/**
 * Lê os tetos de `<PREFIX>_AI_MAX_REQUESTS_PER_MINUTE`, `<PREFIX>_AI_MAX_TOKENS_PER_MINUTE`
 * e `<PREFIX>_AI_MAX_TOKENS_PER_DAY`. Devolve `undefined` quando nenhum está configurado —
 * o chamador então não embrulha o adapter.
 */
export function rateLimitConfigFromEnv(prefix?: string): RateLimitConfig | undefined {
	const p = prefix ? `${prefix}_` : ""
	const config: RateLimitConfig = {
		requestsPerMinute: positiveInt(`${p}AI_MAX_REQUESTS_PER_MINUTE`, process.env[`${p}AI_MAX_REQUESTS_PER_MINUTE`]),
		tokensPerMinute: positiveInt(`${p}AI_MAX_TOKENS_PER_MINUTE`, process.env[`${p}AI_MAX_TOKENS_PER_MINUTE`]),
		tokensPerDay: positiveInt(`${p}AI_MAX_TOKENS_PER_DAY`, process.env[`${p}AI_MAX_TOKENS_PER_DAY`]),
	}
	const configured = Object.values(config).some((v) => v != null)
	return configured ? config : undefined
}

function totalTokensOf(value: unknown): number {
	const usage = (value as { usage?: { totalTokens?: unknown; promptTokens?: unknown; completionTokens?: unknown } } | null)?.usage
	if (!usage) return 0
	if (typeof usage.totalTokens === "number") return usage.totalTokens
	const prompt = typeof usage.promptTokens === "number" ? usage.promptTokens : 0
	const completion = typeof usage.completionTokens === "number" ? usage.completionTokens : 0
	return prompt + completion
}

/** Cast pontual: os adapters constroem os eventos AG-UI como objetos literais. */
function asStreamChunk(chunk: Record<string, unknown>): never {
	return chunk as never
}

/** Devolve o erro de teto de tokens em vez de lançá-lo — quem chama decide o que fazer. */
function tokenBudgetError(store: RateLimitStore, key: string, config: RateLimitConfig): RateLimitError | undefined {
	try {
		store.checkTokenBudgets(key, config)
		return undefined
	} catch (error) {
		if (error instanceof RateLimitError) return error
		throw error
	}
}

export interface WithRateLimitOptions {
	/** Chave do teto por usuário — o id do usuário autenticado. */
	key: string
	config: RateLimitConfig
	store?: RateLimitStore
}

/**
 * Embrulha um adapter aplicando os tetos: checa ANTES de chamar o provider (lança
 * `RateLimitError`) e contabiliza os tokens do `RUN_FINISHED` depois.
 *
 * Cada iteração do loop agêntico é uma chamada ao provider e conta no teto de tokens —
 * é assim que uma conversa que cresceu sozinha para de sangrar.
 */
export function withRateLimit<
	TAdapter extends { chatStream: (options: never) => AsyncIterable<unknown>; structuredOutput: (options: never) => Promise<unknown> },
>(adapter: TAdapter, { key, config, store = defaultRateLimitStore }: WithRateLimitOptions): TAdapter {
	return {
		...adapter,
		chatStream: async function* (options: never) {
			// O teto no meio do stream NÃO pode lançar: o @tanstack/ai repassa a exceção do
			// adapter, o SSE já está aberto e o usuário receberia uma conexão cortada — o
			// mesmo sintoma que este pacote existe para eliminar. Vira RUN_ERROR, que o
			// cliente já sabe mostrar.
			const exceeded = tokenBudgetError(store, key, config)
			if (exceeded) {
				yield asStreamChunk({ type: "RUN_ERROR", message: exceeded.message, code: exceeded.limit })
				return
			}

			for await (const chunk of adapter.chatStream(options)) {
				if ((chunk as { type?: string }).type === "RUN_FINISHED") {
					store.recordTokens(key, totalTokensOf(chunk))
				}
				yield chunk
			}
		},
		structuredOutput: async (options: never) => {
			store.checkTokenBudgets(key, config)
			const result = await adapter.structuredOutput(options)
			store.recordTokens(key, totalTokensOf(result))
			return result
		},
	} as TAdapter
}

/**
 * Aplica o teto de requisições do prefixo a uma chave, ANTES de abrir o stream — só assim o
 * endpoint consegue responder 429 com corpo legível; um erro lançado depois que o SSE já
 * começou vira conexão cortada, sem status.
 *
 * No-op quando nenhum teto está configurado para o prefixo.
 */
export function enforceRequestRateLimit(prefix: string | undefined, key: string, store: RateLimitStore = defaultRateLimitStore): void {
	const config = rateLimitConfigFromEnv(prefix)
	if (!config) return
	store.admitRequest(scopedKey(prefix, key), config)
}
