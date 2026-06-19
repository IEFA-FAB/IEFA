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
 *   - renomeia chaves de relation via `relationKeys` (ex.: `ingredientInSisub` → `ingredient`);
 *     demais chaves: camelCase → snake_case.
 *   - `bigint` → `number`: colunas `bigserial`/`bigint` mode "bigint" voltam como BigInt no
 *     Drizzle, mas o contrato (e os tipos Supabase) é `number` — e BigInt quebraria o JSON.stringify
 *     da server fn. IDs do sisub cabem com folga no range seguro.
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

/**
 * Executa uma query Drizzle convertendo erro inesperado do Postgres em `DomainError(code)`,
 * preservando `DomainError` e subclasses (NotFound/Permission) — mantém os códigos de erro
 * que as operations expunham com o PostgREST. Guards (que lançam PermissionDenied) ficam FORA.
 */
export async function runQuery<T>(code: string, op: () => Promise<T>): Promise<T> {
	try {
		return await op()
	} catch (e) {
		if (e instanceof DomainError) throw e
		throw new DomainError(code, e instanceof Error ? e.message : String(e))
	}
}
