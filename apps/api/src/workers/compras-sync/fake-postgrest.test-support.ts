/**
 * PostgREST em memória para os testes do sync do Compras.gov. Imita o que importa para provar a
 * equivalência com o upsert cego:
 * - grava e devolve os valores no formato de saída do banco (timestamptz com `+00:00` e sem zeros
 *   finais na fração; numeric como string com 4 casas, o pior caso para o diff);
 * - `ON CONFLICT` com NULL na chave não conflita (unique NULLS DISTINCT), então insere;
 * - `max_rows` corta a página da leitura, como o PostgREST do Supabase.
 *
 * A conversão de valores daqui é independente da normalização de `diff.ts`, de propósito.
 */

export type FakeColumnType = "integer" | "numeric" | "text" | "boolean" | "timestamptz"
type Row = Record<string, unknown>

interface FakeTable {
	key: string[]
	columns: Record<string, FakeColumnType>
	rows: Row[]
	nextId: number
}

interface SelectCall {
	table: string
	lookupColumn: string
	lookupCount: number
	from: number
	to: number
}

interface UpsertCall {
	table: string
	rows: number
	onConflict?: string
}

/** Saída do Postgres para timestamptz vindo da API sem fuso (TimeZone da sessão = UTC). */
function timestampOut(value: string): string {
	const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?$/.exec(value)
	if (!match) throw new Error(`fake: timestamp fora do formato da API: ${value}`)
	const [, date, time, fraction = ""] = match
	const trimmed = fraction.slice(0, 6).replace(/0+$/, "")
	return `${date}T${time}${trimmed ? `.${trimmed}` : ""}+00:00`
}

function valueOut(type: FakeColumnType, value: unknown): unknown {
	if (value === null || value === undefined) return null
	switch (type) {
		case "integer":
			return Number(value)
		case "numeric":
			return Number(value).toFixed(4)
		case "text":
			return String(value)
		case "boolean":
			return Boolean(value)
		case "timestamptz":
			return timestampOut(String(value))
	}
}

function compareForOrder(a: unknown, b: unknown): number {
	// ASC NULLS LAST, como o default do Postgres.
	if (a === b) return 0
	if (a === null) return 1
	if (b === null) return -1
	return (a as number | string) < (b as number | string) ? -1 : 1
}

export class FakePostgrest {
	readonly tables = new Map<string, FakeTable>()
	readonly selects: SelectCall[] = []
	readonly upserts: UpsertCall[] = []
	inserted = 0
	updated = 0
	maxRows = 1000
	failSelects = false
	private clock = 0

	define(table: string, key: string[], columns: Record<string, FakeColumnType>): this {
		this.tables.set(table, { key, columns, rows: [], nextId: 1 })
		return this
	}

	rows(table: string): Row[] {
		return this.table(table).rows
	}

	/** Linhas sem as colunas de controle, ordenadas pela chave: o estado de negócio da tabela. */
	businessState(table: string): Row[] {
		const { key, rows } = this.table(table)
		return rows
			.map(({ id: _id, synced_at: _syncedAt, ...rest }) => rest)
			.sort((a, b) => {
				for (const column of key) {
					const order = compareForOrder(a[column] ?? null, b[column] ?? null)
					if (order !== 0) return order
				}
				return 0
			})
	}

	resetCounters(): void {
		this.selects.length = 0
		this.upserts.length = 0
		this.inserted = 0
		this.updated = 0
	}

	private table(name: string): FakeTable {
		const table = this.tables.get(name)
		if (!table) throw new Error(`fake: tabela ${name} não definida`)
		return table
	}

	from(name: string) {
		const table = this.table(name)
		return {
			select: (columns: string) => this.selectBuilder(name, table, columns.split(",")),
			upsert: async (incoming: Row[], options?: { onConflict?: string }) => {
				this.upserts.push({ table: name, rows: incoming.length, onConflict: options?.onConflict })
				const key = options?.onConflict ? options.onConflict.split(",") : table.key
				for (const row of incoming) this.upsertRow(table, key, row)
				return { data: null, error: null }
			},
		}
	}

	private upsertRow(table: FakeTable, key: string[], incoming: Row): void {
		const stored: Row = {}
		for (const [column, value] of Object.entries(incoming)) {
			if (column === "synced_at") {
				stored.synced_at = `tick-${++this.clock}`
				continue
			}
			const type = table.columns[column]
			if (!type) throw new Error(`fake: coluna ${column} não existe`)
			stored[column] = valueOut(type, value)
		}

		const hasNullKey = key.some((column) => stored[column] === null || stored[column] === undefined)
		const current = hasNullKey ? undefined : table.rows.find((row) => key.every((column) => row[column] === stored[column]))
		if (current) {
			Object.assign(current, stored)
			this.updated++
		} else {
			table.rows.push({ id: table.nextId++, ...stored })
			this.inserted++
		}
	}

	private selectBuilder(name: string, table: FakeTable, columns: string[]) {
		let lookupColumn = ""
		let lookupValues: unknown[] = []
		const orderColumns: string[] = []
		const builder = {
			in: (column: string, values: readonly unknown[]) => {
				lookupColumn = column
				lookupValues = [...values]
				return builder
			},
			order: (column: string, _options?: { ascending?: boolean }) => {
				orderColumns.push(column)
				return builder
			},
			range: async (from: number, to: number) => {
				this.selects.push({ table: name, lookupColumn, lookupCount: lookupValues.length, from, to })
				if (this.failSelects) return { data: null, error: { message: "canceling statement due to statement timeout" } }
				const matching = table.rows
					.filter((row) => lookupValues.includes(row[lookupColumn]))
					.sort((a, b) => {
						for (const column of orderColumns) {
							const order = compareForOrder(a[column] ?? null, b[column] ?? null)
							if (order !== 0) return order
						}
						return 0
					})
				const limit = Math.min(to - from + 1, this.maxRows)
				const data = matching.slice(from, from + limit).map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null])))
				return { data, error: null }
			},
		}
		return builder
	}
}
