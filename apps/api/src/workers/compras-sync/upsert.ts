import type { SupabaseClient } from "@supabase/supabase-js"

/** O que um step do sync reporta: linhas recebidas da API e linhas efetivamente gravadas. */
export interface StepCounts {
	processed: number
	written: number
}

export type UpdateProgress = (pageNumber: number, totalPages: number, counts: StepCounts) => Promise<void>

type UpsertClient = Pick<SupabaseClient<any, any>, "from">

/**
 * Upsert de um lote que devolve quantas linhas o banco gravou de fato.
 *
 * O trigger `a_skip_unchanged_sync_row` (migration 20260926211500) descarta o update de linha
 * idêntica; o `count: "exact"` (Content-Range do PostgREST) conta só as linhas inseridas ou
 * alteradas, sem trazer corpo de volta. Sem o count (versão do PostgREST que não o devolva em
 * mutação), conta o lote inteiro: é o que o upsert cego gravava.
 */
export async function upsertCountingWrites(
	supabase: UpsertClient,
	table: string,
	rows: readonly object[],
	options: { label: string; onConflict?: string }
): Promise<number> {
	if (rows.length === 0) return 0
	const { error, count } = await supabase
		.from(table)
		.upsert(rows as object[], { count: "exact", ...(options.onConflict ? { onConflict: options.onConflict } : {}) })
	if (error) throw new Error(`${options.label}: ${error.message}`)
	return count ?? rows.length
}

/**
 * Deixa uma linha por chave no lote, a última ocorrência (a mais recente da API). Um lote com a
 * mesma chave duas vezes faz o `ON CONFLICT DO UPDATE` abortar ("cannot affect row a second
 * time"). A chave é null-safe: NULL é um valor (casa com NULL, não com a string "null"), como no
 * unique NULLS NOT DISTINCT de `compras_material_caracteristica` (migration de limpeza, PR 467).
 */
export function dedupeByKey<T extends Record<string, unknown>>(rows: readonly T[], keyColumns: readonly (keyof T & string)[]): T[] {
	const byKey = new Map<string, T>()
	for (const row of rows) {
		const key = JSON.stringify(keyColumns.map((column) => row[column] ?? null))
		// delete + set: a posição no lote passa a ser a da última ocorrência.
		byKey.delete(key)
		byKey.set(key, row)
	}
	return [...byKey.values()]
}

/** Acumula processadas/gravadas de um step. */
export function createStepCounts(): StepCounts & { add(processed: number, written: number): StepCounts } {
	const counts = {
		processed: 0,
		written: 0,
		add(processed: number, written: number): StepCounts {
			counts.processed += processed
			counts.written += written
			return { processed: counts.processed, written: counts.written }
		},
	}
	return counts
}
