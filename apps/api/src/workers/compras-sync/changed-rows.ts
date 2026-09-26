import type { SupabaseClient } from "@supabase/supabase-js"
import { diffRows, normalizeValue, type Row, type RowDiff, type RowSpec } from "./diff.ts"

/**
 * Valores por `.in()`: as chaves são inteiros de até 9 dígitos, então 150 valores cabem com folga
 * no limite de URL do PostgREST/ALB (~1,5 KB de filtro).
 */
export const LOOKUP_CHUNK_SIZE = 150

/** Igual ao `max_rows` do PostgREST no Supabase (1000). Página cheia = pode haver mais. */
export const EXISTING_PAGE_SIZE = 1000

type ExistingRowsClient = Pick<SupabaseClient<any, any>, "from">

/**
 * Lê as linhas existentes cujas `lookupColumn` estão em `lookupValues`, só com as colunas de
 * negócio do spec. Lotes de `LOOKUP_CHUNK_SIZE` valores, paginados por `EXISTING_PAGE_SIZE`
 * (a busca pela chave-pai pode devolver várias linhas por valor).
 *
 * Se o `max_rows` do servidor for menor que a página, a leitura para cedo: as linhas não lidas
 * contam como novas e são gravadas, que é o comportamento anterior. Nunca pula linha a mais.
 */
export async function fetchExistingRows(supabase: ExistingRowsClient, spec: RowSpec, lookupValues: readonly (string | number)[]): Promise<Row[]> {
	const select = Object.keys(spec.columns).join(",")
	const orderColumns = spec.orderColumns ?? spec.keyColumns
	const existing: Row[] = []

	for (let start = 0; start < lookupValues.length; start += LOOKUP_CHUNK_SIZE) {
		const chunk = lookupValues.slice(start, start + LOOKUP_CHUNK_SIZE)
		for (let from = 0; ; from += EXISTING_PAGE_SIZE) {
			let query = supabase.from(spec.table).select(select).in(spec.lookupColumn, chunk)
			for (const column of orderColumns) query = query.order(column, { ascending: true })
			const { data, error } = await query.range(from, from + EXISTING_PAGE_SIZE - 1)
			if (error) throw new Error(`select ${spec.table}: ${error.message}`)
			const page = (data ?? []) as unknown as Row[]
			existing.push(...page)
			if (page.length < EXISTING_PAGE_SIZE) break
		}
	}

	return existing
}

/** Valores distintos da coluna de busca no payload, já normalizados (ignora NULL). */
export function collectLookupValues(spec: RowSpec, rows: readonly Row[]): (string | number)[] {
	const kind = spec.columns[spec.lookupColumn]
	if (!kind) throw new Error(`${spec.table}: lookupColumn "${spec.lookupColumn}" sem tipo declarado no RowSpec`)
	const values = new Set<string | number>()
	for (const row of rows) {
		const value = normalizeValue(kind, row[spec.lookupColumn])
		if (typeof value === "number" || typeof value === "string") values.add(value)
	}
	return [...values]
}

/**
 * Devolve só as linhas do lote que são novas ou mudaram em relação ao banco.
 *
 * Se a leitura falhar, grava o lote inteiro (comportamento anterior) em vez de derrubar o step:
 * a otimização não pode deixar o sync menos confiável do que era.
 */
export async function selectChangedRows<T extends Row>(supabase: ExistingRowsClient, spec: RowSpec, rows: readonly T[]): Promise<RowDiff<T>> {
	if (rows.length === 0) return { changed: [], unchanged: 0 }

	let existing: Row[]
	try {
		existing = await fetchExistingRows(supabase, spec, collectLookupValues(spec, rows))
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.warn(`[compras-sync] leitura prévia de ${spec.table} falhou (${message}); gravando o lote inteiro`)
		return { changed: [...rows], unchanged: 0 }
	}

	return diffRows(spec, rows, existing)
}

/**
 * Upsert que só grava as linhas novas ou alteradas. Devolve quantas foram gravadas e quantas já
 * estavam iguais. O erro de gravação sobe com o `label` do chamador, como antes.
 */
export async function upsertChangedRows(
	supabase: SupabaseClient<any, any>,
	spec: RowSpec,
	rows: readonly Row[],
	options: { label: string; onConflict?: string }
): Promise<{ written: number; unchanged: number }> {
	const { changed, unchanged } = await selectChangedRows(supabase, spec, rows)
	if (changed.length === 0) return { written: 0, unchanged }

	const { error } = await supabase.from(spec.table).upsert(changed, options.onConflict ? { onConflict: options.onConflict } : undefined)
	if (error) throw new Error(`${options.label}: ${error.message}`)
	return { written: changed.length, unchanged }
}

/** Soma o que cada lote gravou e pulou, para o log do fim do step. */
export function createWriteTally(table: string) {
	const tally = {
		written: 0,
		unchanged: 0,
		add(result: { written: number; unchanged: number }): number {
			tally.written += result.written
			tally.unchanged += result.unchanged
			return tally.written
		},
		log(): void {
			console.log(`[compras-sync] ${table}: ${tally.written} linha(s) gravada(s), ${tally.unchanged} sem mudança`)
		},
	}
	return tally
}
