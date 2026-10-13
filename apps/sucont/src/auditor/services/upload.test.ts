/**
 * Caracterização da gravação fatiada do auditor (extraída do `mutationFn` de
 * routes/auditor.tsx): ordem dos lotes, soma dos contadores, teto de conflitos e
 * o status que sobra quando um lote falha no meio.
 */

import { describe, expect, it } from "bun:test"
import type { BalanceConflict, SaveBalancesResult } from "#/server/auditor.fn"
import { AccountGroup, type StoredBalanceRow } from "../types"
import { accumulateChunkResult, buildRunStartData, createPersistOutcome, saveInChunks, UPLOAD_CHUNK } from "./upload"

const balance = (period: string, ugCodigo: string): StoredBalanceRow => ({
	period,
	ugCodigo,
	ugNome: null,
	accountGroup: AccountGroup.BMP,
	siafiValue: 1,
	silomsValue: 1,
})

const conflict = (n: number): BalanceConflict => ({
	period: "2024-01",
	ugCodigo: String(n),
	accountGroup: "BMP",
	previous: { siafiValue: 1, silomsValue: 1 },
	next: { siafiValue: 2, silomsValue: 2 },
})

const result = (over: Partial<SaveBalancesResult> = {}): SaveBalancesResult => ({
	inserted: 1,
	unchanged: 2,
	changed: 3,
	duplicateGrains: 4,
	conflicts: [],
	conflictsTruncated: false,
	...over,
})

const rows = (n: number) => Array.from({ length: n }, (_, i) => balance("2024-01", String(i)))

describe("createPersistOutcome", () => {
	it("nasce como falha, zerada, com o total a gravar", () => {
		expect(createPersistOutcome("a.xlsx", 7)).toEqual({
			status: "failed",
			filename: "a.xlsx",
			inserted: 0,
			unchanged: 0,
			changed: 0,
			duplicateGrains: 0,
			rowsWritten: 0,
			rowsTotal: 7,
			conflicts: [],
			conflictsTruncated: false,
		})
	})
})

describe("buildRunStartData", () => {
	it("intervalo pela primeira e última competência em ordem, UGs distintas e linhas da planilha", () => {
		const payload = [balance("2024-03", "1"), balance("2024-01", "2"), balance("2024-03", "2"), balance("2024-02", "1")]
		expect(buildRunStartData("a.xlsx", payload, 10)).toEqual({
			filename: "a.xlsx",
			recordsCount: 4,
			periodLabel: "2024-01 a 2024-03",
			summary: { periods: 3, ugs: 2, sheetRows: 10 },
		})
	})

	it("uma competência só: intervalo de um ponto", () => {
		expect(buildRunStartData("a.xlsx", [balance("2024-01", "1")], 1).periodLabel).toBe("2024-01 a 2024-01")
	})
})

describe("accumulateChunkResult", () => {
	it("soma contadores e linhas do lote", () => {
		const outcome = createPersistOutcome("a", 10)
		accumulateChunkResult(outcome, 5, result())
		accumulateChunkResult(outcome, 3, result({ inserted: 10 }))
		expect(outcome).toMatchObject({ inserted: 11, unchanged: 4, changed: 6, duplicateGrains: 8, rowsWritten: 8, conflictsTruncated: false })
	})

	it("truncado pelo servidor fica truncado", () => {
		const outcome = createPersistOutcome("a", 10)
		accumulateChunkResult(outcome, 1, result({ conflictsTruncated: true }))
		accumulateChunkResult(outcome, 1, result({ conflictsTruncated: false }))
		expect(outcome.conflictsTruncated).toBe(true)
	})

	it("guarda até 200 conflitos e marca truncado no excedente", () => {
		const outcome = createPersistOutcome("a", 10)
		accumulateChunkResult(outcome, 1, result({ conflicts: Array.from({ length: 150 }, (_, i) => conflict(i)) }))
		expect(outcome.conflictsTruncated).toBe(false)
		accumulateChunkResult(outcome, 1, result({ conflicts: Array.from({ length: 51 }, (_, i) => conflict(150 + i)) }))
		expect(outcome.conflicts).toHaveLength(200)
		expect(outcome.conflicts[199].ugCodigo).toBe("199")
		expect(outcome.conflictsTruncated).toBe(true)
	})
})

describe("saveInChunks", () => {
	it("grava em lotes de UPLOAD_CHUNK, em sequência, e termina completo", async () => {
		const payload = rows(UPLOAD_CHUNK * 2 + 1)
		const calls: number[] = []
		let inFlight = 0
		const outcome = createPersistOutcome("a", payload.length)
		await saveInChunks(payload, outcome, async (slice) => {
			expect(inFlight).toBe(0)
			inFlight++
			calls.push(slice.length)
			await Promise.resolve()
			inFlight--
			return result()
		})
		expect(UPLOAD_CHUNK).toBe(2000)
		expect(calls).toEqual([2000, 2000, 1])
		expect(outcome.status).toBe("complete")
		expect(outcome.rowsWritten).toBe(payload.length)
		expect(outcome.error).toBeUndefined()
	})

	it("falha no primeiro lote: failed, com a mensagem do erro", async () => {
		const outcome = createPersistOutcome("a", 10)
		await saveInChunks(rows(10), outcome, async () => {
			throw new Error("banco fora")
		})
		expect(outcome.status).toBe("failed")
		expect(outcome.error).toBe("banco fora")
		expect(outcome.rowsWritten).toBe(0)
	})

	it("falha depois de um lote gravado: partial, e os lotes seguintes não são enviados", async () => {
		const payload = rows(UPLOAD_CHUNK * 3)
		let call = 0
		const outcome = createPersistOutcome("a", payload.length)
		await saveInChunks(payload, outcome, async () => {
			call++
			if (call === 2) throw new Error("lote 2")
			return result()
		})
		expect(call).toBe(2)
		expect(outcome.status).toBe("partial")
		expect(outcome.rowsWritten).toBe(UPLOAD_CHUNK)
		expect(outcome.error).toBe("lote 2")
	})

	it("erro que não é Error vira 'Falha ao gravar'", async () => {
		const outcome = createPersistOutcome("a", 1)
		await saveInChunks(rows(1), outcome, async () => {
			throw "texto"
		})
		expect(outcome.error).toBe("Falha ao gravar")
		expect(outcome.status).toBe("failed")
	})

	it("payload vazio não chama o servidor e fica completo", async () => {
		let called = false
		const outcome = createPersistOutcome("a", 0)
		await saveInChunks([], outcome, async () => {
			called = true
			return result()
		})
		expect(called).toBe(false)
		expect(outcome.status).toBe("complete")
	})
})
