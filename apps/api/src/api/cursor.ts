/**
 * Cursor de keyset das rotas de lista do factory.
 *
 * O PostgREST devolve no máximo 1000 linhas por resposta (`max_rows` do projeto) e não avisa
 * quando corta. A rota devolve até 1000 e, quando a página veio cheia, o cabeçalho
 * `X-Next-Cursor`; repetir a consulta com `?cursor=<valor>` traz as linhas seguintes.
 *
 * Keyset, não offset: a página seguinte começa DEPOIS da última linha vista pela ordem final
 * (a pedida + a chave única da tabela). Linha INSERIDA ou APAGADA entre uma página e outra não
 * desloca as demais: nada repete nem some por causa dela, e cada página custa o mesmo para o
 * banco. A garantia NÃO cobre UPDATE de coluna da ordem: a linha que muda de posição no meio
 * da leitura (o arranchamento que troca de refeitório, o espelho com `dataAtualizacao` nova)
 * pode vir de novo, se foi para depois do cursor, ou não vir, se foi para antes. Quem precisa
 * de leitura exata deduplica pela chave (onde ela é publicada) ou relê a lista.
 *
 * O cursor é base64url de `{ o, v }`: a ordem final (`[coluna, "a" | "d"]`) e os valores da
 * última linha nessas colunas. A ordem viaja no cursor para que cursor de uma ordenação não
 * seja aplicado a outra: aí a página sairia errada sem erro. Não é segredo nem assinatura; o
 * cliente que o forjar só consegue filtrar por colunas que a própria rota já ordena.
 *
 * Puro de propósito (sem o client Supabase), como `query-params.ts`.
 */

import { z } from "zod"
import type { OrderRule } from "./query-params.ts"

/** Teto do `max_rows` do PostgREST do projeto: nenhuma resposta passa disso. */
export const POSTGREST_MAX_ROWS = 1000

/**
 * Códigos do Postgres para valor que não converte no tipo da coluna (`22P02` texto inválido,
 * `22007`/`22008` data ou hora inválida, `22003` número fora da faixa). Na rota de lista só vêm
 * de entrada do cliente (filtro ou cursor adulterado): são 400, não 500.
 */
export const INVALID_INPUT_CODES: readonly string[] = ["22P02", "22007", "22008", "22003"]

/** Erro do PostgREST causado por valor do cliente que não converte no tipo da coluna. */
export function isInvalidInputError(error: { code?: string | null } | null | undefined): boolean {
	return error?.code != null && INVALID_INPUT_CODES.includes(error.code)
}

/** Nome do cabeçalho com o cursor da próxima página. */
export const NEXT_CURSOR_HEADER = "X-Next-Cursor"

/** Cursor maior que isto não é de página nenhuma: recusa antes de decodificar. */
export const MAX_CURSOR_LENGTH = 8192

const COLUMN_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

const CursorValueSchema = z.union([z.string().max(2048), z.number().finite(), z.boolean(), z.null()])

export type CursorValue = z.infer<typeof CursorValueSchema>

const CursorSchema = z
	.object({
		o: z
			.array(z.tuple([z.string().regex(COLUMN_NAME), z.enum(["a", "d"])]))
			.min(1)
			.max(16),
		v: z.array(CursorValueSchema).max(16),
	})
	.refine((cursor) => cursor.o.length === cursor.v.length)

function orderSignature(order: readonly OrderRule[]): Array<[string, "a" | "d"]> {
	return order.map((rule) => [rule.column, rule.ascending === false ? "d" : "a"])
}

export function encodeCursor(order: readonly OrderRule[], values: readonly CursorValue[]): string {
	return Buffer.from(JSON.stringify({ o: orderSignature(order), v: values }), "utf8").toString("base64url")
}

/** Valores da última linha, se o cursor for válido E da mesma ordem final desta consulta. */
export function decodeCursor(
	raw: string,
	order: readonly OrderRule[]
): { ok: true; values: CursorValue[] } | { ok: false; reason: "malformed" | "order-mismatch" } {
	if (raw.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(raw)) return { ok: false, reason: "malformed" }
	let json: unknown
	try {
		json = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"))
	} catch {
		return { ok: false, reason: "malformed" }
	}
	const parsed = CursorSchema.safeParse(json)
	if (!parsed.success) return { ok: false, reason: "malformed" }
	const expected = orderSignature(order)
	const same =
		expected.length === parsed.data.o.length && expected.every(([column, dir], i) => parsed.data.o[i]?.[0] === column && parsed.data.o[i]?.[1] === dir)
	if (!same) return { ok: false, reason: "order-mismatch" }
	return { ok: true, values: parsed.data.v }
}

/** Valor entre aspas na sintaxe de filtro do PostgREST: vírgula, ponto e parêntese viram literais. */
function quote(value: string | number | boolean): string {
	return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

function equals(column: string, value: CursorValue): string {
	return value === null ? `${column}.is.null` : `${column}.eq.${quote(value)}`
}

/**
 * "Depois de `value`" numa coluna, com os nulos onde o Postgres os põe sem `nulls first/last`
 * explícito (é o que o `.order()` do factory manda): no fim da ordem ascendente, no começo da
 * descendente. `null` quando nada vem depois só por esta coluna.
 */
function after(column: string, ascending: boolean, value: CursorValue): string | null {
	if (value === null) return ascending ? null : `${column}.not.is.null`
	return ascending ? `or(${column}.gt.${quote(value)},${column}.is.null)` : `${column}.lt.${quote(value)}`
}

/**
 * Filtro `or` do PostgREST com as linhas que vêm depois de `values` na ordem `order`:
 * `(c1 depois) OU (c1 igual E c2 depois) OU …`. `null` quando nada vem depois.
 */
export function keysetFilter(order: readonly OrderRule[], values: readonly CursorValue[]): string | null {
	const terms: string[] = []
	for (let i = 0; i < order.length; i++) {
		const rule = order[i] as OrderRule
		const next = after(rule.column, rule.ascending !== false, values[i] ?? null)
		if (next === null) continue
		const prefix = order.slice(0, i).map((previous, j) => equals(previous.column, values[j] ?? null))
		terms.push(prefix.length === 0 ? next : `and(${[...prefix, next].join(",")})`)
	}
	return terms.length === 0 ? null : terms.join(",")
}
