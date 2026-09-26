/**
 * Diff entre as linhas que o sync do Compras.gov vai gravar e as que já estão no banco.
 *
 * O upsert via PostgREST vira `INSERT ... ON CONFLICT DO UPDATE` de todas as linhas do lote, mesmo
 * sem mudança: cada uma gera tupla morta, reescreve os índices (inclusive o GIN trigram de
 * `compras_material_item.descricao_item`) e infla o WAL. Aqui decidimos, campo a campo, quais
 * linhas mudaram de fato; só essas seguem para o upsert.
 *
 * A comparação é conservadora: na dúvida (valor que não normaliza), a linha conta como alterada e
 * é gravada, que é o comportamento anterior. Uma linha só é pulada quando todas as colunas de
 * negócio gravadas pelo sync batem com o que o banco devolveria depois da gravação.
 */

/** Tipo da coluna no banco; define como os dois lados são normalizados antes de comparar. */
export type ColumnKind = "text" | "integer" | "numeric" | "boolean" | "timestamptz"

export interface RowSpec {
	/** Tabela em `compras_gov_integration`. */
	table: string
	/** Colunas que identificam a linha: as do `onConflict` (ou a PK, quando o upsert não informa). */
	keyColumns: readonly string[]
	/** Coluna usada no `.in()` que busca as linhas existentes: a chave simples ou a chave-pai. */
	lookupColumn: string
	/** Ordenação estável da leitura paginada; o default é `keyColumns`. */
	orderColumns?: readonly string[]
	/**
	 * Colunas de negócio que o sync grava, com o tipo no banco. Colunas de controle (`synced_at`)
	 * ficam de fora: mudar só elas não justifica reescrever a linha.
	 */
	columns: Readonly<Record<string, ColumnKind>>
}

export type Row = Record<string, unknown>

/** Colunas que o sync grava mas que não entram na comparação. */
export const CONTROL_COLUMNS: ReadonlySet<string> = new Set(["synced_at"])

type Normalized = string | number | boolean | null

// Prefixo de valor que não normalizou: nunca coincide com um valor normalizado de outro tipo.
const RAW_PREFIX = "\u0000raw:"

const NUMERIC_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

// YYYY-MM-DD[ T]HH:MM[:SS[.fração]][Z | ±HH[[:]MM]]; a API manda sem fuso, o PostgREST com `+00:00`.
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i

function raw(value: unknown): string {
	return `${RAW_PREFIX}${typeof value === "string" ? value : JSON.stringify(value)}`
}

function normalizeNumber(value: unknown): Normalized {
	if (typeof value === "number") return Number.isFinite(value) ? value : raw(String(value))
	if (typeof value === "bigint") return Number(value)
	if (typeof value === "string") {
		const trimmed = value.trim()
		return NUMERIC_PATTERN.test(trimmed) ? Number(trimmed) : raw(value)
	}
	return raw(value)
}

function normalizeBoolean(value: unknown): Normalized {
	if (typeof value === "boolean") return value
	if (typeof value === "string") {
		const lowered = value.trim().toLowerCase()
		if (lowered === "true" || lowered === "t") return true
		if (lowered === "false" || lowered === "f") return false
	}
	return raw(value)
}

function normalizeText(value: unknown): Normalized {
	if (typeof value === "string") return value
	// O PostgREST converte número/booleano JSON em texto pelo literal; `String` produz o mesmo.
	if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value)
	return raw(value)
}

/**
 * Converte um instante em microssegundos desde a época (precisão do `timestamptz`), como string.
 * Sem fuso, o instante é UTC: é o `TimeZone` da sessão do PostgREST no banco, que é quem
 * interpreta o valor da API na gravação.
 */
export function toEpochMicros(value: unknown): string | null {
	if (value instanceof Date) {
		const ms = value.getTime()
		return Number.isNaN(ms) ? null : (BigInt(ms) * 1000n).toString()
	}
	if (typeof value !== "string") return null

	const match = TIMESTAMP_PATTERN.exec(value.trim())
	if (!match) return null

	const [, year, month, day, hour = "0", minute = "0", second = "0", fraction = "", offset] = match
	const date = new Date(Date.UTC(2000, Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)))
	date.setUTCFullYear(Number(year))
	// Data inválida (31/02, 25h) o Postgres recusaria; aqui vira "não normalizou".
	if (date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
		return null
	}

	// O Postgres guarda microssegundos e arredonda o excedente.
	let micros = BigInt(`${fraction}000000`.slice(0, 6))
	if (fraction.length > 6 && Number(fraction[6]) >= 5) micros += 1n

	let offsetMinutes = 0
	if (offset && offset.toUpperCase() !== "Z") {
		const sign = offset.startsWith("-") ? -1 : 1
		const digits = offset.slice(1).replace(":", "")
		offsetMinutes = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || "0"))
	}

	const epochMs = BigInt(date.getTime()) - BigInt(offsetMinutes) * 60_000n
	return (epochMs * 1000n + micros).toString()
}

function normalizeTimestamp(value: unknown): Normalized {
	const micros = toEpochMicros(value)
	return micros === null ? raw(value) : `ts:${micros}`
}

/** Normaliza um valor para a forma canônica do tipo da coluna; `null` e `undefined` viram `null`. */
export function normalizeValue(kind: ColumnKind, value: unknown): Normalized {
	if (value === null || value === undefined) return null
	switch (kind) {
		case "text":
			return normalizeText(value)
		case "integer":
		case "numeric":
			return normalizeNumber(value)
		case "boolean":
			return normalizeBoolean(value)
		case "timestamptz":
			return normalizeTimestamp(value)
	}
}

function columnKind(spec: RowSpec, column: string): ColumnKind {
	const kind = spec.columns[column]
	if (!kind) throw new Error(`${spec.table}: coluna "${column}" sem tipo declarado no RowSpec`)
	return kind
}

/** Chave canônica da linha pelas `keyColumns` (valores normalizados, então `1` e `"1"` coincidem). */
export function rowKey(spec: RowSpec, row: Row): string {
	return JSON.stringify(spec.keyColumns.map((column) => normalizeValue(columnKind(spec, column), row[column])))
}

/**
 * Garante que o RowSpec cobre toda coluna que o sync grava. Sem isso, uma coluna nova no payload
 * ficaria fora da comparação e a mudança dela seria descartada em silêncio.
 */
export function assertSpecCoversRow(spec: RowSpec, row: Row): void {
	for (const column of Object.keys(row)) {
		if (!CONTROL_COLUMNS.has(column) && !(column in spec.columns)) {
			throw new Error(`${spec.table}: coluna "${column}" gravada pelo sync mas ausente do RowSpec`)
		}
	}
}

/** Verdadeiro quando todas as colunas de negócio do spec coincidem entre o payload e a linha do banco. */
export function isSameRow(spec: RowSpec, incoming: Row, existing: Row): boolean {
	for (const [column, kind] of Object.entries(spec.columns)) {
		if (normalizeValue(kind, incoming[column]) !== normalizeValue(kind, existing[column])) return false
	}
	return true
}

export interface RowDiff<T extends Row> {
	/** Linhas novas ou alteradas, na ordem de entrada: seguem para o upsert. */
	changed: T[]
	/** Quantas linhas do payload já estavam iguais no banco. */
	unchanged: number
}

/**
 * Separa o payload em linhas a gravar e linhas já iguais no banco. `existing` pode trazer linhas
 * de outras chaves (a busca é pela chave-pai) e mais de uma linha por chave (unique com NULL
 * não conflita no Postgres); basta uma igual para pular.
 */
export function diffRows<T extends Row>(spec: RowSpec, incoming: readonly T[], existing: readonly Row[]): RowDiff<T> {
	const existingByKey = new Map<string, Row[]>()
	for (const row of existing) {
		const key = rowKey(spec, row)
		const bucket = existingByKey.get(key)
		if (bucket) bucket.push(row)
		else existingByKey.set(key, [row])
	}

	const changed: T[] = []
	let unchanged = 0
	for (const row of incoming) {
		assertSpecCoversRow(spec, row)
		const candidates = existingByKey.get(rowKey(spec, row))
		if (candidates?.some((candidate) => isSameRow(spec, row, candidate))) unchanged++
		else changed.push(row)
	}
	return { changed, unchanged }
}
