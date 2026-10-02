/**
 * Registro de sessões HTTP do MCP — tetos, reservas e expiração. Separado de `index.ts` para
 * ser testável sem subir o servidor.
 *
 * Por que reserva: a vaga era contada só quando o SDK chamava `onsessioninitialized`, DEPOIS
 * de `connect` e `handleRequest` (dois `await`). N `initialize` concorrentes passavam todos
 * pela checagem do teto antes de o primeiro ocupar a vaga, e furavam o limite por usuário e o
 * global. Agora a vaga é reservada de forma síncrona no instante em que o `initialize` é
 * aceito, conta para o teto enquanto a sessão nasce, e é devolvida se ela não nascer.
 */

import { countUserSessions } from "./http-guards.ts"

/** Qualquer coisa com `close()` — o transport e o servidor MCP. */
export interface Closable {
	close(): Promise<void> | void
}

export interface SessionEntry<T extends Closable = Closable> {
	transport: T
	/** Servidor MCP conectado ao transport, fechado junto na expiração. */
	server?: Closable
	/** userId do usuário que criou a sessão — usado para verificar C1. */
	userId: string
	createdAt: number
	lastSeenAt: number
}

/** Vaga reservada para uma sessão que ainda está inicializando. */
export interface SessionReservation {
	readonly userId: string
	/** `pending` conta para o teto; `committed` virou sessão; `released` foi devolvida. */
	readonly state: "pending" | "committed" | "released"
}

export type ReserveResult = { ok: true; reservation: SessionReservation } | { ok: false; reason: "global" | "user" }

export interface SessionLimits {
	/** Sessões simultâneas no processo (vivas + inicializando). */
	maxSessions: number
	/** Sessões simultâneas por usuário (vivas + inicializando). */
	maxSessionsPerUser: number
}

interface MutableReservation {
	userId: string
	state: SessionReservation["state"]
}

/**
 * Fecha transport e servidor sem deixar exceção escapar — nem lançada de forma síncrona
 * nem como rejeição. Usado no sweep, que não pode morrer no meio por causa de uma sessão.
 */
export async function closeSessionQuietly(entry: { transport: Closable; server?: Closable }, onError: (error: unknown) => void): Promise<void> {
	// Transport primeiro: o close dele é idempotente e dispara o `onclose`, que o servidor
	// MCP usa para abortar handlers em voo. O close do servidor depois é no-op se o
	// transport já soltou, e cobre o caso de ele não ter soltado.
	for (const closable of [entry.transport, entry.server]) {
		if (!closable) continue
		try {
			await closable.close()
		} catch (error) {
			onError(error)
		}
	}
}

export class SessionRegistry<T extends Closable = Closable> {
	private readonly sessions = new Map<string, SessionEntry<T>>()
	private readonly pending = new Set<MutableReservation>()

	constructor(private readonly limits: SessionLimits) {}

	/** Sessões já inicializadas (o que o `/health` reporta). */
	get size(): number {
		return this.sessions.size
	}

	/** Reservas de sessões que ainda estão inicializando. */
	get pendingCount(): number {
		return this.pending.size
	}

	get(sessionId: string): SessionEntry<T> | undefined {
		return this.sessions.get(sessionId)
	}

	has(sessionId: string): boolean {
		return this.sessions.has(sessionId)
	}

	/** Remove a sessão do registro. Idempotente. */
	delete(sessionId: string): boolean {
		return this.sessions.delete(sessionId)
	}

	/** Sessões vivas + reservas pendentes deste usuário. */
	countForUser(userId: string): number {
		return countUserSessions(this.sessions.values(), userId) + countUserSessions(this.pending, userId)
	}

	/**
	 * Reserva uma vaga — síncrono, sem `await` entre a checagem e a ocupação, que é o que
	 * impede `initialize` concorrentes de passarem juntos pelo teto.
	 */
	tryReserve(userId: string): ReserveResult {
		if (this.sessions.size + this.pending.size >= this.limits.maxSessions) return { ok: false, reason: "global" }
		if (this.countForUser(userId) >= this.limits.maxSessionsPerUser) return { ok: false, reason: "user" }
		const reservation: MutableReservation = { userId, state: "pending" }
		this.pending.add(reservation)
		return { ok: true, reservation }
	}

	/** Converte a reserva em sessão. Reserva já devolvida não ressuscita. */
	commit(reservation: SessionReservation, sessionId: string, session: { transport: T; server?: Closable }, now: number = Date.now()): boolean {
		const mutable = reservation as MutableReservation
		if (mutable.state !== "pending" || !this.pending.has(mutable)) return false
		this.pending.delete(mutable)
		mutable.state = "committed"
		this.sessions.set(sessionId, { transport: session.transport, server: session.server, userId: mutable.userId, createdAt: now, lastSeenAt: now })
		return true
	}

	/** Devolve a vaga de uma sessão que não nasceu. Idempotente; no-op se já virou sessão. */
	release(reservation: SessionReservation): void {
		const mutable = reservation as MutableReservation
		if (mutable.state !== "pending") return
		this.pending.delete(mutable)
		mutable.state = "released"
	}

	/**
	 * Tira do registro as sessões inativas há mais de `ttlMs` e FECHA transport e servidor de
	 * cada uma — só apagar do Map deixava streams SSE e o servidor MCP vivos, fora de qualquer
	 * teto. A remoção é síncrona (uma requisição concorrente já não acha a sessão); os closes
	 * são aguardados, e erro de close vai para `onCloseError` sem interromper os demais.
	 */
	async sweepExpired(now: number, ttlMs: number, onCloseError: (sessionId: string, error: unknown) => void): Promise<string[]> {
		const expired: [string, SessionEntry<T>][] = []
		for (const [id, entry] of this.sessions) {
			if (now - entry.lastSeenAt > ttlMs) {
				this.sessions.delete(id)
				expired.push([id, entry])
			}
		}
		await Promise.all(expired.map(([id, entry]) => closeSessionQuietly(entry, (error) => onCloseError(id, error))))
		return expired.map(([id]) => id)
	}
}

/**
 * Conduz a primeira requisição de um transport novo, segurando a reserva. Se ao fim dela a
 * sessão não foi inicializada (requisição que não era `initialize`, `initialize` recusado,
 * exceção no meio), devolve a vaga e fecha transport e servidor, que de outro modo ficariam
 * conectados sem dono.
 */
export async function runFirstRequest<T extends Closable>(
	registry: SessionRegistry<T>,
	reservation: SessionReservation,
	session: { transport: Closable; server?: Closable },
	handle: () => Promise<void>,
	onCloseError: (error: unknown) => void
): Promise<void> {
	try {
		await handle()
	} finally {
		if (reservation.state !== "committed") {
			registry.release(reservation)
			await closeSessionQuietly(session, onCloseError)
		}
	}
}
