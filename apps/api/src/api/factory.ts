import type { Context, MiddlewareHandler } from "hono"
import { z } from "zod"
import supabase from "../lib/supabase.js"
import { type CursorValue, decodeCursor, encodeCursor, keysetFilter, NEXT_CURSOR_HEADER, POSTGREST_MAX_ROWS } from "./cursor.ts"
import {
	clampLimit,
	commaListToArray,
	dayBounds,
	escapeLikePattern,
	MAX_ORDER_RULES,
	type OrderRule,
	parseSortableOrderParam,
	projectedColumns,
	withUniqueTiebreak,
} from "./query-params.ts"

export type ApiConfig = {
	table: string
	/** Schema do domínio onde a tabela vive após o split de `sisub` (core, kitchen, ...). */
	schema: string
	select: string
	dateColumn?: string
	dateColumnType?: "timestamp" | "date"
	defaultOrder?: OrderRule[]
	/**
	 * Chave única da tabela (PK ou UNIQUE, colunas NOT NULL), desempate final de qualquer
	 * ordenação. Obrigatória: o cursor (`cursor.ts`) precisa de ordem total, senão a página
	 * seguinte repete ou pula as linhas empatadas na fronteira.
	 */
	uniqueKey: readonly string[]
	mapParams?: Record<string, string>
	/** Padrão e teto do `limit`; nunca acima de {@link POSTGREST_MAX_ROWS}. */
	defaultLimit?: number
	maxLimit?: number
	cacheControl?: string
	corsOrigin?: string
	/** Colunas aceitas no `?order=`. Padrão: as da projeção (`select`) — ver `projectedColumns`. */
	sortableColumns?: readonly string[]
	/**
	 * Nome obsoleto aceito no `?order=` → coluna real: o campo depreciado que a projeção devolve por
	 * alias (`nome:coluna`) segue ordenável pelo nome antigo (ex.: `LEGACY_SARAM_FIELD`).
	 */
	orderAliases?: Readonly<Record<string, string>>
}

// Schema de erro para respostas
export const ErrorResponseSchema = z.object({
	error: z.string(),
	details: z.string().optional(),
	timestamp: z.string().optional(),
})

/**
 * Prefixo das colunas da chave lidas só para montar o cursor (fora da projeção publicada):
 * entram no `select` com alias e saem da linha antes da resposta.
 */
const CURSOR_ONLY_PREFIX = "__cursor_"

export function createApiHandler(config: ApiConfig): [MiddlewareHandler, (c: any) => Promise<Response>] {
	const {
		table,
		schema,
		select,
		dateColumn,
		dateColumnType = "timestamp",
		defaultOrder = [],
		mapParams = {},
		cacheControl = "public, max-age=300",
		corsOrigin = "*",
	} = config
	// O PostgREST corta toda resposta em `max_rows` (1000) sem avisar: teto acima disso prometia
	// linhas que nunca chegavam. Mais que 1000 linhas = seguir o `X-Next-Cursor`.
	const maxLimit = Math.min(config.maxLimit ?? POSTGREST_MAX_ROWS, POSTGREST_MAX_ROWS)
	const defaultLimit = Math.min(config.defaultLimit ?? maxLimit, maxLimit)
	const orderAliases = config.orderAliases ?? {}
	const projected = projectedColumns(select)
	const sortableColumns = config.sortableColumns ?? [...projected, ...Object.keys(orderAliases)]

	// Middleware para cache-control e CORS
	const setDefaultHeaders: MiddlewareHandler = async (c, next) => {
		await next()
		if (!c.res.headers.get("Cache-Control")) {
			c.header("Cache-Control", cacheControl)
		}
		if (!c.res.headers.get("Access-Control-Allow-Origin")) {
			c.header("Access-Control-Allow-Origin", corsOrigin)
			c.header("Access-Control-Allow-Methods", "GET, OPTIONS")
			c.header("Access-Control-Allow-Headers", "Content-Type")
		}
		c.header("Content-Type", "application/json; charset=utf-8")
	}

	// Handler principal
	const handler = async (c: Context) => {
		try {
			const url = new URL(c.req.url)
			const sp = url.searchParams

			// Validação básica dos parâmetros
			const limit = clampLimit(sp.get("limit"), defaultLimit, maxLimit)

			// Ordenação conferida ANTES de montar a query: coluna fora da allow-list é 400, não
			// um oráculo — ordenar por coluna não publicada revela a comparação pela ordem.
			const orderFromParam = parseSortableOrderParam(sp.get("order"), sortableColumns)
			if (!orderFromParam.ok) {
				return c.json(
					{
						error:
							orderFromParam.reason === "too-many-rules"
								? `A ordenação aceita no máximo ${MAX_ORDER_RULES} colunas`
								: `Colunas permitidas: ${sortableColumns.join(", ")}`,
					},
					400
				)
			}

			// Ordem final: a pedida (ou a padrão) + a chave única como desempate. É por ela que o
			// cursor anda.
			const requestedOrder = orderFromParam.order.map((rule) => ({ ...rule, column: orderAliases[rule.column] ?? rule.column }))
			const finalOrder = withUniqueTiebreak(requestedOrder.length ? requestedOrder : defaultOrder, config.uniqueKey).filter((rule) => rule.column)

			// Cursor conferido antes da consulta: malformado, ou de outra ordenação, é erro do cliente.
			let keyset: string | null = null
			const rawCursor = sp.get("cursor")
			if (rawCursor) {
				const cursor = decodeCursor(rawCursor, finalOrder)
				if (!cursor.ok) {
					return c.json(
						{
							error:
								cursor.reason === "order-mismatch"
									? "O cursor é de outra ordenação: repita na próxima página o mesmo `order` da primeira"
									: "Cursor inválido: use o valor do cabeçalho X-Next-Cursor sem alterar",
						},
						400
					)
				}
				keyset = keysetFilter(finalOrder, cursor.values)
				// Nada vem depois da última linha: página vazia, sem ir ao banco.
				if (keyset === null) return c.json([], 200)
			}

			// Coluna da ordem que a rota não publica (a chave de `user_military_data`) é lida com
			// alias só para o cursor, e sai da linha antes da resposta.
			const cursorOnly = finalOrder.map((rule) => rule.column).filter((column) => !projected.includes(column))
			const selectWithKey = [select, ...cursorOnly.map((column) => `${CURSOR_ONLY_PREFIX}${column}:"${column}"`)].join(", ")

			// Inicia query
			let query = supabase.schema(schema).from(table).select(selectWithKey).limit(limit)
			if (keyset) query = query.or(keyset)

			// Filtros mapeados
			for (const [param, column] of Object.entries(mapParams)) {
				const ilikeVal = sp.get(`${param}_ilike`)
				if (ilikeVal) {
					// "Contém" sem sintaxe escondida: `%` e `_` do cliente são literais.
					query = query.ilike(column, `%${escapeLikePattern(ilikeVal)}%`)
					continue
				}
				const rawVal = sp.get(param)
				if (!rawVal) continue
				if (rawVal.includes(",")) {
					const arr = commaListToArray(rawVal)
					if (arr.length > 0) query = query.in(column, arr)
				} else {
					query = query.eq(column, rawVal)
				}
			}

			// Filtro por data
			if (dateColumn) {
				const dateEq = sp.get("date")
				const startDate = sp.get("startDate")
				const endDate = sp.get("endDate")

				if (dateEq) {
					if (dateColumnType === "timestamp") {
						const { start, end } = dayBounds(dateEq)
						query = query.gte(dateColumn, start).lte(dateColumn, end)
					} else {
						query = query.eq(dateColumn, dateEq)
					}
				} else {
					if (startDate) {
						if (dateColumnType === "timestamp") {
							const { start } = dayBounds(startDate)
							query = query.gte(dateColumn, start)
						} else {
							query = query.gte(dateColumn, startDate)
						}
					}
					if (endDate) {
						if (dateColumnType === "timestamp") {
							const { end } = dayBounds(endDate)
							query = query.lte(dateColumn, end)
						} else {
							query = query.lte(dateColumn, endDate)
						}
					}
				}
			}

			// Ordenação
			for (const ord of finalOrder) {
				query = query.order(ord.column, { ascending: ord.ascending ?? true })
			}

			// Executa query
			const { data, error } = await query
			if (error) {
				// A mensagem do PostgREST (coluna, schema, hint SQL) fica no log do
				// servidor — nunca no corpo da resposta pública, que é anônima. Vazar
				// `error.message` entregava a estrutura interna do banco a qualquer um.
				console.error("Erro Supabase:", error)
				return c.json(
					{
						error: "Erro interno do servidor ao buscar dados",
					},
					500
				)
			}

			// `select` montado em tempo de execução: o parser de tipo do postgrest-js não o lê.
			const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
			// Página cheia: pode haver mais. O cursor sai da última linha, pela ordem final.
			const last = rows.at(-1)
			if (last && rows.length === limit) {
				const values = finalOrder.map(
					(rule) => (last[projected.includes(rule.column) ? rule.column : `${CURSOR_ONLY_PREFIX}${rule.column}`] ?? null) as CursorValue
				)
				c.header(NEXT_CURSOR_HEADER, encodeCursor(finalOrder, values))
			}
			const body =
				cursorOnly.length === 0 ? rows : rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith(CURSOR_ONLY_PREFIX))))
			return c.json(body, 200)
		} catch (err: unknown) {
			console.error("Erro crítico no endpoint API:", err)
			return c.json(
				{
					error: "Erro interno do servidor",
					timestamp: new Date().toISOString(),
				},
				500
			)
		}
	}

	return [setDefaultHeaders, handler] as const
}
