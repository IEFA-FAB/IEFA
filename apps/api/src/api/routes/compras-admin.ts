import { createClient } from "@supabase/supabase-js"
import { Hono } from "hono"
import { env } from "../../env.ts"
import { hasLiveSync, runComprasSync } from "../../workers/compras-sync/index.ts"

export const comprasAdminRoutes = new Hono()

// Middleware: verifica x-admin-secret
comprasAdminRoutes.use("*", async (c, next) => {
	const secret = c.req.header("x-admin-secret")
	if (!secret || secret !== env.ADMIN_SECRET) {
		return c.json({ error: "Unauthorized" }, 401)
	}
	return next()
})

function getSupabase() {
	return createClient(env.API_SUPABASE_URL, env.API_SUPABASE_SERVICE_ROLE_KEY, {
		db: { schema: "sisub" },
		auth: { persistSession: false },
	})
}

// ── POST /admin/compras/sync — trigger manual ────────────────────────────────

comprasAdminRoutes.post("/sync", async (c) => {
	const supabase = getSupabase()

	// Verificar sync concorrente (heartbeat-aware: ignora processos mortos)
	if (await hasLiveSync(supabase)) {
		return c.json({ error: "Sync já está em andamento" }, 409)
	}

	// Disparar sync em background (não awaited)
	runComprasSync({ triggeredBy: "manual" })
		.then((syncId) => {
			console.log(`[compras-admin] Sync manual #${syncId} concluída`)
		})
		.catch((err) => {
			console.error("[compras-admin] Sync manual falhou:", err)
		})

	// Aguardar brevemente para que o log seja criado antes de retornar
	await new Promise((resolve) => setTimeout(resolve, 200))

	const { data: latest } = await supabase
		.from("compras_sync_log")
		.select("id")
		.eq("triggered_by", "manual")
		.order("started_at", { ascending: false })
		.limit(1)
		.single()

	return c.json(
		{
			sync_id: latest?.id ?? null,
			message: "Sync iniciada em background",
		},
		202
	)
})

// ── GET /admin/compras/sync/latest — última sync ──────────────────────────────

comprasAdminRoutes.get("/sync/latest", async (c) => {
	const supabase = getSupabase()

	const { data: log, error } = await supabase.from("compras_sync_log").select("*").order("started_at", { ascending: false }).limit(1).single()

	if (error || !log) {
		return c.json({ error: "Nenhuma sync encontrada" }, 404)
	}

	const { data: steps } = await supabase.from("compras_sync_step").select("*").eq("sync_id", log.id).order("id", { ascending: true })

	return c.json({ ...log, steps: steps ?? [] })
})

// ── GET /admin/compras/sync/:id — sync específica (polling) ───────────────────

comprasAdminRoutes.get("/sync/:id", async (c) => {
	const id = Number(c.req.param("id"))
	if (!Number.isInteger(id) || id <= 0) {
		return c.json({ error: "ID inválido" }, 400)
	}

	const supabase = getSupabase()

	const { data: log, error } = await supabase.from("compras_sync_log").select("*").eq("id", id).single()

	if (error || !log) {
		return c.json({ error: "Sync não encontrada" }, 404)
	}

	const { data: steps } = await supabase.from("compras_sync_step").select("*").eq("sync_id", id).order("id", { ascending: true })

	return c.json({ ...log, steps: steps ?? [] })
})

// ── POST /admin/compras/sync/:id/stop — solicita parada da sync ───────────────

comprasAdminRoutes.post("/sync/:id/stop", async (c) => {
	const id = Number(c.req.param("id"))
	if (!Number.isInteger(id) || id <= 0) {
		return c.json({ error: "ID inválido" }, 400)
	}

	const supabase = getSupabase()

	const { data: log, error } = await supabase.from("compras_sync_log").select("id, status").eq("id", id).single()

	if (error || !log) return c.json({ error: "Sync não encontrada" }, 404)
	if (log.status !== "running") return c.json({ error: "Sync não está em andamento" }, 409)

	await supabase.from("compras_sync_log").update({ stop_requested: true }).eq("id", id)

	console.log(`[compras-admin] Stop solicitado para sync #${id}`)
	return c.json({ message: "Parada solicitada — será aplicada ao fim do step atual" })
})

// ── GET /products/:productId/price-research — pesquisa de preço em tempo real ─

comprasAdminRoutes.get("/price-research/:productId", async (c) => {
	const productId = c.req.param("productId")
	const supabase = getSupabase()

	const { data: product, error } = await supabase.from("product").select("id, catmat_item_codigo").eq("id", productId).single()

	if (error || !product) {
		return c.json({ error: "Produto não encontrado" }, 404)
	}

	if (!product.catmat_item_codigo) {
		return c.json({ error: "Produto não possui catmat_item_codigo associado. Vincule o produto a um item CATMAT primeiro." }, 404)
	}

	const { estado, codigoUasg, codigoMunicipio, pagina = "1" } = c.req.query() as Record<string, string>
	const params: Record<string, string> = {
		codigoItemCatalogo: String(product.catmat_item_codigo),
		pagina,
		tamanhoPagina: "500",
	}
	if (estado) params.estado = estado
	if (codigoUasg) params.codigoUasg = codigoUasg
	if (codigoMunicipio) params.codigoMunicipio = codigoMunicipio

	const qs = new URLSearchParams(params)
	const url = `https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/1_consultarMaterial?${qs}`

	try {
		const res = await fetch(url, {
			signal: AbortSignal.timeout(30_000),
			headers: { accept: "*/*" },
		})
		if (!res.ok) {
			return c.json({ error: `API Compras retornou ${res.status}` }, 502)
		}
		const data = await res.json()
		return c.json(data)
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		return c.json({ error: `Falha ao consultar API Compras: ${message}` }, 502)
	}
})
