import { describe, expect, test } from "bun:test"
import { type Closable, runFirstRequest, SessionRegistry, type SessionReservation } from "./session-limits.ts"

class FakeClosable implements Closable {
	closed = 0
	constructor(private readonly behavior: "ok" | "throw" | "reject" = "ok") {}
	close(): Promise<void> | void {
		this.closed++
		if (this.behavior === "throw") throw new Error("close síncrono falhou")
		if (this.behavior === "reject") return Promise.reject(new Error("close assíncrono falhou"))
	}
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/**
 * Reproduz o caminho de `index.ts` para um `initialize`: reserva síncrona, depois os
 * `await` de `connect`/`handleRequest`, e só então o `onsessioninitialized` do SDK.
 */
async function simulateInitialize(registry: SessionRegistry<FakeClosable>, userId: string, sessionId: string): Promise<"created" | "global" | "user"> {
	const reserved = registry.tryReserve(userId)
	if (!reserved.ok) return reserved.reason
	const session = { transport: new FakeClosable(), server: new FakeClosable() }
	await runFirstRequest(
		registry,
		reserved.reservation,
		session,
		async () => {
			await tick()
			await tick()
			registry.commit(reserved.reservation, sessionId, session)
		},
		() => {}
	)
	return "created"
}

describe("tetos com initialize concorrentes", () => {
	test("N initialize do mesmo usuário em paralelo não passam do teto por usuário", async () => {
		// O bug: a vaga só era contada no onsessioninitialized, depois de dois `await`. Os 15
		// passavam juntos pela checagem e o usuário ficava com 15 sessões num teto de 10.
		const registry = new SessionRegistry<FakeClosable>({ maxSessions: 200, maxSessionsPerUser: 10 })

		const outcomes = await Promise.all(Array.from({ length: 15 }, (_, i) => simulateInitialize(registry, "user-a", `s-${i}`)))

		expect(outcomes.filter((o) => o === "created")).toHaveLength(10)
		expect(outcomes.filter((o) => o === "user")).toHaveLength(5)
		expect(registry.size).toBe(10)
		expect(registry.countForUser("user-a")).toBe(10)
		expect(registry.pendingCount).toBe(0)
	})

	test("N initialize de usuários diferentes em paralelo não passam do teto global", async () => {
		const registry = new SessionRegistry<FakeClosable>({ maxSessions: 3, maxSessionsPerUser: 10 })

		const outcomes = await Promise.all(Array.from({ length: 6 }, (_, i) => simulateInitialize(registry, `user-${i}`, `s-${i}`)))

		expect(outcomes.filter((o) => o === "created")).toHaveLength(3)
		expect(outcomes.filter((o) => o === "global")).toHaveLength(3)
		expect(registry.size).toBe(3)
	})

	test("reserva pendente conta para o teto antes de a sessão nascer", () => {
		const registry = new SessionRegistry<FakeClosable>({ maxSessions: 200, maxSessionsPerUser: 1 })

		expect(registry.tryReserve("user-a").ok).toBe(true)
		expect(registry.tryReserve("user-a")).toEqual({ ok: false, reason: "user" })
		// Outro usuário não é afetado.
		expect(registry.tryReserve("user-b").ok).toBe(true)
	})
})

describe("reserva devolvida quando a sessão não nasce", () => {
	test("initialize que lança devolve a vaga e fecha transport e servidor", async () => {
		const registry = new SessionRegistry<FakeClosable>({ maxSessions: 200, maxSessionsPerUser: 1 })
		const reserved = registry.tryReserve("user-a")
		if (!reserved.ok) throw new Error("reserva deveria passar")
		const session = { transport: new FakeClosable(), server: new FakeClosable() }

		const outcome = await runFirstRequest(
			registry,
			reserved.reservation,
			session,
			async () => {
				await tick()
				throw new Error("handleRequest explodiu")
			},
			() => {}
		).then(
			() => null,
			(error: unknown) => error
		)

		expect(outcome).toBeInstanceOf(Error)
		expect(registry.pendingCount).toBe(0)
		expect(session.transport.closed).toBe(1)
		expect(session.server.closed).toBe(1)
		// A vaga voltou: o usuário consegue abrir outra sessão.
		expect(registry.tryReserve("user-a").ok).toBe(true)
	})

	test("primeira requisição que não é initialize (sem commit) devolve a vaga e fecha", async () => {
		const registry = new SessionRegistry<FakeClosable>({ maxSessions: 1, maxSessionsPerUser: 1 })
		const reserved = registry.tryReserve("user-a")
		if (!reserved.ok) throw new Error("reserva deveria passar")
		const session = { transport: new FakeClosable(), server: new FakeClosable() }

		await runFirstRequest(
			registry,
			reserved.reservation,
			session,
			async () => {},
			() => {}
		)

		expect(reserved.reservation.state).toBe("released")
		expect(session.transport.closed).toBe(1)
		expect(registry.tryReserve("user-b").ok).toBe(true)
	})

	test("initialize bem-sucedido mantém a sessão aberta", async () => {
		const registry = new SessionRegistry<FakeClosable>({ maxSessions: 200, maxSessionsPerUser: 10 })
		const reserved = registry.tryReserve("user-a")
		if (!reserved.ok) throw new Error("reserva deveria passar")
		const session = { transport: new FakeClosable(), server: new FakeClosable() }

		await runFirstRequest(
			registry,
			reserved.reservation,
			session,
			async () => {
				registry.commit(reserved.reservation, "s-1", session, 1_000)
			},
			() => {}
		)

		expect(registry.get("s-1")).toMatchObject({ userId: "user-a", createdAt: 1_000, lastSeenAt: 1_000 })
		expect(session.transport.closed).toBe(0)
		expect(registry.pendingCount).toBe(0)
	})

	test("transport fechado antes de inicializar devolve a vaga; reserva devolvida não ressuscita", () => {
		const registry = new SessionRegistry<FakeClosable>({ maxSessions: 200, maxSessionsPerUser: 1 })
		const reserved = registry.tryReserve("user-a")
		if (!reserved.ok) throw new Error("reserva deveria passar")
		const reservation: SessionReservation = reserved.reservation

		// O `transport.onclose` de `index.ts` chama `release` — idempotente.
		registry.release(reservation)
		registry.release(reservation)

		expect(registry.pendingCount).toBe(0)
		expect(registry.commit(reservation, "s-1", { transport: new FakeClosable() })).toBe(false)
		expect(registry.size).toBe(0)
	})

	test("release depois do commit não tira a sessão nem libera vaga", () => {
		const registry = new SessionRegistry<FakeClosable>({ maxSessions: 200, maxSessionsPerUser: 1 })
		const reserved = registry.tryReserve("user-a")
		if (!reserved.ok) throw new Error("reserva deveria passar")

		registry.commit(reserved.reservation, "s-1", { transport: new FakeClosable() })
		registry.release(reserved.reservation)

		expect(registry.has("s-1")).toBe(true)
		expect(registry.tryReserve("user-a")).toEqual({ ok: false, reason: "user" })
	})
})

describe("sweepExpired", () => {
	function registryWith(entries: { id: string; lastSeenAt: number; transport?: FakeClosable; server?: FakeClosable }[]) {
		const registry = new SessionRegistry<FakeClosable>({ maxSessions: 200, maxSessionsPerUser: 200 })
		for (const e of entries) {
			const reserved = registry.tryReserve("user-a")
			if (!reserved.ok) throw new Error("reserva deveria passar")
			registry.commit(reserved.reservation, e.id, { transport: e.transport ?? new FakeClosable(), server: e.server }, e.lastSeenAt)
		}
		return registry
	}

	test("sessão expirada sai do registro E tem transport e servidor fechados", async () => {
		// O bug: o sweep só fazia `sessions.delete`, e o transport (com streams SSE) e o
		// servidor MCP ficavam vivos, fora de qualquer teto.
		const transport = new FakeClosable()
		const server = new FakeClosable()
		const live = new FakeClosable()
		const registry = registryWith([
			{ id: "velha", lastSeenAt: 0, transport, server },
			{ id: "viva", lastSeenAt: 9_000, transport: live },
		])

		const expired = await registry.sweepExpired(10_000, 5_000, () => {})

		expect(expired).toEqual(["velha"])
		expect(registry.has("velha")).toBe(false)
		expect(registry.has("viva")).toBe(true)
		expect(transport.closed).toBe(1)
		expect(server.closed).toBe(1)
		expect(live.closed).toBe(0)
	})

	test("a remoção é síncrona: uma requisição concorrente já não acha a sessão", () => {
		const registry = registryWith([{ id: "velha", lastSeenAt: 0 }])

		void registry.sweepExpired(10_000, 5_000, () => {})

		expect(registry.has("velha")).toBe(false)
	})

	test("close que lança (síncrono ou rejeição) não derruba o sweep nem impede os outros closes", async () => {
		const throwing = new FakeClosable("throw")
		const rejecting = new FakeClosable("reject")
		const rejectingServer = new FakeClosable("reject")
		const fine = new FakeClosable()
		const registry = registryWith([
			{ id: "a", lastSeenAt: 0, transport: throwing },
			{ id: "b", lastSeenAt: 0, transport: rejecting, server: rejectingServer },
			{ id: "c", lastSeenAt: 0, transport: fine },
		])
		const errors: [string, unknown][] = []

		const expired = await registry.sweepExpired(10_000, 5_000, (id, error) => errors.push([id, error]))

		expect(expired.sort()).toEqual(["a", "b", "c"])
		expect(registry.size).toBe(0)
		// O servidor de "b" é fechado mesmo com o transport dele falhando.
		expect([throwing.closed, rejecting.closed, rejectingServer.closed, fine.closed]).toEqual([1, 1, 1, 1])
		expect(errors.map(([id]) => id).sort()).toEqual(["a", "b", "b"])
	})
})
