/**
 * Catálogo público do SISUB — SOMENTE LEITURA, anônimo.
 *
 * O catálogo de insumos é público por decisão do mantenedor: é a lista de gêneros de
 * alimentação e itens auxiliares que o IEFA compra, sem nada de contratação junto. Estas
 * rotas são as ÚNICAS anônimas de `/api/*` que publicam dado de domínio do sisub, e existem
 * sob três travas:
 *
 * 1. **Só GET.** Nenhuma rota aqui aceita corpo de requisição e nenhuma muta estado. O router
 *    é montado inteiro em `/api/catalog`, e `catalog.test.ts` falha se alguém registrar um
 *    método diferente de GET neste arquivo — a garantia é do ROUTER, não do bom senso de quem
 *    edita depois.
 * 2. **Projeção é allow-list.** `INGREDIENT_COLUMNS` / `FOLDER_COLUMNS` são as colunas
 *    publicadas, nunca `select *`. Campo publicado numa rota anônima é permanente: some do
 *    contrato só quebrando consumidor que nunca se apresentou. Ficam de fora preço, vínculo de
 *    compra (`purchase_item`), revisão interna, id de usuário, `legacy_id` e tudo de
 *    `finance`/`procurement`/`siafi_integration`.
 * 3. **Recorte de linha é fixo, não parametrizável.** Soft-deleted (`deleted_at`) nunca sai, e
 *    insumo com `preparation_group_id` também não — essas 1.626 linhas são preparações
 *    herdadas do SISUBWEB, não itens de catálogo (ver `preparation-scope.ts` no domínio).
 *
 * As tabelas têm RLS ligada e NENHUMA policy: `anon` não lê nada delas. O acesso é pelo client
 * de service role, como no resto do app — a rota é anônima, a leitura no banco não é. Afrouxar
 * RLS por migration para servir uma rota pública seria abrir a tabela para todo mundo que tem a
 * publishable key, e não só para esta projeção.
 *
 * Dívida conhecida e deliberadamente preservada: os serviços Hono montam `createClient` direto
 * em vez de usar `@iefa/supabase-kit`. Este arquivo segue o padrão do arquivo vizinho
 * (`nutrition-admin.ts`), com o client criado por `getSupabase()` — lazy, para que o módulo
 * possa ser importado num teste sem credencial no ambiente.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { createClient } from "@supabase/supabase-js"
import { clampLimit, clampOffset, commaListToArray, parseSortableOrderParam } from "../query-params.ts"

function requiredEnv(name: "API_SUPABASE_URL" | "API_SUPABASE_SERVICE_ROLE_KEY") {
	const value = process.env[name]
	if (!value) throw new Error(`${name} is required`)
	return value
}

/** Client do catálogo. O catálogo mora em `kitchen` desde o split de schemas por domínio. */
function getSupabase() {
	return createClient(requiredEnv("API_SUPABASE_URL"), requiredEnv("API_SUPABASE_SERVICE_ROLE_KEY"), {
		db: { schema: "kitchen" },
		auth: { persistSession: false },
	})
}

/**
 * Teto de página. Sem teto uma rota anônima vira dump do banco numa requisição; com teto e sem
 * `total` o consumidor lê a primeira página e conclui que o catálogo tem 50 itens. As duas
 * coisas são obrigatórias, e por isso a resposta é um envelope e não um array cru.
 */
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/** Colunas por onde se pode ordenar — subconjunto da projeção, nunca coluna não publicada. */
const SORTABLE_COLUMNS = ["description", "created_at"] as const

/** Projeção do insumo. Allow-list: coluna nova aqui é decisão de publicar para sempre. */
export const INGREDIENT_COLUMNS = [
	"id",
	"description",
	"measure_unit",
	"correction_factor",
	"density_factor",
	"rehydration_index",
	"folder_id",
	"created_at",
] as const

/** Projeção da pasta do catálogo. */
export const FOLDER_COLUMNS = ["id", "description", "parent_id", "catalog_scope", "created_at"] as const

/**
 * Colunas `numeric` do insumo: o driver do PostgREST devolve STRING ("1.00"), o contrato
 * declara `number`. Sem a conversão o OpenAPI mentiria sobre o tipo — a mesma divergência que
 * fazia a ficha técnica do sisub acusar "Invalid input" em campo salvo.
 */
const INGREDIENT_NUMERIC_COLUMNS = ["correction_factor", "density_factor", "rehydration_index"] as const

/**
 * Valores de `kitchen.folder.catalog_scope`. Espelha `CATALOG_SCOPE_VALUES` de
 * `@iefa/sisub-domain` (operations/catalog-scope.ts) e o CHECK `folder_catalog_scope_check`.
 * Declarado aqui em vez de importado porque o barril `@iefa/sisub-domain/operations` arrasta o
 * schema Drizzle inteiro para dentro do serviço por duas strings.
 */
const CATALOG_SCOPE_VALUES = ["alimentacao", "auxiliar"] as const

const ErrorSchema = z.object({
	error: z.string(),
	details: z.string().optional(),
})

const IngredientSchema = z.object({
	id: z.uuid(),
	description: z.string().nullable(),
	measure_unit: z.string().nullable(),
	correction_factor: z.number().nullable(),
	density_factor: z.number().nullable(),
	rehydration_index: z.number().nullable(),
	folder_id: z.uuid().nullable(),
	created_at: z.iso.datetime({ offset: true }),
})

const FolderSchema = z.object({
	id: z.uuid(),
	description: z.string().nullable(),
	parent_id: z.uuid().nullable(),
	catalog_scope: z.enum(CATALOG_SCOPE_VALUES),
	created_at: z.iso.datetime({ offset: true }),
})

/** Envelope paginado. `total` é a contagem do recorte INTEIRO, não a da página. */
function pageSchema<T extends z.ZodType>(item: T) {
	return z.object({
		data: z.array(item),
		total: z.number().int(),
		limit: z.number().int(),
		offset: z.number().int(),
	})
}

const PUBLIC_NOTE =
	"Rota **pública e somente leitura** — não exige autenticação e não existe verbo de escrita no catálogo. " +
	"A resposta é paginada: `total` é o tamanho do catálogo inteiro (não o da página), " +
	`\`limit\` é limitado a ${MAX_LIMIT} (padrão ${DEFAULT_LIMIT}).`

function defineCatalogRoute<TSchema extends z.ZodType>(config: {
	path: string
	summary: string
	description: string
	parameters?: any[]
	itemSchema: TSchema
}) {
	return createRoute({
		method: "get" as const,
		path: config.path,
		tags: ["Catálogo público"],
		summary: config.summary,
		description: `${config.description}\n\n${PUBLIC_NOTE}`,
		parameters: [
			...(config.parameters ?? []),
			{
				name: "limit",
				in: "query" as const,
				schema: { type: "integer", minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
				description: `Itens por página (teto ${MAX_LIMIT}; valor maior é reduzido ao teto)`,
			},
			{
				name: "offset",
				in: "query" as const,
				schema: { type: "integer", minimum: 0, default: 0 },
				description: "Deslocamento da página",
			},
			{
				name: "order",
				in: "query" as const,
				schema: { type: "string", default: "description:asc" },
				description: `Ordenação: coluna:asc|desc. Colunas permitidas: ${SORTABLE_COLUMNS.join(", ")}`,
			},
		],
		responses: {
			200: {
				description: "Sucesso",
				content: { "application/json": { schema: pageSchema(config.itemSchema) } },
			},
			400: {
				description: "Parâmetro de consulta inválido",
				content: { "application/json": { schema: ErrorSchema } },
			},
			500: {
				description: "Erro interno do servidor",
				content: { "application/json": { schema: ErrorSchema } },
			},
		},
	})
}

const listIngredientsRoute = defineCatalogRoute({
	path: "/ingredients",
	summary: "Lista o catálogo de insumos",
	description:
		"Catálogo global de insumos do SISUB — gêneros de alimentação e itens auxiliares. " +
		"Não inclui insumo excluído nem as preparações herdadas do SISUBWEB. " +
		"Nenhum dado de preço, contratação ou revisão interna é publicado.",
	parameters: [
		{ name: "description_ilike", in: "query", schema: { type: "string" }, description: "Filtrar por descrição (contém, case-insensitive)" },
		{ name: "folder_id", in: "query", schema: { type: "string" }, description: "Filtrar por pasta(s) — UUID, ou lista separada por vírgula" },
		{ name: "measure_unit", in: "query", schema: { type: "string" }, description: "Filtrar por unidade de medida (exato, ou lista separada por vírgula)" },
	],
	itemSchema: IngredientSchema,
})

const listFoldersRoute = defineCatalogRoute({
	path: "/folders",
	summary: "Lista as pastas do catálogo",
	description:
		"Árvore de pastas em que os insumos estão classificados (`ingredient.folder_id` aponta para cá). " +
		"`catalog_scope` separa gênero de alimentação (`alimentacao`) de item auxiliar — EPI, limpeza, embalagem — (`auxiliar`).",
	parameters: [
		{ name: "description_ilike", in: "query", schema: { type: "string" }, description: "Filtrar por descrição (contém, case-insensitive)" },
		{ name: "parent_id", in: "query", schema: { type: "string" }, description: "Filtrar por pasta(s) pai — UUID, ou lista separada por vírgula" },
		{
			name: "catalog_scope",
			in: "query",
			schema: { type: "string", enum: [...CATALOG_SCOPE_VALUES] },
			description: "Filtrar por escopo do catálogo",
		},
	],
	itemSchema: FolderSchema,
})

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type UuidFilter = { ok: true; values: string[] } | { ok: false }

/**
 * UUID malformado no filtro vira 400, não 500.
 *
 * Sem isso o `22P02` do Postgres sobe pelo caminho de erro genérico e a rota responde 500 a um
 * erro que é do cliente — e ainda por cima com o log de servidor sujo de requisição inválida.
 */
function parseUuidFilter(raw: string | null): UuidFilter | null {
	if (!raw) return null
	const values = commaListToArray(raw)
	if (values.length === 0) return null
	if (!values.every((v) => UUID_PATTERN.test(v))) return { ok: false }
	return { ok: true, values }
}

/** `numeric` do PostgREST chega como string; o contrato publica `number | null`. */
function toNumericColumns<T extends Record<string, unknown>>(row: T, columns: readonly string[]) {
	const out: Record<string, unknown> = { ...row }
	for (const column of columns) {
		const value = out[column]
		if (value === null || value === undefined) {
			out[column] = null
			continue
		}
		const parsed = typeof value === "number" ? value : Number(value)
		out[column] = Number.isFinite(parsed) ? parsed : null
	}
	return out
}

export type CatalogRoutesDeps = {
	/** Injetável para teste — sem isso o módulo só é importável com credencial no ambiente. */
	getSupabase?: () => ReturnType<typeof getSupabase>
}

export function createCatalogRoutes(deps: CatalogRoutesDeps = {}) {
	const createSupabase = deps.getSupabase ?? getSupabase
	const catalogRoutes = new OpenAPIHono()

	// O catálogo é imutável do ponto de vista de quem consome: cache curto é seguro e tira a
	// rota anônima do caminho do banco em rajada de leitura. Só resposta boa é cacheável — um
	// 400 ou 500 com `public, max-age` gruda o erro na borda por cinco minutos.
	catalogRoutes.use("/*", async (c, next) => {
		await next()
		if (c.res.status === 200 && !c.res.headers.get("Cache-Control")) c.header("Cache-Control", "public, max-age=300")
	})

	return catalogRoutes
		.openapi(listIngredientsRoute, async (c) => {
			const sp = new URL(c.req.url).searchParams

			const order = parseSortableOrderParam(sp.get("order"), SORTABLE_COLUMNS)
			if (!order.ok) return c.json({ error: "Ordenação inválida", details: `Colunas permitidas: ${SORTABLE_COLUMNS.join(", ")}` }, 400)

			const folderIds = parseUuidFilter(sp.get("folder_id"))
			if (folderIds && !folderIds.ok)
				return c.json({ error: "Parâmetro inválido", details: "folder_id deve ser um UUID, ou uma lista de UUIDs separada por vírgula" }, 400)

			const limit = clampLimit(sp.get("limit"), DEFAULT_LIMIT, MAX_LIMIT)
			const offset = clampOffset(sp.get("offset"))

			try {
				let query = createSupabase()
					.from("ingredient")
					.select(INGREDIENT_COLUMNS.join(", "), { count: "exact" })
					// Recorte fixo do que é catálogo: nem excluído, nem preparação do SISUBWEB.
					.is("deleted_at", null)
					.is("preparation_group_id", null)

				const description = sp.get("description_ilike")
				if (description) query = query.ilike("description", `%${description}%`)
				if (folderIds?.ok) query = folderIds.values.length === 1 ? query.eq("folder_id", folderIds.values[0]) : query.in("folder_id", folderIds.values)
				const measureUnits = commaListToArray(sp.get("measure_unit") ?? "")
				if (measureUnits.length === 1) query = query.eq("measure_unit", measureUnits[0])
				else if (measureUnits.length > 1) query = query.in("measure_unit", measureUnits)

				const finalOrder = order.order.length ? order.order : [{ column: "description", ascending: true }]
				for (const rule of finalOrder) query = query.order(rule.column, { ascending: rule.ascending ?? true })

				const { data, error, count } = await query.range(offset, offset + limit - 1)
				if (error) {
					// A mensagem do PostgREST (coluna, schema, hint SQL) fica no log do servidor e
					// nunca no corpo — a rota é anônima.
					console.error("[catalog] Erro Supabase em /ingredients:", error)
					return c.json({ error: "Erro interno do servidor ao buscar dados" }, 500)
				}

				const rows = (data ?? []) as unknown as Record<string, unknown>[]
				return c.json({ data: rows.map((row) => toNumericColumns(row, INGREDIENT_NUMERIC_COLUMNS)), total: count ?? rows.length, limit, offset } as any, 200)
			} catch (err) {
				console.error("[catalog] Erro crítico em /ingredients:", err)
				return c.json({ error: "Erro interno do servidor" }, 500)
			}
		})
		.openapi(listFoldersRoute, async (c) => {
			const sp = new URL(c.req.url).searchParams

			const order = parseSortableOrderParam(sp.get("order"), SORTABLE_COLUMNS)
			if (!order.ok) return c.json({ error: "Ordenação inválida", details: `Colunas permitidas: ${SORTABLE_COLUMNS.join(", ")}` }, 400)

			const parentIds = parseUuidFilter(sp.get("parent_id"))
			if (parentIds && !parentIds.ok)
				return c.json({ error: "Parâmetro inválido", details: "parent_id deve ser um UUID, ou uma lista de UUIDs separada por vírgula" }, 400)

			const scope = sp.get("catalog_scope")
			if (scope && !CATALOG_SCOPE_VALUES.includes(scope as (typeof CATALOG_SCOPE_VALUES)[number]))
				return c.json({ error: "Parâmetro inválido", details: `catalog_scope deve ser um de: ${CATALOG_SCOPE_VALUES.join(", ")}` }, 400)

			const limit = clampLimit(sp.get("limit"), DEFAULT_LIMIT, MAX_LIMIT)
			const offset = clampOffset(sp.get("offset"))

			try {
				let query = createSupabase().from("folder").select(FOLDER_COLUMNS.join(", "), { count: "exact" }).is("deleted_at", null)

				const description = sp.get("description_ilike")
				if (description) query = query.ilike("description", `%${description}%`)
				if (parentIds?.ok) query = parentIds.values.length === 1 ? query.eq("parent_id", parentIds.values[0]) : query.in("parent_id", parentIds.values)
				if (scope) query = query.eq("catalog_scope", scope)

				const finalOrder = order.order.length ? order.order : [{ column: "description", ascending: true }]
				for (const rule of finalOrder) query = query.order(rule.column, { ascending: rule.ascending ?? true })

				const { data, error, count } = await query.range(offset, offset + limit - 1)
				if (error) {
					console.error("[catalog] Erro Supabase em /folders:", error)
					return c.json({ error: "Erro interno do servidor ao buscar dados" }, 500)
				}

				const rows = (data ?? []) as unknown as Record<string, unknown>[]
				return c.json({ data: rows, total: count ?? rows.length, limit, offset } as any, 200)
			} catch (err) {
				console.error("[catalog] Erro crítico em /folders:", err)
				return c.json({ error: "Erro interno do servidor" }, 500)
			}
		})
}

export const catalogRoutes = createCatalogRoutes()
