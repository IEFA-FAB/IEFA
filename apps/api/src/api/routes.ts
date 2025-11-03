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

// /api/opinion  (era apiEvaluation.tsx) -> opinions
{
  const [headersMw, handler] = createApiHandler({
    table: "opinions",
    select: 'id, created_at, value, question, "userId"',
    dateColumn: "created_at",
    dateColumnType: "timestamp",
    defaultOrder: [{ column: "created_at", ascending: false }],
    mapParams: {
      userId: "userId", // ?userId=uuid ou ?userId=uuid1,uuid2
      question: "question", // ?question_ilike=...
    },
    cacheControl: "public, max-age=300",
  });
  api.get("/opinion", headersMw, handler);
}

/*
REMOVIDO: /api/presences agregado
Motivo: a tabela 'rancho_presencas_agregado' não existe mais. Caso precise novamente,
podemos criar uma view baseada em meal_presences e expor por aqui.
*/

/*
REMOVIDO: /api/rancho_agregado
Motivo: a tabela 'rancho_agregado' não existe mais. Caso precise novamente (ex.: total_vai_comer),
podemos criar uma view ou endpoint específico agregando meal_forecasts (will_eat).
*/

// /api/rancho_previsoes -> meal_forecasts
{
  const [headersMw, handler] = createApiHandler({
    table: "meal_forecasts",
    select:
      "user_id, date, meal, will_eat, mess_hall_id, created_at, updated_at",
    dateColumn: "date",
    dateColumnType: "date",
    defaultOrder: [
      { column: "date", ascending: false },
      { column: "mess_hall_id", ascending: true },
      { column: "meal", ascending: true },
    ],
    mapParams: {
      user_id: "user_id", // ?user_id=uuid1,uuid2
      meal: "meal", // ?meal=cafe,almoco,janta,ceia
      mess_hall_id: "mess_hall_id", // ?mess_hall_id=1,2
      // Filtro de data: ?date=YYYY-MM-DD ou ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
      will_eat: "will_eat", // ?will_eat=true/false
    },
    cacheControl: "public, max-age=300",
  });
  api.get("/rancho_previsoes", headersMw, handler);
}

// /api/wherewhowhen (era apiPresences.tsx) -> meal_presences
{
  const [headersMw, handler] = createApiHandler({
    table: "meal_presences",
    select: "user_id, date, meal, mess_hall_id, created_at, updated_at",
    dateColumn: "date",
    dateColumnType: "date",
    defaultOrder: [
      { column: "date", ascending: false },
      { column: "mess_hall_id", ascending: true },
      { column: "user_id", ascending: true },
    ],
    mapParams: {
      user_id: "user_id", // ?user_id=uuid1,uuid2
      meal: "meal", // ?meal=cafe,almoco,janta,ceia
      mess_hall_id: "mess_hall_id", // ?mess_hall_id=1,2
      // Filtro de data: ?date=YYYY-MM-DD ou ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
    },
    cacheControl: "public, max-age=300",
  });
  api.get("/wherewhowhen", headersMw, handler);
}

// /api/user-military-data -> user_military_data
{
  const [headersMw, handler] = createApiHandler({
    table: "user_military_data",
    select:
      '"nrOrdem", "nrCpf", "nmGuerra", "nmPessoa", "sgPosto", "sgOrg", "dataAtualizacao"',
    dateColumn: "dataAtualizacao",
    dateColumnType: "timestamp",
    defaultOrder: [
      { column: "dataAtualizacao", ascending: false },
      { column: "sgOrg", ascending: true },
      { column: "sgPosto", ascending: true },
      { column: "nmGuerra", ascending: true },
    ],
    mapParams: {
      nrOrdem: "nrOrdem", // ?nrOrdem=123456 ou ?nrOrdem=123,456
      nrCpf: "nrCpf", // ?nrCpf=00000000000 ou ?nrCpf=111,222
      nmGuerra: "nmGuerra", // ?nmGuerra_ilike=silva
      nmPessoa: "nmPessoa", // ?nmPessoa_ilike=joao
      sgPosto: "sgPosto", // ?sgPosto=CB,SGT
      sgOrg: "sgOrg", // ?sgOrg=... ou ?sgOrg_ilike=...
      // Filtro de data: ?date=YYYY-MM-DD ou ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
    },
    cacheControl: "public, max-age=300",
  });
  api.get("/user-military-data", headersMw, handler);
}

// /api/user-data -> user_data
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
      id: "id", // ?id=uuid ou ?id=uuid1,uuid2
      email: "email", // ?email=foo@bar.com ou ?email_ilike=foo
      nrOrdem: "nrOrdem", // ?nrOrdem=123456 ou ?nrOrdem_ilike=123
    },
    cacheControl: "public, max-age=300",
  });
  api.get("/user-data", headersMw, handler);
}

export default api;
