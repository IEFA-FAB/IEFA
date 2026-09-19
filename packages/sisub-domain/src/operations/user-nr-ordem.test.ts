/**
 * Vínculo do Nr. de Ordem: write-once e exclusivo (achado LGPD da auditoria de 2026-09-19).
 *
 * Livre para regravar, o nrOrdem da própria conta virava consulta de CPF por número de ordem:
 * grava o de outra pessoa, lê os dados militares dela, troca de novo.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { DomainError } from "../types/errors.ts"
import { syncUserNrOrdem } from "./user.ts"

type State = {
	/** nrOrdem atual da conta (null = sem vínculo). */
	current: string | null
	/** O nrOrdem atual localiza cadastro militar? */
	currentHasMilitary: boolean
	/** Outra conta já tem o nrOrdem pedido? */
	takenByOther: boolean
}

/**
 * Stub decidido pelas COLUNAS pedidas: `{ nrOrdem }` = vínculo atual; `{ nrCpf, ... }` = cadastro
 * militar; `{ id }` = outra conta com o mesmo nrOrdem. O upsert registra o payload gravado.
 */
function fakeDb(state: State) {
	const written: Array<Record<string, unknown>> = []
	const select = (cols: Record<string, unknown>) => {
		const rows = () => {
			if ("nrCpf" in cols) return state.currentHasMilitary ? [{ nrOrdem: state.current, nrCpf: "12345678901" }] : []
			if ("nrOrdem" in cols) return [{ nrOrdem: state.current }]
			return state.takenByOther ? [{ id: "other-user" }] : []
		}
		const chain = {
			from: () => chain,
			where: () => chain,
			orderBy: () => chain,
			limit: () => Promise.resolve(rows()),
		}
		return chain
	}
	const insert = () => ({
		values: (values: Record<string, unknown>) => ({
			onConflictDoUpdate: () => {
				written.push(values)
				return Promise.resolve()
			},
		}),
	})
	// A operação roda numa transação com lock por nrOrdem; o fake executa o corpo no próprio
	// objeto e conta os locks tomados.
	let locks = 0
	const db: Record<string, unknown> = { select, insert }
	db.execute = () => {
		locks++
		return Promise.resolve()
	}
	db.transaction = (run: (tx: unknown) => Promise<unknown>) => run(db)
	return { db: db as unknown as SisubDb, written, locks: () => locks }
}

const base = { userId: "user-1", email: "a@fab.mil.br" }

async function codeOf(run: Promise<unknown>): Promise<string | null> {
	const error = await run.then(
		() => null,
		(e: unknown) => e
	)
	return error instanceof DomainError ? error.code : null
}

describe("syncUserNrOrdem", () => {
	test("primeiro vínculo grava o nrOrdem (aparado)", async () => {
		const { db, written, locks } = fakeDb({ current: null, currentHasMilitary: false, takenByOther: false })
		await syncUserNrOrdem(db, { ...base, nrOrdem: " 1234567 " })
		expect(written[0]?.nrOrdem).toBe("1234567")
		// checagem e gravação serializadas por nrOrdem (duas contas ao mesmo tempo)
		expect(locks()).toBe(1)
	})

	test("nrOrdem de OUTRA conta é recusado", async () => {
		const { db, written } = fakeDb({ current: null, currentHasMilitary: false, takenByOther: true })
		expect(await codeOf(syncUserNrOrdem(db, { ...base, nrOrdem: "1234567" }))).toBe("NR_ORDEM_TAKEN")
		expect(written).toHaveLength(0)
	})

	test("vínculo que localiza cadastro militar não troca nem some", async () => {
		const { db, written } = fakeDb({ current: "1234567", currentHasMilitary: true, takenByOther: false })
		expect(await codeOf(syncUserNrOrdem(db, { ...base, nrOrdem: "7654321" }))).toBe("NR_ORDEM_LOCKED")
		// limpar e regravar seria a mesma troca em dois passos
		expect(await codeOf(syncUserNrOrdem(db, { ...base, nrOrdem: "" }))).toBe("NR_ORDEM_LOCKED")
		expect(written).toHaveLength(0)
	})

	test("reenviar o MESMO valor é idempotente e só sincroniza o email", async () => {
		const { db, written } = fakeDb({ current: "1234567", currentHasMilitary: true, takenByOther: false })
		await syncUserNrOrdem(db, { ...base, nrOrdem: "1234567" })
		expect(written).toHaveLength(1)
		expect(written[0]).not.toHaveProperty("nrOrdem")
	})

	test("nrOrdem que não localiza cadastro (erro de digitação) segue corrigível", async () => {
		const { db, written } = fakeDb({ current: "123456", currentHasMilitary: false, takenByOther: false })
		await syncUserNrOrdem(db, { ...base, nrOrdem: "1234567" })
		expect(written[0]?.nrOrdem).toBe("1234567")
	})
})
