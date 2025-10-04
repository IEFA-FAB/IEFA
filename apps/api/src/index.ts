// src/index.ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import api from "./api/routes";

const app = new Hono();

// Coloque a API sob /api
app.route("/api", api);

// Healthcheck
app.get("/health", (c) => c.text("ok"));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Server running on http://localhost:${port}`);
});
