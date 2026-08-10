/**
 * Preload do runtime: dá um `idleTimeout` explícito a todo `Bun.serve()`.
 *
 * Por quê: o padrão do Bun é 10 s e o `idle_timeout` do ALB compartilhado é 60 s.
 * Quando o servidor fecha a conexão ANTES do balanceador, o ALB reusa um socket já
 * morto (keep-alive) ou perde a resposta de um handler que passou de 10 s — e
 * devolve **502** com `HTTPCode_Target_5XX_Count` zerado, porque do ponto de vista
 * dele o alvo simplesmente sumiu no meio do request. Foi exatamente o que apareceu
 * em `sisub.iefa.com.br/global/ingredients`: `TargetResponseTime` travado em ~11,95 s,
 * rajadas de ELB 502, zero 5xx de target, zero `TargetConnectionErrorCount` e
 * nenhum host insalubre.
 *
 * A regra é a mesma de qualquer origin atrás de um LB: o **timeout de idle da origem
 * tem que ser maior que o do balanceador**, para que quem corta a conexão seja sempre
 * o ALB (que sabe transformar isso num 504 honesto) e nunca o servidor.
 *
 * Por que preload e não configuração: o entry do preset `bun` do Nitro chama
 * `serve()` do srvx com `bun: { websocket }` fixo — o spread `...options.bun` do srvx
 * repassaria um `idleTimeout`, mas o Nitro não expõe nenhum caminho (config, env ou
 * hook) para chegar até lá. Envolver `Bun.serve` num `--preload` resolve sem
 * forkar o preset nem editar o bundle gerado.
 *
 * Um `idleTimeout` explícito nas opções da chamada continua vencendo (o spread vem
 * depois do default), então isto é um piso, não uma imposição.
 */

/** Segundos. Precisa ser > `idle_timeout` do ALB (60 s) e ≤ 255 (limite do Bun). */
const DEFAULT_IDLE_TIMEOUT_SECONDS = 120

const originalServe = Bun.serve

// `any` aqui é deliberado: `Bun.serve` é um conjunto de sobrecargas e este arquivo
// existe para repassá-las intactas, não para re-tipá-las.
type ServeOptions = { idleTimeout?: number } & Record<string, unknown>

Bun.serve = function serveWithIdleTimeout(options: ServeOptions, ...rest: unknown[]) {
	const withDefault =
		options && typeof options === "object" ? { idleTimeout: DEFAULT_IDLE_TIMEOUT_SECONDS, ...options } : options

	return (originalServe as (...args: unknown[]) => unknown).call(Bun, withDefault, ...rest)
} as typeof Bun.serve

export {}
