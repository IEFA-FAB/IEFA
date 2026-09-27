import { createHash } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { type Context, Hono } from "hono"
import { z } from "zod"
import { env } from "../../env.ts"
import { secureCompare } from "../../lib/secure-compare.ts"
import { analisarPrecos, type OpcoesPesquisa } from "../../workers/pesquisa-preco/analyzer.ts"
import { consultarMaterialPrecos } from "../../workers/pesquisa-preco/client.ts"
import type { AmostraPreco, PriceAnalysis, QuantityEstimateItemPriceResult } from "../../workers/pesquisa-preco/types.ts"

// ─── Validação de entrada ─────────────────────────────────────────────────────

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/**
 * Query params do GET /material/:catmatCode.
 * Defaults e clamps codificados no schema preservam o contrato anterior:
 * months 12 (inteiro, clamp 1–24; 0/vazio cai no default — herança do `|| 12`),
 * similarityThreshold 0.4 (clamp 0–1; 0 cai no default — herança do `|| 0.4`).
 */
const materialQuerySchema = z.object({
	months: z.coerce
		.number()
		.default(12)
		.transform((v) => clamp(Math.trunc(v) || 12, 1, 24)),
	similarityThreshold: z.coerce
		.number()
		.default(0.4)
		.transform((v) => clamp(v || 0.4, 0, 1)),
	estado: z.string().optional(),
	codigoUasg: z.string().optional(),
	codigoMunicipio: z.coerce.number().optional(),
})

/**
 * Body do POST /quantity-estimates/:quantityEstimateId (todos opcionais).
 * Contrato anterior preservado: months 12 (clamp 1–24), threshold 0.4 (clamp
 * 0–1) — aqui 0 explícito NÃO cai no default (era `?? 12` / `?? 0.4`).
 */
const quantityEstimateBodySchema = z.object({
	months: z
		.number()
		.default(12)
		.transform((v) => clamp(v, 1, 24)),
	similarityThreshold: z
		.number()
		.default(0.4)
		.transform((v) => clamp(v, 0, 1)),
	estado: z.string().optional(),
	codigoUasg: z.string().optional(),
	codigoMunicipio: z.number().optional(),
})

/** Formata issues do zod numa linha só, apropriada pra payload de erro JSON. */
function formatZodError(error: z.ZodError): string {
	return error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ")
}

/** Monta OpcoesPesquisa a partir de input validado — mesma semântica dos spreads condicionais anteriores (vazio/0 ⇒ filtro omitido). */
function buildOptions(input: z.output<typeof materialQuerySchema> | z.output<typeof quantityEstimateBodySchema>): OpcoesPesquisa {
	return {
		months: input.months,
		similarityThreshold: input.similarityThreshold,
		...(input.estado ? { estado: input.estado.toUpperCase() } : {}),
		...(input.codigoUasg ? { codigoUasg: input.codigoUasg } : {}),
		...(input.codigoMunicipio ? { codigoMunicipio: input.codigoMunicipio } : {}),
	}
}

function getSupabase() {
	return createClient(env.API_SUPABASE_URL, env.API_SUPABASE_SERVICE_ROLE_KEY, {
		db: { schema: "procurement" },
		auth: { persistSession: false },
	})
}

type Supabase = ReturnType<typeof getSupabase>

/**
 * Busca a descrição oficial de um item no catálogo CATMAT sincronizado.
 * Retorna null se o item não estiver no banco (sync pendente ou código inválido).
 * Campos externos: `codigo_item`, `descricao_item` (nomes do Compras.gov.br).
 */
async function buscarDescricaoCatmat(supabase: Supabase, catmatCode: number): Promise<string | null> {
	// compras_material_item foi movida para compras_gov_integration (split de schemas);
	// o client default segue em sisub (compras_amostra + RPC upsert_compras_amostras ficam lá).
	const { data } = await supabase
		.schema("compras_gov_integration")
		.from("compras_material_item")
		.select("descricao_item")
		.eq("codigo_item", catmatCode)
		.single()
	return data?.descricao_item ?? null
}

// ─── Persistência da memória de cálculo ──────────────────────────────────────

interface PersistInput {
	quantityEstimateId: string
	options: OpcoesPesquisa
	items: QuantityEstimateItemPriceResult[]
	summary: {
		total: number
		withPrice: number
		withoutCatmat: number
		nonCompliant: number
	}
}

/**
 * Persiste o resultado completo da pesquisa de preços no banco de dados
 * para fins de auditoria (Lei 14.133/2021 + IN SEGES 65/2021).
 *
 * Falhas de persistência são logadas mas não interrompem o fluxo —
 * o resultado analítico é sempre retornado ao cliente mesmo se o audit trail falhar.
 *
 * @returns researchId — UUID da pesquisa salva, ou null em caso de falha
 */
async function persistResearch(supabase: Supabase, input: PersistInput): Promise<string | null> {
	try {
		const { quantityEstimateId, options, items, summary } = input

		// ── 0. Chave de idempotência ──────────────────────────────────────────
		// Mesmo anexo + mesmos parâmetros + mesmo dia ⇒ não duplica a memória de
		// cálculo. Dia incluído ⇒ re-pesquisa periódica cria histórico próprio.
		const paramsHash = createHash("sha256")
			.update(
				JSON.stringify({
					months: options.months ?? 12,
					similarityThreshold: options.similarityThreshold ?? 0.4,
					estado: options.estado ?? null,
					codigoUasg: options.codigoUasg ?? null,
					codigoMunicipio: options.codigoMunicipio ?? null,
				})
			)
			.digest("hex")
			.slice(0, 16)
		// Dia no fuso de Brasília (não UTC) — senão re-execuções entre 21h–24h BRT
		// cairiam em dias UTC distintos e gerariam registros duplicados.
		const day = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 10)
		const idempotencyKey = `quantity-estimate:v1:${quantityEstimateId}:${paramsHash}:${day}`

		// ── 1. Cabeçalho da pesquisa (ON CONFLICT DO NOTHING) ─────────────────
		const { data: inserted, error: errResearch } = await supabase
			.from("procurement_pesquisa_preco")
			.upsert(
				{
					quantity_estimate_id: quantityEstimateId,
					reference_method: "median",
					period_months: options.months ?? 12,
					similarity_threshold: options.similarityThreshold ?? 0.4,
					// Filtros: valores referenciam campos externos do Compras.gov.br
					filter_estado: options.estado ?? null,
					filter_uasg_code: options.codigoUasg ?? null,
					filter_municipio_code: options.codigoMunicipio ?? null,
					// Resumo interno
					total_items: summary.total,
					items_with_price: summary.withPrice,
					items_without_catmat: summary.withoutCatmat,
					non_compliant_items: summary.nonCompliant,
					idempotency_key: idempotencyKey,
				},
				{ onConflict: "idempotency_key", ignoreDuplicates: true }
			)
			.select("id")

		if (errResearch) {
			console.error("[price-research] Falha ao persistir cabeçalho:", errResearch.message)
			return null
		}

		// Conflito: pesquisa idêntica já foi persistida hoje — devolve a existente.
		if (!inserted || inserted.length === 0) {
			const { data: existing } = await supabase.from("procurement_pesquisa_preco").select("id").eq("idempotency_key", idempotencyKey).single()
			return existing?.id ?? null
		}

		const researchId = inserted[0].id

		// ── 2. Resultado por item + amostras ──────────────────────────────────
		for (const item of items) {
			const analysis = item.analysis

			const { data: researchItem, error: errItem } = await supabase
				.from("procurement_pesquisa_preco_item")
				.insert({
					research_id: researchId,
					quantity_estimate_item_id: item.quantityEstimateItemId,
					// Identificadores externos (catmat_* → nomes do catálogo)
					catmat_codigo: item.catmatCodigo ?? null,
					catmat_descricao: item.catmatDescricao ?? null,
					// Campo interno
					product_name: item.ingredientName,
					// Funil interno
					total_raw: analysis?.counts.raw ?? 0,
					total_after_date_filter: analysis?.counts.afterDateFilter ?? 0,
					total_after_pollution_filter: analysis?.counts.afterPollutionFilter ?? 0,
					total_after_outlier: analysis?.counts.afterOutlierRemoval ?? 0,
					// Estatísticas internas
					price_min: analysis?.statistics?.min ?? null,
					price_max: analysis?.statistics?.max ?? null,
					price_mean: analysis?.statistics?.mean ?? null,
					price_median: analysis?.statistics?.median ?? null,
					std_dev: analysis?.statistics?.stdDev ?? null,
					cv_pct: analysis?.statistics?.cv ?? null,
					unique_sources: analysis?.statistics?.uniqueSources ?? null,
					// Preço de referência interno
					reference_price: analysis?.referencePrice ?? null,
					reference_method: analysis ? "median" : null,
					measure_unit: analysis?.primaryMeasureUnit ?? null,
					// Conformidade interna
					is_compliant: analysis?.compliance.compliant ?? false,
					non_compliance_reasons: analysis?.compliance.nonComplianceReasons ?? [],
					// Erro
					error: item.error ?? null,
				})
				.select("id")
				.single()

			if (errItem || !researchItem) {
				console.error(`[price-research] Falha ao persistir item ${item.quantityEstimateItemId}:`, errItem?.message)
				continue
			}

			if (!analysis) continue

			// TODAS as amostras (válidas + outliers + poluição), em ordem.
			const classified = [
				...analysis.samples.map((a) => ({ a, type: "valid" as const })),
				...analysis.outliers.map((a) => ({ a, type: "outlier" as const })),
				...analysis.pollutionDiscards.map((a) => ({ a, type: "pollution" as const })),
			]

			if (classified.length === 0) continue

			// Upsert dos FATOS no catálogo deduplicado → ids alinhados à entrada.
			const factRows = classified.map(({ a }) => factPayload(a))
			const { data: amostraIds, error: errRpc } = await supabase.rpc("upsert_compras_amostras", { p_samples: factRows })

			if (errRpc || !amostraIds || amostraIds.length !== classified.length) {
				console.error(`[price-research] Falha no catálogo de amostras do item ${researchItem.id}:`, errRpc?.message ?? "contagem inesperada")
				continue
			}

			// Ponte por-pesquisa (em lotes; ON CONFLICT DO NOTHING).
			const bridge = classified.map(({ type, a }, i) => ({
				research_item_id: researchItem.id,
				amostra_id: amostraIds[i] as string,
				sample_type: type,
				similarity: a.similarity,
			}))

			const BATCH = 500
			for (let i = 0; i < bridge.length; i += BATCH) {
				const { error: errAmostras } = await supabase
					.from("procurement_pesquisa_preco_amostra")
					.upsert(bridge.slice(i, i + BATCH), { onConflict: "research_item_id,amostra_id", ignoreDuplicates: true })

				if (errAmostras) {
					console.error(`[price-research] Falha nas amostras do item ${researchItem.id} (lote ${i}):`, errAmostras.message)
				}
			}
		}

		return researchId
	} catch (err) {
		console.error("[price-research] Erro inesperado na persistência:", err)
		return null
	}
}

/**
 * Extrai os campos de FATO de uma AmostraPreco para o catálogo sisub.compras_amostra.
 * Os atributos por-pesquisa (sample_type, similarity) ficam de fora — vão na ponte.
 */
function factPayload(a: AmostraPreco) {
	return {
		// Campos externos (nomes originais do Compras.gov.br)
		id_compra: a.idCompra,
		id_item_compra: a.idItemCompra,
		descricao_item: a.descricaoItem,
		preco_unitario: a.precoUnitario,
		capacidade_unidade_fornecimento: a.capacidadeUnidadeFornecimento,
		sigla_unidade_fornecimento: a.siglaUnidadeFornecimento ?? null,
		sigla_unidade_medida: a.siglaUnidadeMedida ?? null,
		quantidade: a.quantidade ?? null,
		codigo_uasg: a.codigoUasg,
		nome_uasg: a.nomeUasg ?? null,
		municipio: a.municipio ?? null,
		estado: a.estado ?? null,
		esfera: a.esfera ?? null,
		marca: a.marca ?? null,
		// Campos internos derivados
		normalized_price: a.normalizedPrice,
		reference_date: a.referenceDate ? a.referenceDate.substring(0, 10) : null,
	}
}

// ─── Colunas de GET /research/:researchId ─────────────────────────────────────
// Colunas explícitas, não `*` (aqui e no select dos itens, na rota): a resposta é contrato da
// API e não pode mudar de forma só porque o banco ganhou ou perdeu coluna. No rename
// 20260927010000 e no 20260927040000 o `*` devolveria a coluna antiga e a nova juntas até o
// contract, e depois só a nova. Desde o 20260927040000 o campo é `quantity_estimate_id` (e, nos
// itens, `quantity_estimate_item_id`).

const RESEARCH_COLUMNS =
	"id, quantity_estimate_id, reference_method, period_months, similarity_threshold, filter_estado, filter_uasg_code, filter_municipio_code, total_items, items_with_price, items_without_catmat, non_compliant_items, created_at, idempotency_key, created_by"

// ─── Tipos do select aninhado de GET /research/:researchId ───────────────────
// O client Supabase não é tipado (schemas custom) — estes shapes descrevem só a
// estrutura que o achatamento manipula; o resto dos campos passa intacto.

/** Linha da ponte pesquisa↔amostra com o fato `amostra` aninhado. */
interface ResearchSampleRow {
	[key: string]: unknown
	amostra?: Record<string, unknown> | null
}

/** Linha de procurement_pesquisa_preco_item com as amostras aninhadas. */
interface ResearchItemRow {
	[key: string]: unknown
	samples?: ResearchSampleRow[] | null
}

/**
 * Executa a pesquisa de preços de todos os itens de um anexo quantitativo e PERSISTE a memória
 * de cálculo para fins de auditoria (Lei 14.133/2021, art. 23; IN SEGES/ME 65/2021).
 */
async function researchQuantityEstimate(c: Context, quantityEstimateId: string) {
	if (!quantityEstimateId) return c.json({ error: "quantityEstimateId inválido" }, 400)

	// Body é opcional — ausência/JSON inválido caem nos defaults (contrato anterior)
	const rawBody = await c.req.json().catch(() => ({}))
	const parsedBody = quantityEstimateBodySchema.safeParse(rawBody ?? {})
	if (!parsedBody.success) {
		return c.json({ error: `Body inválido: ${formatZodError(parsedBody.error)}` }, 400)
	}
	const options = buildOptions(parsedBody.data)

	const supabase = getSupabase()

	const { data: quantityEstimate, error: quantityEstimateError } = await supabase
		.from("quantity_estimate")
		.select("id")
		.eq("id", quantityEstimateId)
		.is("deleted_at", null)
		.single()

	if (quantityEstimateError || !quantityEstimate) return c.json({ error: "Anexo quantitativo não encontrado" }, 404)

	const { data: quantityEstimateItems, error: itemsError } = await supabase
		.from("quantity_estimate_item")
		.select("id, ingredient_id, ingredient_name, catmat_item_codigo, catmat_item_descricao")
		.eq("quantity_estimate_id", quantityEstimateId)

	if (itemsError || !quantityEstimateItems) return c.json({ error: "Erro ao buscar itens do anexo quantitativo" }, 500)

	// Deduplicar códigos CATMAT
	const catmatMap = new Map<number, string | null>()
	for (const item of quantityEstimateItems) {
		if (item.catmat_item_codigo != null && !catmatMap.has(item.catmat_item_codigo)) {
			catmatMap.set(item.catmat_item_codigo, item.catmat_item_descricao ?? null)
		}
	}

	// Pesquisar em paralelo (concorrência 3)
	const analysisMap = new Map<number, PriceAnalysis>()
	const errorMap = new Map<number, string>()
	const entries = [...catmatMap.entries()]
	const CONCURRENCY = 3

	for (let i = 0; i < entries.length; i += CONCURRENCY) {
		const batch = entries.slice(i, i + CONCURRENCY)
		await Promise.all(
			batch.map(async ([catmatCode, itemDescription]) => {
				try {
					const catmatDescricao = (await buscarDescricaoCatmat(supabase, catmatCode)) ?? itemDescription
					const rawItems = await consultarMaterialPrecos(catmatCode, {
						estado: options.estado,
						codigoUasg: options.codigoUasg,
						codigoMunicipio: options.codigoMunicipio,
					})
					analysisMap.set(catmatCode, analisarPrecos(catmatCode, catmatDescricao, rawItems, options))
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err)
					console.error(`[price-research] anexo ${quantityEstimateId} CATMAT ${catmatCode}: ${msg}`)
					errorMap.set(catmatCode, msg)
				}
			})
		)
		if (i + CONCURRENCY < entries.length) await new Promise((r) => setTimeout(r, 500))
	}

	// Mapear resultados para os itens do anexo
	const items: QuantityEstimateItemPriceResult[] = quantityEstimateItems.map((item) => {
		const catmat = item.catmat_item_codigo
		if (catmat == null) {
			return {
				quantityEstimateItemId: item.id,
				ingredientId: item.ingredient_id ?? null,
				ingredientName: item.ingredient_name,
				catmatCodigo: null,
				catmatDescricao: null,
				analysis: null,
				error: "Item sem código CATMAT vinculado — vincule o ingrediente a um item do catálogo CATMAT",
			}
		}
		return {
			quantityEstimateItemId: item.id,
			ingredientId: item.ingredient_id ?? null,
			ingredientName: item.ingredient_name,
			catmatCodigo: catmat,
			catmatDescricao: item.catmat_item_descricao ?? null,
			analysis: analysisMap.get(catmat) ?? null,
			error: errorMap.get(catmat) ?? null,
		}
	})

	const summary = {
		total: items.length,
		withPrice: items.filter((i) => i.analysis?.statistics != null).length,
		withoutCatmat: items.filter((i) => i.catmatCodigo == null).length,
		withoutData: items.filter((i) => i.catmatCodigo != null && i.analysis != null && i.analysis.statistics == null && i.error == null).length,
		withError: items.filter((i) => i.error != null && i.catmatCodigo != null).length,
		nonCompliant: items.filter((i) => i.analysis != null && !i.analysis.compliance.compliant).length,
	}

	// Persistir memória de cálculo (falha silenciosa)
	const researchId = await persistResearch(supabase, {
		quantityEstimateId,
		options,
		items,
		summary,
	})

	if (!researchId) {
		console.error(`[price-research] Memória de cálculo NÃO persistida para o anexo ${quantityEstimateId}`)
	}

	return c.json({ researchId, quantityEstimateId, consultedAt: new Date().toISOString(), items, summary })
}

/** Pesquisas já feitas para um anexo quantitativo (resumo, sem amostras). */
async function listQuantityEstimateResearches(c: Context, quantityEstimateId: string) {
	const supabase = getSupabase()

	const { data, error } = await supabase
		.from("procurement_pesquisa_preco")
		.select(`
      id,
      reference_method,
      period_months,
      similarity_threshold,
      filter_estado,
      filter_uasg_code,
      filter_municipio_code,
      total_items,
      items_with_price,
      items_without_catmat,
      non_compliant_items,
      created_at
    `)
		.eq("quantity_estimate_id", quantityEstimateId)
		.order("created_at", { ascending: false })

	if (error) return c.json({ error: "Erro ao buscar histórico de pesquisas" }, 500)

	return c.json({ quantityEstimateId, researches: data ?? [] })
}

export const priceResearchRoutes = new Hono()
	// Middleware: mesma proteção das rotas admin
	.use("*", async (c, next) => {
		const secret = c.req.header("x-admin-secret")
		if (!secureCompare(secret, env.ADMIN_SECRET)) {
			return c.json({ error: "Unauthorized" }, 401)
		}
		return next()
	})

	// ─── GET /material/:catmatCode ────────────────────────────────────────────────
	//
	// Consulta exploratória de preços para um único item CATMAT.
	// Não persiste — use o endpoint do anexo quantitativo para gerar audit trail.
	//
	// Query params: months (default 12) | estado | codigoUasg | codigoMunicipio | similarityThreshold

	.get("/material/:catmatCode", async (c) => {
		const catmatCode = Number(c.req.param("catmatCode"))
		if (!Number.isInteger(catmatCode) || catmatCode <= 0) {
			return c.json({ error: "Código CATMAT inválido" }, 400)
		}

		const parsedQuery = materialQuerySchema.safeParse(c.req.query())
		if (!parsedQuery.success) {
			return c.json({ error: `Query inválida: ${formatZodError(parsedQuery.error)}` }, 400)
		}
		const options = buildOptions(parsedQuery.data)

		const supabase = getSupabase()
		const catmatDescricao = await buscarDescricaoCatmat(supabase, catmatCode)

		try {
			const rawItems = await consultarMaterialPrecos(catmatCode, {
				estado: options.estado,
				codigoUasg: options.codigoUasg,
				codigoMunicipio: options.codigoMunicipio,
			})
			return c.json(analisarPrecos(catmatCode, catmatDescricao, rawItems, options))
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			console.error(`[price-research] CATMAT ${catmatCode}: ${message}`)
			return c.json({ error: `Falha ao consultar API Compras: ${message}` }, 502)
		}
	})

	// ─── POST /quantity-estimates/:quantityEstimateId ─────────────────────────────
	//
	// Executa a pesquisa de preços para todos os itens de um anexo quantitativo e PERSISTE
	// automaticamente a memória de cálculo para fins de auditoria.
	//
	// Body JSON (todos opcionais):
	//   { months?, estado?, codigoUasg?, codigoMunicipio?, similarityThreshold? }

	.post("/quantity-estimates/:quantityEstimateId", (c) => researchQuantityEstimate(c, c.req.param("quantityEstimateId")))

	// ─── GET /quantity-estimates/:quantityEstimateId/history ──────────────────────
	//
	// Lista todas as pesquisas realizadas para um anexo quantitativo (resumo, sem amostras).
	// Use GET /research/:researchId para o audit trail completo.

	.get("/quantity-estimates/:quantityEstimateId/history", (c) => listQuantityEstimateResearches(c, c.req.param("quantityEstimateId")))

	// ─── GET /research/:researchId ────────────────────────────────────────────────
	//
	// Audit trail completo: parâmetros + funil por item + TODAS as amostras
	// classificadas (válidas / outliers / poluição).

	.get("/research/:researchId", async (c) => {
		const researchId = c.req.param("researchId")
		const supabase = getSupabase()

		const { data: research, error: errResearch } = await supabase.from("procurement_pesquisa_preco").select(RESEARCH_COLUMNS).eq("id", researchId).single()

		if (errResearch || !research) return c.json({ error: "Pesquisa não encontrada" }, 404)

		// Os fatos da amostra vivem em compras_amostra; a ponte traz a classificação.
		const { data: items, error: errItems } = await supabase
			.from("procurement_pesquisa_preco_item")
			.select(`
      id, research_id, quantity_estimate_item_id, catmat_codigo, catmat_descricao, product_name, total_raw, total_after_date_filter, total_after_pollution_filter, total_after_outlier, price_min, price_max, price_mean, price_median, std_dev, cv_pct, unique_sources, reference_price, reference_method, measure_unit, is_compliant, non_compliance_reasons, error, created_at, justification_low_sample, justification_method, justification_outlier_criteria, justification_out_of_period, manual_selection,
      samples:procurement_pesquisa_preco_amostra (
        id,
        sample_type,
        similarity,
        amostra:compras_amostra (
          id_compra,
          id_item_compra,
          descricao_item,
          preco_unitario,
          normalized_price,
          capacidade_unidade_fornecimento,
          sigla_unidade_fornecimento,
          sigla_unidade_medida,
          quantidade,
          codigo_uasg,
          nome_uasg,
          municipio,
          estado,
          esfera,
          reference_date,
          marca
        )
      )
    `)
			.eq("research_id", researchId)
			.order("id")

		if (errItems) return c.json({ error: "Erro ao buscar itens da pesquisa" }, 500)

		// Achata a observação de compra de volta na amostra → preserva o contrato
		// JSON plano (id, sample_type, similarity + campos de fato).
		const flatItems = ((items ?? []) as unknown as ResearchItemRow[]).map(({ samples, ...rest }) => ({
			...rest,
			samples: (samples ?? []).map(({ amostra, ...sample }) => ({ ...sample, ...(amostra ?? {}) })),
		}))

		return c.json({ ...research, items: flatItems })
	})
