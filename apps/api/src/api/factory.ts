// src/api/factory.ts
import type { Context, Next } from "hono";
import type { MiddlewareHandler } from "hono";
import supabase from "../lib/supabase";

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
  corsOrigin?: string; // usado para header manual adicional
};

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
    defaultLimit = 1000,
    maxLimit = 10000,
    cacheControl = "public, max-age=300",
    corsOrigin = "*",
  } = config;

  // Opcional: middleware para cache-control em cada resposta de sucesso
  const setDefaultHeaders: MiddlewareHandler = async (
    c: Context,
    next: Next
  ) => {
    await next();
    // Se ainda não setado por outra parte, garanta headers padrão
    if (!c.res.headers.get("Cache-Control")) {
      c.header("Cache-Control", cacheControl);
    }
    // CORS headers extra (além do middleware cors do Hono, se usado)
    if (!c.res.headers.get("Access-Control-Allow-Origin")) {
      c.header("Access-Control-Allow-Origin", corsOrigin);
      c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Content-Type");
    }
    c.header("Content-Type", "application/json; charset=utf-8");
  };

  // O handler GET que replica o loader
  const handler = async (c: Context) => {
    try {
      // Em Hono, só entra aqui se a rota for GET, então não precisa checar método.
      const url = new URL(c.req.url);
      const sp = url.searchParams;

      // Inicia query
      let query = supabase.from(table).select(select);

      // Limite com proteção
      const limit = Math.min(
        Math.max(1, toInt(sp.get("limit"), defaultLimit)),
        maxLimit
      );
      query = query.limit(limit);

      // Filtros mapeados simples (eq, in, ilike)
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
        const dateEq = sp.get("date"); // Um único dia
        const startDate = sp.get("startDate"); // Início do intervalo
        const endDate = sp.get("endDate"); // Fim do intervalo

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

      // Executa
      const { data: rows, error } = await query;
      if (error) {
        console.error("Erro Supabase:", error);
        return c.json(
          {
            error: "Erro interno do servidor ao buscar dados",
            details: error.message,
          },
          500
        );
      }

      // Retorno puro
      return c.json(rows ?? [], 200);
    } catch (err: any) {
      console.error("Erro crítico no endpoint API:", err);
      return c.json(
        {
          error: "Erro interno do servidor",
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  };

  // Retornamos um pequeno “routerzinho” com middleware de headers
  return [setDefaultHeaders, handler] as const;
}
