// src/api/routes.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createApiHandler } from "./factory.js";

export const api = new Hono();

// CORS global para todos os endpoints da API (Power BI consome via browser)
api.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 300,
  })
);

// /api/opinion  (era apiEvaluation.tsx)
{
  const [headersMw, handler] = createApiHandler({
    table: "opinions",
    select: "id, created_at, value, question, userId",
    dateColumn: "created_at",
    dateColumnType: "timestamp",
    defaultOrder: [{ column: "created_at", ascending: false }],
    mapParams: {
      userId: "userId",
      question: "question",
      // ?question_ilike=...
    },
    cacheControl: "public, max-age=300",
  });
  api.get("/opinion", headersMw, handler);
}

// /api/presences agregado (era apiPresence.tsx)
{
  const [headersMw, handler] = createApiHandler({
    table: "rancho_presencas_agregado",
    select: "date, unidade, meal, total",
    dateColumn: "date",
    dateColumnType: "date",
    defaultOrder: [
      { column: "date", ascending: false },
      { column: "unidade", ascending: true },
      { column: "meal", ascending: true },
    ],
    mapParams: {
      unidade: "unidade",
      meal: "meal",
      // ?date=YYYY-MM-DD ou startDate/endDate
    },
    cacheControl: "public, max-age=300",
  });
  api.get("/presences", headersMw, handler);
}

// /api/rancho (era apiRancho.tsx)
{
  const [headersMw, handler] = createApiHandler({
    table: "rancho_agregado",
    select: "data, unidade, refeicao, total_vai_comer",
    dateColumn: "data",
    dateColumnType: "date",
    defaultOrder: [
      { column: "data", ascending: false },
      { column: "unidade", ascending: true },
      { column: "refeicao", ascending: true },
    ],
    mapParams: {
      unidade: "unidade",
      refeicao: "refeicao",
    },
    cacheControl: "public, max-age=300",
  });
  api.get("/rancho", headersMw, handler);
}

// /api/wherewhowhen (era apiPresences.tsx)
{
  const [headersMw, handler] = createApiHandler({
    table: "rancho_presencas",
    select: "user_id, date, unidade",
    dateColumn: "date",
    dateColumnType: "date",
    defaultOrder: [
      { column: "date", ascending: false },
      { column: "unidade", ascending: true },
      { column: "user_id", ascending: true },
    ],
    mapParams: {
      user_id: "user_id", // ?user_id=uuid1,uuid2
      unidade: "unidade", // ?unidade=1CIA,2CIA
      meal: "meal", // opcional: filtrar por refeição
      // também funciona: ?unidade_ilike=cia
    },
    cacheControl: "public, max-age=300",
  });
  api.get("/wherewhowhen", headersMw, handler);
}


export default api;
