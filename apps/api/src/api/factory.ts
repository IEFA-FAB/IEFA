import type { Context, MiddlewareHandler } from "hono"
import { z } from "zod"
import supabase from "../lib/supabase.js"
import { clampLimit, commaListToArray, dayBounds, type OrderRule, parseOrderParam } from "./query-params.ts"

export type ApiConfig = {
	table: string
	/** Schema do domínio onde a tabela vive após o split de `sisub` (core, kitchen, ...). */
	schema: string
	select: string
	dateColumn?: string
	dateColumnType?: "timestamp" | "date"
	defaultOrder?: OrderRule[]
	mapParams?: Record<string, string>
	defaultLimit?: number
	maxLimit?: number
	cacheControl?: string
	corsOrigin?: string
}

// Schema de erro para respostas
export const ErrorResponseSchema = z.object({
	error: z.string(),
	details: z.string().optional(),
	timestamp: z.string().optional(),
})

export function createApiHandler(config: ApiConfig): [MiddlewareHandler, (c: any) => Promise<Response>] {
	const {
		table,
		schema,
		select,
		dateColumn,
		dateColumnType = "timestamp",
		defaultOrder = [],
		mapParams = {},
		defaultLimit = 100000,
		maxLimit = 100000,
		cacheControl = "public, max-age=300",
		corsOrigin = "*",
	} = config

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

			// Inicia query
			let query = supabase.schema(schema).from(table).select(select).limit(limit)

			// Filtros mapeados
			for (const [param, column] of Object.entries(mapParams)) {
				const ilikeVal = sp.get(`${param}_ilike`)
				if (ilikeVal) {
					query = query.ilike(column, `%${ilikeVal}%`)
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
			const orderFromParam = parseOrderParam(sp.get("order"))
			const finalOrder = orderFromParam.length ? orderFromParam : defaultOrder
			for (const ord of finalOrder) {
				if (!ord.column) continue
				query = query.order(ord.column, { ascending: ord.ascending ?? true })
			}

			// Executa query
			const { data: rows, error } = await query
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

			return c.json(rows ?? [], 200)
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
