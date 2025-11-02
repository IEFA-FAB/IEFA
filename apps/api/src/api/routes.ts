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
    select: "user_id, date, unidade, meal",
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

// /api/user-military-data
{
  const [headersMw, handler] = createApiHandler({
    table: "user_military_data",
    select:
      "nrOrdem, nrCpf, nmGuerra, nmPessoa, sgPosto, sgOrg, dataAtualizacao",
    dateColumn: "dataAtualizacao",
    dateColumnType: "timestamp",
    defaultOrder: [
      { column: "dataAtualizacao", ascending: false },
      { column: "sgOrg", ascending: true },
      { column: "sgPosto", ascending: true },
      { column: "nmGuerra", ascending: true },
    ],
    mapParams: {
      nrOrdem: "nrOrdem",    // ?nrOrdem=123456 ou ?nrOrdem=123,456
      nrCpf: "nrCpf",        // ?nrCpf=00000000000 ou ?nrCpf=111,222
      nmGuerra: "nmGuerra",  // ?nmGuerra_ilike=silva
      nmPessoa: "nmPessoa",  // ?nmPessoa_ilike=joao
      sgPosto: "sgPosto",    // ?sgPosto=CB,SGT
      sgOrg: "sgOrg",        // ?sgOrg=1CIA,2CIA ou ?sgOrg_ilike=CIA
      // Filtro de data: ?date=YYYY-MM-DD (um dia) ou ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
    },
    cacheControl: "public, max-age=300",
  });
  api.get("/user-military-data", headersMw, handler);
}

// /api/user-data
{
  const [headersMw, handler] = createApiHandler({
    table: "user_data",
    select: 'id, created_at, email, "nrOrdem"',
    dateColumn: "created_at",
    dateColumnType: "timestamp",
    defaultOrder: [
      { column: "created_at", ascending: false },
      { column: "email", ascending: true },
    ],
    mapParams: {
      id: "id",            // ?id=uuid ou ?id=uuid1,uuid2
      email: "email",      // ?email=foo@bar.com ou ?email_ilike=foo
      nrOrdem: "nrOrdem",  // ?nrOrdem=123456 ou ?nrOrdem_ilike=123
    },
    cacheControl: "public, max-age=300",
  });
  api.get("/user-data", headersMw, handler);
}

export default api;
