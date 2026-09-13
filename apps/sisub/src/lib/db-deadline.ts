/**
 * Prazo por operação no pool do postgres-js — a trava que o driver não tem.
 *
 * Incidente de 2026-09-13: uma conexão da task com o Supavisor parou no meio do protocolo
 * estendido (backend `active`/`ClientRead` por 5h38). Nenhum timeout alcança esse estado: o
 * postgres-js não tem prazo de query, o `statement_timeout` do servidor não conta espera de
 * cliente, e o `max_lifetime` só recicla a conexão DEPOIS que a query termina — ou seja,
 * nunca. Com o pool cheio o driver ainda faz pipeline na conexão ocupada seguinte, em
 * round-robin, e as queries que caíam na travada esperavam para sempre: cinco horas de 504
 * em metade das server fns da task, com `/health` verde o tempo todo.
 *
 * O guard observa cada `unsafe` (toda query do Drizzle fora de transação) e cada `begin`
 * (a transação inteira, porque dentro dela o Drizzle usa o `sql` reservado, que não passa
 * por aqui). Passou do prazo: a operação rejeita com `QUERY_DEADLINE` e `onExpire` avisa o
 * dono do pool, que precisa recriá-lo — o postgres-js não expõe como derrubar UMA conexão,
 * e a travada segue ocupando a vaga até ser destruída.
 *
 * Módulo puro (sem env, sem driver) para ser testável sem banco.
 */

export const QUERY_DEADLINE_CODE = "QUERY_DEADLINE"

/** `Query` do postgres-js: um `Promise` com `reject` público. */
type PendingQuery = PromiseLike<unknown> & { reject?: (reason: unknown) => void }

export interface DeadlineGuardedClient {
	unsafe: (...args: never[]) => PendingQuery
	begin: (...args: never[]) => Promise<unknown>
}

export interface DeadlineTracker {
	/** Idade, em ms, da operação pendente mais antiga — 0 sem nenhuma. */
	oldestPendingMs: (now?: number) => number
}

interface GuardOptions {
	deadlineMs: number
	onExpire: (error: Error) => void
	tracker?: PendingSet
}

export class QueryDeadlineError extends Error {
	readonly code = QUERY_DEADLINE_CODE

	constructor(kind: "query" | "transaction", deadlineMs: number) {
		super(`${kind} passou de ${deadlineMs / 1000}s sem resposta do banco`)
		this.name = "QueryDeadlineError"
	}
}

export class PendingSet implements DeadlineTracker {
	private readonly startedAt = new Set<{ at: number }>()

	add(): { at: number } {
		const entry = { at: Date.now() }
		this.startedAt.add(entry)
		return entry
	}

	delete(entry: { at: number }) {
		this.startedAt.delete(entry)
	}

	oldestPendingMs(now = Date.now()): number {
		let oldest = now
		for (const entry of this.startedAt) oldest = Math.min(oldest, entry.at)
		return now - oldest
	}
}

/**
 * Devolve um Proxy do client que só troca `unsafe` e `begin`. Tudo mais passa direto — o
 * `drizzle()` escreve em `client.options.parsers`/`serializers` e precisa do objeto real.
 */
export function guardWithDeadline<T extends DeadlineGuardedClient>(client: T, options: GuardOptions): T {
	const { deadlineMs, onExpire } = options
	const pending = options.tracker ?? new PendingSet()

	function watch(kind: "query" | "transaction", settled: PromiseLike<unknown>, expire: (error: Error) => void) {
		const entry = pending.add()
		// A entrada só sai quando a operação REALMENTE termina (`clear`), nunca no disparo do
		// prazo: se nem o reject nem a destruição do pool a soltarem, é essa idade que o
		// `/health` precisa enxergar.
		const timer = setTimeout(() => {
			const error = new QueryDeadlineError(kind, deadlineMs)
			expire(error)
			onExpire(error)
		}, deadlineMs)
		const clear = () => {
			clearTimeout(timer)
			pending.delete(entry)
		}
		settled.then(clear, clear)
	}

	const unsafe = (...args: never[]) => {
		const query = client.unsafe(...args)
		// Anexar o `then` já dispara a execução — o mesmo que o `await` do Drizzle faz na linha
		// seguinte. `.values()` continua valendo: o postgres-js só despacha a query um microtask
		// depois, e o modo `values` é lido na hora de montar as linhas.
		watch("query", query, (error) => query.reject?.(error))
		return query
	}

	const begin = (...args: never[]) => {
		const transaction = client.begin(...args)
		return new Promise((resolve, reject) => {
			watch("transaction", transaction, reject)
			transaction.then(resolve, reject)
		})
	}

	return new Proxy(client, {
		get(target, property, receiver) {
			if (property === "unsafe") return unsafe
			if (property === "begin") return begin
			return Reflect.get(target, property, receiver)
		},
	})
}
