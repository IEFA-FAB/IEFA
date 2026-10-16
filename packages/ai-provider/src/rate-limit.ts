/**
 * Freio de consumo dos adapters de IA — teto de requisições e de tokens.
 *
 * O custo do Bedrock é por token consumido, e um chat com tools consome o histórico
 * INTEIRO a cada turno: 8 iterações de uma conversa longa custam bem mais que 8 perguntas
 * soltas. Sem teto, uma aba esquecida em loop ou um usuário curioso viram fatura.
 *
 * Quatro limites, todos opcionais (ausente = sem teto):
 *   - requisições por minuto, por chave (o usuário) — corta loop de UI e martelada em botão;
 *   - tokens por minuto, por chave — corta a conversa que cresceu demais;
 *   - tokens por dia, por chave — um usuário não esgota sozinho o orçamento de todos;
 *   - tokens por dia, por PROCESSO — o teto de custo propriamente dito.
 *
 * Tokens contam no INÍCIO de cada chamada ao provider (estimativa do prompt, que é o grosso do
 * custo num loop agêntico) e são acertados pelo `usage` do `RUN_FINISHED`. Contar só no fim
 * deixava de fora a chamada que não termina: aba fechada no meio do stream, `RUN_ERROR` do
 * provider, timeout. O prompt já tinha sido cobrado pelo provider e não entrava em teto nenhum.
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
		readonly limit: "requests-per-minute" | "tokens-per-minute" | "tokens-per-day" | "tokens-per-day-per-user"
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
	/** Tokens por dia, por chave — a fatia de um usuário no orçamento diário. */
	tokensPerDayPerUser?: number
}

/**
 * Prompt estimado de uma chamada ao provider (histórico + system prompts), a ~4 caracteres por
 * token — a faixa de português e JSON nos tokenizadores em uso. Serve para COBRAR ANTES, não
 * para faturar: o `usage` do provider acerta a conta quando a chamada termina. Ferramentas ficam
 * de fora (fixas e pequenas perto do histórico).
 */
export function estimatePromptTokens(options: unknown): number {
	const { messages, systemPrompts } = (options ?? {}) as { messages?: unknown; systemPrompts?: unknown }
	let chars = 0
	if (messages != null) chars += JSON.stringify(messages)?.length ?? 0
	if (systemPrompts != null) chars += JSON.stringify(systemPrompts)?.length ?? 0
	return Math.ceil(chars / 4)
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

		if (config.tokensPerDayPerUser != null) {
			const mine = this.window(this.userDayKey(key), DAY_MS, now)
			if (mine.used >= config.tokensPerDayPerUser) {
				throw new RateLimitError(
					`Você atingiu o seu limite diário de uso do assistente (${mine.used.toLocaleString("pt-BR")} tokens). Tente novamente amanhã.`,
					this.retryAfter(mine, DAY_MS, now),
					"tokens-per-day-per-user"
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

	/** Janela diária DA CHAVE (o usuário dentro do consumidor), ao lado da do consumidor. */
	private userDayKey(key: string): string {
		return `tokens:day:user:${key}`
	}

	/** As três janelas de tokens de uma chave: minuto, dia da chave e dia do consumidor. */
	private tokenWindows(key: string): [string, number][] {
		return [
			[`tokens:minute:${key}`, MINUTE_MS],
			[this.userDayKey(key), DAY_MS],
			[this.dayKey(key), DAY_MS],
		]
	}

	/** Contabiliza tokens nas janelas correntes de minuto, dia da chave e dia do consumidor. */
	recordTokens(key: string, tokens: number, now = Date.now()): void {
		if (!Number.isFinite(tokens) || tokens <= 0) return
		for (const [windowKey, size] of this.tokenWindows(key)) this.window(windowKey, size, now).used += tokens
	}

	/**
	 * Devolve o que a estimativa cobrou a mais, só nas janelas que ainda são as da cobrança
	 * (`chargedAt`). Janela que virou no meio da chamada não recebe devolução: o excesso ficou na
	 * janela fechada, e descontar da nova liberaria tokens que ninguém tinha cobrado nela.
	 */
	refundTokens(key: string, tokens: number, chargedAt: number, now = Date.now()): void {
		if (!Number.isFinite(tokens) || tokens <= 0) return
		for (const [windowKey, size] of this.tokenWindows(key)) {
			const window = this.windows.get(windowKey)
			if (!window || now - window.startedAt >= size || window.startedAt > chargedAt) continue
			window.used = Math.max(0, window.used - tokens)
		}
	}

	/** Uso corrente — para observabilidade e teste. */
	snapshot(key: string, now = Date.now()): { requestsThisMinute: number; tokensThisMinute: number; tokensToday: number; tokensTodayForKey: number } {
		return {
			requestsThisMinute: this.window(`requests:minute:${key}`, MINUTE_MS, now).used,
			tokensThisMinute: this.window(`tokens:minute:${key}`, MINUTE_MS, now).used,
			tokensToday: this.window(this.dayKey(key), DAY_MS, now).used,
			tokensTodayForKey: this.window(this.userDayKey(key), DAY_MS, now).used,
		}
	}

	reset(): void {
		this.windows.clear()
	}
}

/** Estado compartilhado do processo. */
export const defaultRateLimitStore = new RateLimitStore()

/** Valor de env que desliga um teto de propósito, inclusive o default declarado no código. */
const CAP_OFF = "off"

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
 * Lê os tetos de `<PREFIX>_AI_MAX_REQUESTS_PER_MINUTE`, `<PREFIX>_AI_MAX_TOKENS_PER_MINUTE`,
 * `<PREFIX>_AI_MAX_TOKENS_PER_DAY` e `<PREFIX>_AI_MAX_TOKENS_PER_DAY_PER_USER`. Devolve
 * `undefined` quando nenhum está configurado — o chamador então não embrulha o adapter.
 *
 * `defaults` preenche o teto que o env não define: é o piso que o consumidor declara no código
 * para não depender de a variável existir na task definition. O env, quando presente, vence; o
 * valor `off` desliga o teto, inclusive o default (sem ele, só daria para subir, nunca tirar).
 */
export function rateLimitConfigFromEnv(prefix?: string, defaults: RateLimitConfig = {}): RateLimitConfig | undefined {
	const p = prefix ? `${prefix}_` : ""
	const read = (name: string, fallback: number | undefined) => {
		const raw = process.env[`${p}${name}`]
		if (raw?.trim().toLowerCase() === CAP_OFF) return undefined
		return positiveInt(`${p}${name}`, raw) ?? fallback
	}
	const config: RateLimitConfig = {
		requestsPerMinute: read("AI_MAX_REQUESTS_PER_MINUTE", defaults.requestsPerMinute),
		tokensPerMinute: read("AI_MAX_TOKENS_PER_MINUTE", defaults.tokensPerMinute),
		tokensPerDay: read("AI_MAX_TOKENS_PER_DAY", defaults.tokensPerDay),
		tokensPerDayPerUser: read("AI_MAX_TOKENS_PER_DAY_PER_USER", defaults.tokensPerDayPerUser),
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

type Charge = { estimated: number; chargedAt: number }

/** Cobra a estimativa do prompt no início da chamada. */
function chargeEstimate(store: RateLimitStore, key: string, options: unknown): Charge {
	const charge = { estimated: estimatePromptTokens(options), chargedAt: Date.now() }
	store.recordTokens(key, charge.estimated, charge.chargedAt)
	return charge
}

/**
 * Acerta a estimativa pelo `usage` real: cobra a diferença se gastou mais, devolve (só na janela
 * da cobrança) se gastou menos. Sem `usage` (provider que não informa), a estimativa fica.
 */
function settleCharge(store: RateLimitStore, key: string, charge: Charge, actual: number): void {
	if (actual <= 0) return
	const delta = actual - charge.estimated
	if (delta > 0) store.recordTokens(key, delta)
	else store.refundTokens(key, -delta, charge.chargedAt)
}

/**
 * Saída presumida de uma `structuredOutput` ABORTADA pelo PRAZO quando a chamada não pediu
 * `maxTokens`.
 *
 * Abortada, a chamada não devolve `usage`, mas o provider fatura a saída gerada até o corte.
 * Sem cobrança nenhuma, o prazo virava atalho: a geração cortada saía quase de graça para o
 * teto e continuava cara na fatura. Não há como medir a saída de uma chamada não-stream, então
 * a conta do prazo é conservadora: o `maxTokens` pedido, ou este valor, que é a ordem de
 * grandeza do que um modelo da casa gera em ~50 s (o prazo das server functions do sucont).
 * Erra para mais de propósito: quem esgota o teto assim está batendo no prazo.
 *
 * O prazo se reconhece pelo `reason` do abort com nome `TimeoutError`, a convenção do
 * `AbortSignal.timeout()` da plataforma, que o `withGenerationDeadline` do sucont segue.
 */
export const ABORTED_OUTPUT_ALLOWANCE_TOKENS = 4_096

/**
 * Taxa presumida de saída para o abort que NÃO é prazo (cliente fechou a aba, apertou
 * "Interromper"). Cobrar o teto cheio aí punia quem desiste cedo: no SAC-DGC, com `maxTokens`
 * de 16 mil, sete cancelamentos em um minuto bloqueavam o usuário em toda a IA do sucont. A
 * conta passa a ser proporcional ao tempo da chamada, limitada ao mesmo teto do prazo:
 * ~4 096 tokens em ~50 s dá esta taxa, a mesma régua do abono acima.
 */
export const ABORTED_OUTPUT_TOKENS_PER_SECOND = 80

function abortSignalOf(options: unknown): AbortSignal | undefined {
	return (options as { abortController?: AbortController } | undefined)?.abortController?.signal
}

/** Saída cobrada de uma `structuredOutput` abortada: teto cheio no prazo, proporcional no cancelamento. */
function abortedOutputCharge(options: unknown, elapsedMs: number): number {
	const maxTokens = (options as { modelOptions?: { maxTokens?: unknown } } | undefined)?.modelOptions?.maxTokens
	const ceiling = typeof maxTokens === "number" && maxTokens > 0 ? maxTokens : ABORTED_OUTPUT_ALLOWANCE_TOKENS
	const reason = abortSignalOf(options)?.reason as { name?: unknown } | undefined
	if (reason?.name === "TimeoutError") return ceiling
	return Math.min(ceiling, Math.ceil((Math.max(0, elapsedMs) / 1000) * ABORTED_OUTPUT_TOKENS_PER_SECOND))
}

/** Caracteres de conteúdo GERADO num evento do stream (texto, raciocínio, argumento de tool). */
function generatedChars(chunk: unknown): number {
	const { type, delta } = (chunk ?? {}) as { type?: unknown; delta?: unknown }
	if (typeof delta !== "string") return 0
	return type === "TEXT_MESSAGE_CONTENT" || type === "TOOL_CALL_ARGS" || type === "REASONING_MESSAGE_CONTENT" ? delta.length : 0
}

export interface WithRateLimitOptions {
	/** Chave do teto por usuário — o id do usuário autenticado. */
	key: string
	config: RateLimitConfig
	store?: RateLimitStore
}

/**
 * Embrulha um adapter aplicando os tetos: checa ANTES de chamar o provider (lança
 * `RateLimitError`), cobra a estimativa do prompt no início da chamada e acerta pelo `usage`
 * do `RUN_FINISHED` depois.
 *
 * Cada iteração do loop agêntico é uma chamada ao provider e conta no teto de tokens —
 * é assim que uma conversa que cresceu sozinha para de sangrar. A cobrança antecipada é o que
 * faz contar também a chamada que nunca chega ao `RUN_FINISHED` (aba fechada, erro do provider).
 *
 * Limitação conhecida: com reserva (`withFallbackChain` por dentro deste embrulho), a chamada em
 * que o primário falha depois de ler o prompt e a reserva o repete conta uma estimativa só,
 * acertada pelo `usage` da reserva; o prompt lido pelo primário fica fora. A reserva só entra em
 * falha transitória antes do primeiro conteúdo, então é exceção, não o caso comum.
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

			const charge = chargeEstimate(store, key, options)
			let settled = false
			let outputChars = 0
			try {
				for await (const chunk of adapter.chatStream(options)) {
					if ((chunk as { type?: string }).type === "RUN_FINISHED") {
						settleCharge(store, key, charge, totalTokensOf(chunk))
						settled = true
					}
					outputChars += generatedChars(chunk)
					yield chunk
				}
			} finally {
				// Run que não chegou ao RUN_FINISHED (aba fechada, abort, erro do provider): sem
				// `usage`, a saída que já passou por aqui foi faturada e entra no teto, à mesma
				// régua de ~4 caracteres por token da estimativa. É piso, não conta exata.
				if (!settled && outputChars > 0) store.recordTokens(key, Math.ceil(outputChars / 4))
			}
		},
		structuredOutput: async (options: never) => {
			store.checkTokenBudgets(key, config)
			// O prompt está em `chatOptions`; estimar sobre `options` cobrava zero antes da chamada.
			const chatOptions = (options as { chatOptions?: unknown }).chatOptions
			const charge = chargeEstimate(store, key, chatOptions)
			let result: Awaited<ReturnType<TAdapter["structuredOutput"]>>
			try {
				result = (await adapter.structuredOutput(options)) as typeof result
			} catch (error) {
				// Abortada, a saída gerada até o corte foi faturada sem `usage`. Ver
				// `ABORTED_OUTPUT_ALLOWANCE_TOKENS` e `ABORTED_OUTPUT_TOKENS_PER_SECOND`.
				if (abortSignalOf(chatOptions)?.aborted) store.recordTokens(key, abortedOutputCharge(chatOptions, Date.now() - charge.chargedAt))
				throw error
			}
			settleCharge(store, key, charge, totalTokensOf(result))
			return result
		},
	} as TAdapter
}

/**
 * Aplica os tetos do prefixo a uma chave, ANTES de abrir o stream — só assim o endpoint
 * consegue responder 429 com corpo legível; um erro lançado depois que o SSE já começou vira
 * conexão cortada, sem status. O turno conta aqui, no início (requisição por minuto), e o de
 * quem já esgotou os tokens do dia ou do minuto é recusado antes de chegar ao provider.
 *
 * `defaults`: os mesmos passados a `createAdapterFromEnv`, senão endpoint e adapter divergem
 * sobre o teto. No-op quando nenhum teto está configurado para o prefixo.
 */
export function enforceRequestRateLimit(
	prefix: string | undefined,
	key: string,
	store: RateLimitStore = defaultRateLimitStore,
	defaults: RateLimitConfig = {}
): void {
	const config = rateLimitConfigFromEnv(prefix, defaults)
	if (!config) return
	store.admitRequest(scopedKey(prefix, key), config)
}
