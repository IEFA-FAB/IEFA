// Extraído de routes/auditor.tsx (port do SIAFI-x-SILOMS-Auditor): montagem do
// resultado da importação e gravação fatiada da série, chamadas pelo `mutationFn`.

import type { BalanceConflict, SaveBalancesResult } from "#/server/auditor.fn"
import type { StoredBalanceRow } from "../types"

/** Lote de gravação. Acima disso o corpo do POST fica grande demais para um request só. */
export const UPLOAD_CHUNK = 2000

export interface PersistOutcome {
	/** "partial" = parte dos lotes entrou no banco antes da falha. */
	status: "complete" | "partial" | "failed"
	filename: string
	inserted: number
	unchanged: number
	changed: number
	duplicateGrains: number
	rowsWritten: number
	rowsTotal: number
	conflicts: BalanceConflict[]
	conflictsTruncated: boolean
	error?: string
}

/** Resultado inicial: nada gravado ainda, `rowsTotal` saldos a gravar. */
export const createPersistOutcome = (filename: string, rowsTotal: number): PersistOutcome => ({
	status: "failed",
	filename,
	inserted: 0,
	unchanged: 0,
	changed: 0,
	duplicateGrains: 0,
	rowsWritten: 0,
	rowsTotal,
	conflicts: [],
	conflictsTruncated: false,
})

/** Corpo do `startAuditorRunFn`: arquivo, contagem e intervalo de competências. */
export const buildRunStartData = (filename: string, payload: StoredBalanceRow[], sheetRows: number) => {
	const periods = [...new Set(payload.map((r) => r.period))].sort()
	return {
		filename,
		recordsCount: payload.length,
		periodLabel: `${periods[0]} a ${periods[periods.length - 1]}`,
		summary: {
			periods: periods.length,
			ugs: new Set(payload.map((r) => r.ugCodigo)).size,
			sheetRows,
		},
	}
}

/** Soma um lote gravado ao resultado. Guarda no máximo 200 conflitos. */
export const accumulateChunkResult = (outcome: PersistOutcome, sliceLength: number, result: SaveBalancesResult): void => {
	outcome.inserted += result.inserted
	outcome.unchanged += result.unchanged
	outcome.changed += result.changed
	outcome.duplicateGrains += result.duplicateGrains
	outcome.rowsWritten += sliceLength
	outcome.conflictsTruncated = outcome.conflictsTruncated || result.conflictsTruncated
	for (const conflict of result.conflicts) {
		if (outcome.conflicts.length < 200) outcome.conflicts.push(conflict)
		else outcome.conflictsTruncated = true
	}
}

/**
 * Grava `payload` em lotes de `UPLOAD_CHUNK`, um request por vez, e acumula em
 * `outcome`. Não lança: a falha vira `status` "partial" ou "failed" com `error`.
 */
export const saveInChunks = async (
	payload: StoredBalanceRow[],
	outcome: PersistOutcome,
	saveChunk: (rows: StoredBalanceRow[]) => Promise<SaveBalancesResult>
): Promise<void> => {
	// A gravação é fatiada e o PostgREST não dá transação entre requests: uma
	// falha no lote 3 de 4 deixa os dois primeiros COMMITADOS. Anunciar "nada
	// foi gravado" nesse caso seria a mesma classe de mentira que este PR
	// existe para eliminar — então o erro é capturado e o que entrou é contado.
	try {
		for (let i = 0; i < payload.length; i += UPLOAD_CHUNK) {
			const slice = payload.slice(i, i + UPLOAD_CHUNK)
			const result = await saveChunk(slice)
			accumulateChunkResult(outcome, slice.length, result)
		}
		outcome.status = "complete"
	} catch (e) {
		outcome.error = e instanceof Error ? e.message : "Falha ao gravar"
		outcome.status = outcome.rowsWritten > 0 ? "partial" : "failed"
	}
}
