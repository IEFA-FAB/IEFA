/**
 * @module ai-logger
 * Logger mínimo para as chamadas diretas ao adapter.
 *
 * `TextOptions` do @tanstack/ai declara `logger` como obrigatório, e os adapters
 * do próprio TanStack o usam sem guarda — `logger.request(...)` na entrada e
 * `logger.errors(...)` no catch. O adapter de Bedrock do @iefa/ai-provider protege
 * com `?.`, então a falta passava despercebida enquanto o primário respondia; na
 * reserva com API key (o `<PREFIX>_FALLBACK_AI_*`), a mesma chamada morre em
 * "undefined is not an object (evaluating 'logger.request')" — e, pior, o catch
 * também chama o logger, então o erro REAL do provider é substituído por esse.
 *
 * Ou seja: sem isto, a reserva não é reserva. Um no-op basta; observabilidade de
 * IA no SUCONT não passa por aqui.
 */

type LogFn = (message: string, meta?: Record<string, unknown>) => void

export interface AdapterLogger {
	isEnabled: (category: string) => boolean
	provider: LogFn
	output: LogFn
	middleware: LogFn
	tools: LogFn
	sandbox: LogFn
	agentLoop: LogFn
	config: LogFn
	errors: LogFn
	request: LogFn
	warn: LogFn
	debug: LogFn
	info: LogFn
	error: LogFn
}

const noop: LogFn = () => {}

export const silentAdapterLogger: AdapterLogger = {
	isEnabled: () => false,
	provider: noop,
	output: noop,
	middleware: noop,
	tools: noop,
	sandbox: noop,
	agentLoop: noop,
	config: noop,
	errors: noop,
	request: noop,
	warn: noop,
	debug: noop,
	info: noop,
	error: noop,
}
