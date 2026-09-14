/**
 * Pool postgres-js que se recupera sozinho de conexão travada no pooler do Supabase.
 *
 * Incidente de 2026-09-13 (PR #326): uma conexão com o Supavisor parou no meio do protocolo
 * estendido — backend `active`/`ClientRead` por 5h38. Nenhum timeout alcança esse estado: o
 * postgres-js não tem prazo de query, o `statement_timeout` do servidor não conta espera de
 * cliente, e o `max_lifetime` só recicla a conexão DEPOIS que a query termina — ou seja,
 * nunca. Com o pool cheio o driver ainda empilhava queries novas na conexão ocupada seguinte
 * (pipeline, round-robin), e as que caíam na travada esperavam para sempre: cinco horas de
 * 504 numa task do sisub, com o `/health` verde.
 *
 * O que este módulo garante:
 * - **`max_pipeline` fica no default (100), de propósito.** Com o pool cheio, o `BEGIN` de uma
 *   transação é empilhado numa conexão ocupada, e a reserva dessa conexão (`onexecute`) só
 *   roda se `sent.length < max_pipeline`. Com um teto pequeno a conta dá falso, a reserva não
 *   acontece e a transação morre com UNSAFE_TRANSACTION: com 0, sempre; com 1, justamente
 *   sob carga, com todas as conexões ocupadas. O pipeline não é mais o perigo: a query
 *   empilhada atrás de uma conexão travada espera no máximo o prazo da travada, porque o
 *   reset destrói a conexão e rejeita a fila inteira.
 * - **Prazo contado do INÍCIO DA EXECUÇÃO, não da chamada.** Uma varredura periódica marca a
 *   query quando ela vira a query ativa de uma conexão; a transação, quando o callback começa
 *   (o BEGIN já rodou e a conexão está reservada). Espera na fila do pool não conta: contar
 *   faria um pico de tráfego comum derrubar o pool — e o reset empilharia a próxima leva.
 * - **Reset do pool.** Estourou o prazo: a operação rejeita com `QUERY_DEADLINE` e o pool é
 *   destruído (`end({ timeout: 0 })`). O postgres-js não expõe como derrubar UMA conexão, e a
 *   travada ocuparia a vaga para sempre. Efeito colateral aceito: as demais operações em curso
 *   naquele pool também falham.
 * - **Handle estável.** `sql` é um Proxy que aponta sempre para o pool VIGENTE, então quem
 *   capturou o `db` antes do reset (stream de chat, operação em várias etapas) segue
 *   funcionando no pool novo em vez de receber CONNECTION_ENDED para sempre. O pool novo
 *   herda `options.parsers`/`serializers` do anterior — é ali que o `drizzle()` grava os
 *   parsers transparentes de data/json na construção.
 * - **`isWedged()`** para o health check: operação rodando há mais de 2× o prazo (nem o reject
 *   nem a destruição a soltaram) ou parada na fila além de um teto. Sem round-trip ao banco:
 *   uma queda do Supabase não pode reprovar todas as tasks de uma vez.
 *
 * Um statement que já chegou ao servidor pode ter sido aplicado mesmo rejeitando aqui — o
 * reject não cancela nada no banco. Quem faz retry de escrita não idempotente precisa saber.
 */

import postgres from "postgres"

export const QUERY_DEADLINE_CODE = "QUERY_DEADLINE"

type OperationKind = "query" | "transaction"

export class QueryDeadlineError extends Error {
	readonly code = QUERY_DEADLINE_CODE

	constructor(kind: OperationKind, deadlineMs: number) {
		super(`${kind === "query" ? "query" : "transação"} passou de ${deadlineMs / 1000}s em execução sem resposta do banco`)
		this.name = "QueryDeadlineError"
	}
}

type Sql = postgres.Sql
type ConnectionOptions = Parameters<typeof postgres>[1]

export interface ResilientPostgresOptions {
	/** Opções do postgres-js. Não passar `max_pipeline` pequeno — ver o cabeçalho. */
	connection: ConnectionOptions
	/** Prazo de uma query fora de transação, contado do início da execução. */
	queryDeadlineMs?: number
	/** Prazo de uma transação inteira, contado do início do callback. */
	transactionDeadlineMs?: number
	/** Teto de espera na fila antes de `isWedged()` acusar — não rejeita nada. */
	queueCeilingMs?: number
	sweepIntervalMs?: number
	onReset?: (error: QueryDeadlineError) => void
	/** Injeção para teste. */
	factory?: (url: string, options: ConnectionOptions) => Sql
	now?: () => number
}

export interface ResilientPostgres {
	/** Handle estável — é isto que vai para o `drizzle()`. */
	sql: Sql
	isWedged: () => boolean
	/** Exposto para teste; em produção roda num intervalo. */
	sweep: () => void
}

interface Pending {
	kind: OperationKind
	pool: Sql
	createdAt: number
	startedAt: number | null
	expired: boolean
	isRunning: () => boolean
	expire: (error: QueryDeadlineError) => void
}

export function createResilientPostgres(url: string, options: ResilientPostgresOptions): ResilientPostgres {
	const { queryDeadlineMs = 45_000, transactionDeadlineMs = 55_000, queueCeilingMs = 5 * 60_000, sweepIntervalMs = 1000, onReset, now = Date.now } = options
	const factory = options.factory ?? ((u: string, o: ConnectionOptions) => postgres(u, o) as unknown as Sql)
	const pending = new Set<Pending>()
	let current: Sql | undefined
	let retired: Sql | undefined
	let timer: ReturnType<typeof setInterval> | undefined

	const deadlineOf = (kind: OperationKind) => (kind === "query" ? queryDeadlineMs : transactionDeadlineMs)

	function pool(): Sql {
		if (current) return current
		const next = factory(url, options.connection)
		if (retired) {
			Object.assign(next.options.parsers, retired.options.parsers)
			Object.assign(next.options.serializers, retired.options.serializers)
		}
		current = next
		if (!timer) {
			timer = setInterval(sweep, sweepIntervalMs)
			// Não segura o processo vivo (script, teste) só por causa da varredura.
			timer.unref?.()
		}
		return next
	}

	function reset(error: QueryDeadlineError) {
		const stale = current
		if (!stale) return
		retired = stale
		current = undefined
		onReset?.(error)
		// `timeout: 0` destrói as conexões na hora — esperar as queries em curso é esperar a
		// travada, que não termina.
		void stale.end({ timeout: 0 })
	}

	function track(entry: Pending, settled: PromiseLike<unknown>) {
		pending.add(entry)
		const clear = () => {
			pending.delete(entry)
		}
		settled.then(clear, clear)
	}

	function sweep() {
		const at = now()
		for (const entry of pending) {
			if (entry.startedAt === null && entry.isRunning()) entry.startedAt = at
			if (entry.startedAt === null || entry.expired) continue
			const deadline = deadlineOf(entry.kind)
			if (at - entry.startedAt <= deadline) continue
			entry.expired = true
			const error = new QueryDeadlineError(entry.kind, deadline)
			entry.expire(error)
			// Várias operações do mesmo pool expiram na mesma varredura: só a primeira reseta, e
			// uma do pool antigo não pode derrubar o novo.
			if (entry.pool === current) reset(error)
		}
	}

	function isWedged(): boolean {
		const at = now()
		for (const entry of pending) {
			if (entry.startedAt !== null ? at - entry.startedAt > 2 * deadlineOf(entry.kind) : at - entry.createdAt > queueCeilingMs) {
				return true
			}
		}
		return false
	}

	function unsafe(...args: Parameters<Sql["unsafe"]>) {
		const target = pool()
		const query = target.unsafe(...args)
		// `active`/`reject` são campos públicos da `Query` do postgres-js, fora dos tipos.
		const internals = query as unknown as { active?: boolean; reject?: (reason: unknown) => void }
		// Anexar o `then` dispara a execução — o mesmo que o `await` do Drizzle faz em seguida.
		// `.values()` encadeado continua valendo: o driver só despacha um microtask depois.
		track(
			{
				kind: "query",
				pool: target,
				createdAt: now(),
				startedAt: null,
				expired: false,
				isRunning: () => internals.active === true,
				expire: (error) => internals.reject?.(error),
			},
			query
		)
		return query
	}

	function begin(...args: unknown[]) {
		const target = pool()
		// `begin(fn)` ou `begin(options, fn)`.
		const fnIndex = args.length > 1 ? 1 : 0
		const fn = args[fnIndex] as (sql: unknown) => unknown
		let rejectOuter: (reason: unknown) => void = () => {}
		const entry: Pending = {
			kind: "transaction",
			pool: target,
			createdAt: now(),
			startedAt: null,
			expired: false,
			isRunning: () => false,
			expire: (error) => rejectOuter(error),
		}
		const wrapped = [...args]
		wrapped[fnIndex] = (sql: unknown) => {
			entry.startedAt = now()
			return fn(sql)
		}
		const transaction = (target.begin as unknown as (...a: unknown[]) => Promise<unknown>)(...wrapped)
		track(entry, transaction)
		return new Promise((resolve, reject) => {
			rejectOuter = reject
			transaction.then(resolve, reject)
		})
	}

	const sql = new Proxy((() => {}) as unknown as Sql, {
		get(_target, property) {
			if (property === "unsafe") return unsafe
			if (property === "begin") return begin
			const target = pool()
			const value = Reflect.get(target, property, target)
			return typeof value === "function" ? value.bind(target) : value
		},
		apply(_target, thisArg, args) {
			return Reflect.apply(pool() as unknown as (...a: unknown[]) => unknown, thisArg, args)
		},
	})

	return { sql, isWedged, sweep }
}
