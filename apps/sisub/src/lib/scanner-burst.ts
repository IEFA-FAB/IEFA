/**
 * Reconhecimento de rajada de leitor em modo teclado — lógica pura.
 *
 * Mora fora do hook de propósito: é aqui que estão as decisões que quebram na
 * prática (leitor lento, leitor sem terminador, digitação humana, rajada
 * abandonada), e testar isso com evento sintético de DOM esconderia o que
 * importa. O hook só traduz `keydown` em `feedKey` e executa o efeito.
 */

export interface BurstConfig {
	/** Intervalo máximo entre teclas para a sequência ainda ser rajada. */
	maxKeyIntervalMs: number
	/** Comprimento mínimo de uma leitura (EAN-8 e UPC-E têm 8). */
	minLength: number
	/** Terminador enviado pelo leitor; `none` = fecha por tempo. */
	terminator: "enter" | "tab" | "none"
	/** Tempo sem teclas que fecha a leitura quando não há terminador. */
	idleTimeoutMs: number
}

export interface BurstState {
	buffer: string
	lastKeyAt: number
}

export type BurstOutcome =
	/** Nada a fazer (tecla ignorada). */
	| { action: "ignore"; state: BurstState }
	/** Caractere acumulado; a leitura continua. */
	| { action: "buffer"; state: BurstState }
	/** Leitura completa. `preventDefault` indica terminador consumido. */
	| { action: "emit"; value: string; state: BurstState; preventDefault: boolean }
	/** Sequência descartada (curta demais ou fora de rajada). */
	| { action: "reset"; state: BurstState }

export const EMPTY_BURST: BurstState = { buffer: "", lastKeyAt: 0 }

export interface KeyEventLike {
	key: string
	timestamp: number
	/** Modificador pressionado → atalho do usuário, nunca leitura. */
	withModifier?: boolean
}

/**
 * Consome uma tecla. `timestamp` em milissegundos monotônicos
 * (`performance.now()`), para não depender do relógio de parede.
 */
export function feedKey(state: BurstState, event: KeyEventLike, config: BurstConfig): BurstOutcome {
	if (event.withModifier) return { action: "ignore", state }

	const isTerminator = (config.terminator === "enter" && event.key === "Enter") || (config.terminator === "tab" && event.key === "Tab")

	if (isTerminator) {
		if (state.buffer.length >= config.minLength) {
			return { action: "emit", value: state.buffer, state: EMPTY_BURST, preventDefault: true }
		}
		// terminador com buffer curto: era Enter de gente, deixa passar
		return { action: "reset", state: EMPTY_BURST }
	}

	if (event.key.length !== 1) return { action: "ignore", state }

	const withinBurst = state.lastKeyAt > 0 && event.timestamp - state.lastKeyAt <= config.maxKeyIntervalMs
	const buffer = withinBurst ? state.buffer + event.key : event.key
	const next: BurstState = { buffer, lastKeyAt: event.timestamp }

	// leitor sem terminador: a leitura só fecha por tempo, mas já dá para
	// emitir quando o comprimento esperado chegou e o chamador pede o fechamento
	// por idle (ver `closeOnIdle`)
	return { action: "buffer", state: next }
}

/**
 * Fecha a leitura por inatividade (leitor sem terminador). Devolve `null`
 * quando o que está no buffer não é leitura.
 */
export function closeOnIdle(state: BurstState, config: BurstConfig): string | null {
	if (state.buffer.length < config.minLength) return null
	return state.buffer
}

/** Rajada abandonada não pode ficar presa no buffer entre duas leituras. */
export function isStale(state: BurstState, now: number, config: BurstConfig): boolean {
	if (state.buffer === "" || state.lastKeyAt === 0) return false
	return now - state.lastKeyAt > Math.max(config.idleTimeoutMs * 8, 1000)
}
