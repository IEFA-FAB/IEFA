/**
 * Rotas admin GS1: import da publicação GPC e lookup de GTIN via
 * Verified by GS1 (CNP — GS1 Brasil), com cache na entidade
 * gs1_integration.gtin.
 *
 * Consumidor: server fns do sisub (proxy — o browser nunca chama direto).
 * Degradação graciosa: sem credenciais VbG configuradas, o lookup responde
 * 503 e o fluxo manual (check digit local + cadastro) segue funcionando.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { parseGtin } from "@iefa/sisub-domain/gtin"
import { createClient } from "@supabase/supabase-js"
import { fetchWithRetry } from "../../lib/fetch-with-retry.ts"
import { secureCompare } from "../../lib/secure-compare.ts"
import { type GpcImportOptions, type GpcImportSummary, importGpc, isAllowedGpcUrl } from "../../workers/gs1-sync/gpc.ts"

type Gs1Client = ReturnType<typeof getSupabase>

function requiredEnv(name: "API_SUPABASE_URL" | "API_SUPABASE_SERVICE_ROLE_KEY") {
	const value = process.env[name]
	if (!value) throw new Error(`${name} is required`)
	return value
}

function getSupabase() {
	return createClient(requiredEnv("API_SUPABASE_URL"), requiredEnv("API_SUPABASE_SERVICE_ROLE_KEY"), {
		db: { schema: "gs1_integration" },
		auth: { persistSession: false },
	})
}

const ErrorSchema = z.object({ error: z.string() })

const GtinLookupSchema = z.object({
	gtin: z.string(),
	description: z.string().nullable(),
	brand: z.string().nullable(),
	net_content: z.number().nullable(),
	net_content_unit: z.string().nullable(),
	ncm: z.string().nullable(),
	gpc_brick_code: z.string().nullable(),
	source: z.string(),
	verified_at: z.string().nullable(),
})

const adminSecurity = [{ AdminSecret: [] }]

const gpcSyncRoute = createRoute({
	method: "post",
	path: "/gpc-sync",
	tags: ["Admin — GS1"],
	summary: "Import GPC publication",
	description:
		"Baixa a publicação GPC (JSON, GPC Browser export) e faz upsert idempotente em gpc_brick, gpc_attribute, gpc_attribute_value e gpc_brick_attribute. `segmentCodes` limita o import a um recorte da taxonomia (ex.: só alimentos); omitido, importa a publicação inteira.",
	security: adminSecurity,
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({ url: z.string().url().optional(), segmentCodes: z.array(z.string()).optional() }).optional(),
				},
			},
			required: false,
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ bricks: z.number(), attributes: z.number(), attributeValues: z.number(), brickAttributes: z.number() }),
				},
			},
			description: "Import concluído",
		},
		400: { content: { "application/json": { schema: ErrorSchema } }, description: "URL ausente (nem body nem GS1_GPC_PUBLICATION_URL)" },
		401: { content: { "application/json": { schema: ErrorSchema } }, description: "Unauthorized" },
	},
})

const gtinLookupRoute = createRoute({
	method: "get",
	path: "/lookup/{gtin}",
	tags: ["Admin — GS1"],
	summary: "Lookup GTIN via Verified by GS1",
	description: "Valida check digit, consulta o cache (gs1_integration.gtin) e, se necessário e configurado, a API Verified by GS1.",
	security: adminSecurity,
	request: { params: z.object({ gtin: z.string().min(8).max(14) }) },
	responses: {
		200: { content: { "application/json": { schema: GtinLookupSchema } }, description: "Dados do GTIN (cache ou VbG)" },
		404: { content: { "application/json": { schema: ErrorSchema } }, description: "GTIN não encontrado no VbG" },
		422: { content: { "application/json": { schema: ErrorSchema } }, description: "GTIN inválido (formato ou check digit)" },
		401: { content: { "application/json": { schema: ErrorSchema } }, description: "Unauthorized" },
		503: { content: { "application/json": { schema: ErrorSchema } }, description: "Verified by GS1 não configurado/indisponível" },
	},
})

/**
 * Códigos de unidade do VbG (UN/ECE Rec 20, ex.: KGM, GRM, LTR, MLT, H87)
 * → catálogo canônico core.measure_unit. Código desconhecido vira null —
 * gravar o código cru violaria a FK net_content_unit → measure_unit
 * (o payload bruto preserva o original em raw_payload).
 */
const VBG_UNIT_TO_CANONICAL: Record<string, string> = {
	KGM: "KG",
	KG: "KG",
	GRM: "G",
	G: "G",
	LTR: "LT",
	L: "LT",
	LT: "LT",
	MLT: "ML",
	ML: "ML",
	H87: "UN",
	EA: "UN",
	UN: "UN",
	DZN: "DZ",
	DZ: "DZ",
}

/** Mapeia o payload do VbG (chaves variam por versão) para as colunas da entidade. */
export function mapVbgPayload(payload: any): {
	description: string | null
	brand: string | null
	net_content: number | null
	net_content_unit: string | null
	ncm: string | null
	gpc_brick_code: string | null
} {
	const description = payload?.tradeItemDescription ?? payload?.productDescription ?? payload?.description ?? null
	const brand = payload?.brandName ?? payload?.brand ?? null
	const rawContent = payload?.netContent ?? payload?.tradeItemMeasurements?.netContent ?? null
	const netContent = rawContent?.value != null ? Number(rawContent.value) : null
	const rawUnit = rawContent?.measurementUnitCode ?? rawContent?.unitCode ?? null
	const netContentUnit = rawUnit != null ? (VBG_UNIT_TO_CANONICAL[String(rawUnit).trim().toUpperCase()] ?? null) : null
	const ncm = payload?.ncm ?? payload?.ncmCode ?? null
	const gpc = payload?.gpcCategoryCode ?? payload?.gpcCode ?? null
	return {
		description: description != null ? String(description) : null,
		brand: brand != null ? String(brand) : null,
		net_content: Number.isFinite(netContent) ? netContent : null,
		net_content_unit: netContentUnit != null ? String(netContentUnit) : null,
		ncm: ncm != null ? String(ncm) : null,
		gpc_brick_code: gpc != null ? String(gpc) : null,
	}
}

export interface Gs1AdminRoutesDeps {
	adminSecret?: string
	getSupabase?: () => Gs1Client
	runGpcImport?: (supabase: Gs1Client, url: string, options?: GpcImportOptions) => Promise<GpcImportSummary>
	fetchVbg?: (gtin: string) => Promise<Response>
}

export function createGs1AdminRoutes(deps: Gs1AdminRoutesDeps = {}) {
	const gs1AdminRoutes = new OpenAPIHono()
	const adminSecret = deps.adminSecret ?? process.env.ADMIN_SECRET
	const createSupabase = deps.getSupabase ?? getSupabase
	const runGpcImport = deps.runGpcImport ?? importGpc

	const defaultFetchVbg = (gtin: string) => {
		const baseUrl = process.env.GS1_VBG_API_URL
		const apiKey = process.env.GS1_VBG_API_KEY
		if (!baseUrl || !apiKey) throw new VbgNotConfiguredError()
		return fetchWithRetry(
			`${baseUrl.replace(/\/$/, "")}/${gtin}`,
			{ headers: { accept: "application/json", apikey: apiKey } },
			{ label: "VbG", maxAttempts: 2 }
		)
	}
	const fetchVbg = deps.fetchVbg ?? defaultFetchVbg

	gs1AdminRoutes.use("*", async (c, next) => {
		const secret = c.req.header("x-admin-secret")
		if (!secureCompare(secret, adminSecret)) return c.json({ error: "Unauthorized" }, 401)
		return next()
	})

	gs1AdminRoutes
		.openapi(gpcSyncRoute, async (c) => {
			const body = await c.req.json().catch(() => undefined)
			const url = (body?.url as string | undefined) ?? process.env.GS1_GPC_PUBLICATION_URL
			if (!url) return c.json({ error: "Informe { url } no body ou configure GS1_GPC_PUBLICATION_URL" }, 400)
			if (!isAllowedGpcUrl(url)) return c.json({ error: "URL não permitida — apenas https em gs1.org/gs1br.org" }, 400)

			const segmentCodes = (body?.segmentCodes as string[] | undefined) ?? undefined
			const summary = await runGpcImport(createSupabase(), url, { segmentCodes })
			console.log(
				`[gs1-admin] GPC import concluído: ${summary.bricks} bricks, ${summary.attributes} atributos, ${summary.attributeValues} valores, ${summary.brickAttributes} vínculos`
			)
			return c.json(summary, 200)
		})
		.openapi(gtinLookupRoute, async (c) => {
			const { gtin: rawGtin } = c.req.valid("param")
			const gtin = parseGtin(rawGtin)
			if (!gtin) return c.json({ error: "GTIN inválido (formato ou dígito verificador)" }, 422)

			const supabase = createSupabase()

			// Cache-first: entidade já verificada não volta ao VbG.
			const { data: cached } = await supabase.from("gtin").select("*").eq("gtin", gtin).maybeSingle()
			if (cached?.verified_at) return c.json(GtinLookupSchema.parse(cached), 200)

			let res: Response
			try {
				res = await fetchVbg(gtin)
			} catch (err) {
				if (err instanceof VbgNotConfiguredError) return c.json({ error: "Verified by GS1 não configurado (GS1_VBG_API_URL/GS1_VBG_API_KEY)" }, 503)
				return c.json({ error: "Verified by GS1 indisponível — cadastre o GTIN manualmente" }, 503)
			}
			if (res.status === 404) return c.json({ error: "GTIN não encontrado no Verified by GS1" }, 404)
			if (!res.ok) return c.json({ error: `Verified by GS1 respondeu HTTP ${res.status}` }, 503)

			const payload = (await res.json()) as unknown
			const mapped = mapVbgPayload(payload)
			const row = {
				gtin,
				...mapped,
				source: "vbg",
				raw_payload: payload,
				verified_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			}
			const { data: saved, error } = await supabase.from("gtin").upsert(row, { onConflict: "gtin" }).select().single()
			if (error) throw new Error(`Falha ao cachear GTIN: ${error.message}`)

			return c.json(GtinLookupSchema.parse(saved), 200)
		})

	return gs1AdminRoutes
}

class VbgNotConfiguredError extends Error {
	constructor() {
		super("VbG not configured")
	}
}

export const gs1AdminRoutes = createGs1AdminRoutes()
