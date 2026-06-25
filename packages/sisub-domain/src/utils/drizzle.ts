/**
 * Helpers compartilhados da camada de query Drizzle (migração PostgREST→Drizzle).
 *
 * `toWire` preserva o contrato de retorno snake_case que o app + os tipos
 * `Tables<...>` consomem — o Drizzle devolve colunas em camelCase e relations com
 * nomes feios gerados pelo `drizzle-kit pull`. `runQuery` uniformiza o tratamento
 * de erro (paridade com o padrão `{ error }` do PostgREST → DomainError).
 */

import { DomainError } from "../types/errors.ts"

function camelToSnake(key: string): string {
	return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

/**
 * Mapeia o resultado camelCase do Drizzle para o shape snake_case do contrato.
 *   - renomeia chaves de relation via `relationKeys` (ex.: `ingredientInKitchen` → `ingredient`);
 *     demais chaves: camelCase → snake_case.
 *   - `bigint` → `number`: colunas `bigserial`/`bigint` mode "bigint" voltam como BigInt no
 *     Drizzle, mas o contrato (e os tipos Supabase) é `number` — e BigInt quebraria o JSON.stringify
 *     da server fn. IDs do sisub cabem com folga no range seguro.
 *
 * `relationKeys` é aplicado em TODOS os níveis da recursão (intencional: relations aninhadas
 * como `ingredientInKitchen` vivem dentro de objetos filhos, ex. um `recipe_ingredient`). Efeito
 * colateral: uma regra de rename dispara em qualquer profundidade onde a chave colida. Os nomes
 * gerados pelo pull (`unitsInCore_unitId`, `recipeIngredientsInKitchens`, …) não colidem com
 * colunas hoje; batches futuros com mapas mais ricos devem conferir contra seus schemas aninhados.
 */
export function toWire<T>(value: unknown, relationKeys: Record<string, string> = {}): T {
	if (typeof value === "bigint") return Number(value) as T
	if (Array.isArray(value)) return value.map((v) => toWire(v, relationKeys)) as T
	if (value !== null && typeof value === "object" && !(value instanceof Date)) {
		const out: Record<string, unknown> = {}
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			out[relationKeys[k] ?? camelToSnake(k)] = toWire(v, relationKeys)
		}
		return out as T
	}
	return value as T
}

function snakeToCamel(key: string): string {
	return key.replace(/_([a-z0-9])/g, (_m, c) => c.toUpperCase())
}

/**
 * Inverso (raso) de `toWire` para payloads de WRITE: converte um objeto com chaves snake_case
 * (contrato/zod, ex.: `PurchaseItemWriteSchema`) em camelCase — as props do schema Drizzle, que
 * `.values()`/`.set()` exigem. Use só com tabelas cujas colunas são snake no DB (a maioria);
 * tabelas com colunas camelCase no DB (user_data.nrOrdem) não devem passar por aqui.
 */
export function toColumns<T = Record<string, unknown>>(payload: Record<string, unknown>): T {
	const out: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(payload)) out[snakeToCamel(k)] = v
	return out as T
}

export interface RunQueryOptions {
	/** Prefixo da mensagem de erro (ex.: "Erro ao buscar templates"). Sem prefixo, usa a mensagem crua do driver. */
	prefix?: string
	/** Inclui o `.code` do erro Postgres entre colchetes (ex.: "[23505]") — útil em violações de constraint. */
	includeCode?: boolean
}

/**
 * Executa uma query Drizzle convertendo erro inesperado do Postgres em `DomainError(code)`,
 * preservando `DomainError` e subclasses (NotFound/Permission) — mantém os códigos de erro
 * que as operations expunham com o PostgREST. Guards (que lançam PermissionDenied) ficam FORA.
 *
 * `opts.prefix`/`opts.includeCode` substituem os wrappers locais `ataOp`/`piOp`/`draftOp` que
 * cada arquivo definia: `{ prefix }` → `"<prefix>: <msg>"`; `{ prefix, includeCode }` → `"<prefix> [<pgcode>]: <msg>"`.
 */
export async function runQuery<T>(code: string, op: () => Promise<T>, opts?: RunQueryOptions): Promise<T> {
	try {
		return await op()
	} catch (e) {
		if (e instanceof DomainError) throw e
		const base = e instanceof Error ? e.message : String(e)
		if (!opts?.prefix) throw new DomainError(code, base)
		const pgCode = opts.includeCode ? (e as { code?: string }).code : undefined
		const codeSeg = pgCode ? ` [${pgCode}]` : ""
		throw new DomainError(code, `${opts.prefix}${codeSeg}: ${base}`)
	}
}

/**
 * Insert via `runQuery` que exige ≥1 linha retornada (`.returning(...)`), lançando `DomainError(code, msg)`
 * quando nada volta. Retorna a primeira linha. Substitui o par `const [row] = ...; if (!row) throw`.
 */
export async function insertOneOrFail<T>(code: string, msg: string, op: () => Promise<T[]>, opts?: RunQueryOptions): Promise<T> {
	const rows = await runQuery(code, op, opts)
	const row = rows[0]
	if (!row) throw new DomainError(code, msg)
	return row
}

/**
 * Mutação (update/delete) via `runQuery` que exige ≥1 linha afetada (`.returning(...)`), lançando
 * `DomainError(code, msg)` quando o WHERE não casa (0 linhas → "não encontrado"). Retorna as linhas
 * afetadas. Substitui o par `const r = ...; if (r.length === 0) throw`.
 */
export async function mutateOrFail<T>(code: string, msg: string, op: () => Promise<T[]>, opts?: RunQueryOptions): Promise<T[]> {
	const rows = await runQuery(code, op, opts)
	if (rows.length === 0) throw new DomainError(code, msg)
	return rows
}
