import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";
import supabase from "../lib/supabase.js";

type OrderRule = { column: string; ascending?: boolean | null };

export type ApiConfig = {
	table: string;
	select: string;
	dateColumn?: string;
	dateColumnType?: "timestamp" | "date";
	defaultOrder?: OrderRule[];
	mapParams?: Record<string, string>;
	defaultLimit?: number;
	maxLimit?: number;
	cacheControl?: string;
	corsOrigin?: string;
};

// Schema de erro para respostas
export const ErrorResponseSchema = z.object({
	error: z.string(),
	details: z.string().optional(),
	timestamp: z.string().optional(),
});

function toInt(v: string | null | undefined, d: number) {
	const n = v ? parseInt(v, 10) : NaN;
	return Number.isFinite(n) ? n : d;
}

function commaListToArray(v: string) {
	return v
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function parseOrderParam(v: string | null | undefined): OrderRule[] {
	if (!v) return [];
	return v
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => {
			const [col, dir] = part.split(":").map((s) => s.trim());
			return {
				column: col,
				ascending: dir ? dir.toLowerCase() !== "desc" : true,
			};
		});
}

function dayBounds(dateStr: string) {
	const start = `${dateStr}T00:00:00.000`;
	const end = `${dateStr}T23:59:59.999`;
	return { start, end };
}

export function createApiHandler(config: ApiConfig) {
	const {
		table,
		select,
		dateColumn,
		dateColumnType = "timestamp",
		defaultOrder = [],
		mapParams = {},
		defaultLimit = 100000,
		maxLimit = 100000,
		cacheControl = "public, max-age=300",
		corsOrigin = "*",
	} = config;

	// Middleware para cache-control e CORS
	const setDefaultHeaders: MiddlewareHandler = async (c, next) => {
		await next();
		if (!c.res.headers.get("Cache-Control")) {
			c.header("Cache-Control", cacheControl);
		}
		if (!c.res.headers.get("Access-Control-Allow-Origin")) {
			c.header("Access-Control-Allow-Origin", corsOrigin);
			c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
			c.header("Access-Control-Allow-Headers", "Content-Type");
		}
		c.header("Content-Type", "application/json; charset=utf-8");
	};

	// Handler principal
	const handler = async (c: Context) => {
		try {
			const url = new URL(c.req.url);
			const sp = url.searchParams;

			// Validação básica dos parâmetros
			const limit = Math.min(
				Math.max(1, toInt(sp.get("limit"), defaultLimit)),
				maxLimit,
			);

			// Inicia query
			let query = supabase.from(table).select(select).limit(limit);

			// Filtros mapeados
			for (const [param, column] of Object.entries(mapParams)) {
				const ilikeVal = sp.get(`${param}_ilike`);
				if (ilikeVal) {
					query = query.ilike(column, `%${ilikeVal}%`);
					continue;
				}
				const rawVal = sp.get(param);
				if (!rawVal) continue;
				if (rawVal.includes(",")) {
					const arr = commaListToArray(rawVal);
					if (arr.length > 0) query = query.in(column, arr);
				} else {
					query = query.eq(column, rawVal);
				}
			}

			// Filtro por data
			if (dateColumn) {
				const dateEq = sp.get("date");
				const startDate = sp.get("startDate");
				const endDate = sp.get("endDate");

				if (dateEq) {
					if (dateColumnType === "timestamp") {
						const { start, end } = dayBounds(dateEq);
						query = query.gte(dateColumn, start).lte(dateColumn, end);
					} else {
						query = query.eq(dateColumn, dateEq);
					}
				} else {
					if (startDate) {
						if (dateColumnType === "timestamp") {
							const { start } = dayBounds(startDate);
							query = query.gte(dateColumn, start);
						} else {
							query = query.gte(dateColumn, startDate);
						}
					}
					if (endDate) {
						if (dateColumnType === "timestamp") {
							const { end } = dayBounds(endDate);
							query = query.lte(dateColumn, end);
						} else {
							query = query.lte(dateColumn, endDate);
						}
					}
				}
			}

			// Ordenação
			const orderFromParam = parseOrderParam(sp.get("order"));
			const finalOrder = orderFromParam.length ? orderFromParam : defaultOrder;
			for (const ord of finalOrder) {
				if (!ord.column) continue;
				query = query.order(ord.column, { ascending: ord.ascending ?? true });
			}

			// Executa query
			const { data: rows, error } = await query;
			if (error) {
				console.error("Erro Supabase:", error);
				return c.json(
					{
						error: "Erro interno do servidor ao buscar dados",
						details: error.message,
					},
					500,
				);
			}

			return c.json(rows ?? [], 200);
		} catch (err: any) {
			console.error("Erro crítico no endpoint API:", err);
			return c.json(
				{
					error: "Erro interno do servidor",
					timestamp: new Date().toISOString(),
				},
				500,
			);
		}
	};

	return [setDefaultHeaders, handler] as const;
}
