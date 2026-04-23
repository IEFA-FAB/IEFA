import { createClient } from "@supabase/supabase-js"
import { Hono } from "hono"
import { env } from "../../env.ts"
import { analisarPrecos, type OpcoesPesquisa } from "../../workers/pesquisa-preco/analyzer.ts"
import { consultarMaterialPrecos } from "../../workers/pesquisa-preco/client.ts"
import type { AmostraPreco, AtaItemPriceResult, PriceAnalysis } from "../../workers/pesquisa-preco/types.ts"

function getSupabase() {
	return createClient(env.API_SUPABASE_URL, env.API_SUPABASE_SERVICE_ROLE_KEY, {
		db: { schema: "sisub" },
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
	const { data } = await supabase.from("compras_material_item").select("descricao_item").eq("codigo_item", catmatCode).single()
	return data?.descricao_item ?? null
}

// ─── Persistência da memória de cálculo ──────────────────────────────────────

interface PersistInput {
	ataId: string
	options: OpcoesPesquisa
	items: AtaItemPriceResult[]
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
		const { ataId, options, items, summary } = input

		// ── 1. Cabeçalho da pesquisa ──────────────────────────────────────────
		const { data: research, error: errResearch } = await supabase
			.from("procurement_pesquisa_preco")
			.insert({
				ata_id: ataId,
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
			})
			.select("id")
			.single()

		if (errResearch || !research) {
			console.error("[price-research] Falha ao persistir cabeçalho:", errResearch?.message)
			return null
		}

		const researchId = research.id

		// ── 2. Resultado por item + amostras ──────────────────────────────────
		for (const item of items) {
			const analysis = item.analysis

			const { data: researchItem, error: errItem } = await supabase
				.from("procurement_pesquisa_preco_item")
				.insert({
					research_id: researchId,
					ata_item_id: item.ataItemId,
					// Identificadores externos (catmat_* → nomes do catálogo)
					catmat_codigo: item.catmatCodigo ?? null,
					catmat_descricao: item.catmatDescricao ?? null,
					// Campo interno
					product_name: item.productName,
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
				console.error(`[price-research] Falha ao persistir item ${item.ataItemId}:`, errItem?.message)
				continue
			}

			if (!analysis) continue

			// Serializar TODAS as amostras (válidas + outliers + poluição)
			const toInsert = [
				...analysis.samples.map((a) => serializeAmostra(a, researchItem.id, "valid")),
				...analysis.outliers.map((a) => serializeAmostra(a, researchItem.id, "outlier")),
				...analysis.pollutionDiscards.map((a) => serializeAmostra(a, researchItem.id, "pollution")),
			]

			if (toInsert.length === 0) continue

			// Inserir em lotes de 500
			const BATCH = 500
			for (let i = 0; i < toInsert.length; i += BATCH) {
				const { error: errAmostras } = await supabase.from("procurement_pesquisa_preco_amostra").insert(toInsert.slice(i, i + BATCH))

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
 * Converte uma AmostraPreco para inserção na tabela de amostras.
 * Campos externos (nomes do Compras.gov.br) e internos (inglês) ficam separados.
 */
function serializeAmostra(a: AmostraPreco, researchItemId: string, sampleType: "valid" | "outlier" | "pollution") {
	return {
		research_item_id: researchItemId,
		// Campo interno
		sample_type: sampleType,
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
		// Campos internos
		normalized_price: a.normalizedPrice,
		reference_date: a.referenceDate ? a.referenceDate.substring(0, 10) : null,
		similarity: a.similarity,
	}
}

export const priceResearchRoutes = new Hono()
	// Middleware: mesma proteção das rotas admin
	.use("*", async (c, next) => {
		const secret = c.req.header("x-admin-secret")
		if (!secret || secret !== env.ADMIN_SECRET) {
			return c.json({ error: "Unauthorized" }, 401)
		}
		return next()
	})

	// ─── GET /material/:catmatCode ────────────────────────────────────────────────
	//
	// Consulta exploratória de preços para um único item CATMAT.
	// Não persiste — use o endpoint da ATA para gerar audit trail.
	//
	// Query params: months (default 12) | estado | codigoUasg | codigoMunicipio | similarityThreshold

	.get("/material/:catmatCode", async (c) => {
		const catmatCode = Number(c.req.param("catmatCode"))
		if (!Number.isInteger(catmatCode) || catmatCode <= 0) {
			return c.json({ error: "Código CATMAT inválido" }, 400)
		}

		const q = c.req.query() as Record<string, string>
		const options: OpcoesPesquisa = {
			months: Math.min(Math.max(parseInt(q.months ?? "12", 10) || 12, 1), 24),
			similarityThreshold: Math.min(Math.max(parseFloat(q.similarityThreshold ?? "0.4") || 0.4, 0), 1),
			...(q.estado ? { estado: q.estado.toUpperCase() } : {}),
			...(q.codigoUasg ? { codigoUasg: q.codigoUasg } : {}),
			...(q.codigoMunicipio ? { codigoMunicipio: Number(q.codigoMunicipio) } : {}),
		}

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

	// ─── POST /ata/:ataId ─────────────────────────────────────────────────────────
	//
	// Executa pesquisa de preços para todos os itens de uma ATA e PERSISTE
	// automaticamente a memória de cálculo para fins de auditoria.
	//
	// Body JSON (todos opcionais):
	//   { months?, estado?, codigoUasg?, codigoMunicipio?, similarityThreshold? }

	.post("/ata/:ataId", async (c) => {
		const ataId = c.req.param("ataId")
		if (!ataId) return c.json({ error: "ataId inválido" }, 400)

		const body = (await c.req.json().catch(() => ({}))) as {
			months?: number
			estado?: string
			codigoUasg?: string
			codigoMunicipio?: number
			similarityThreshold?: number
		}

		const options: OpcoesPesquisa = {
			months: Math.min(Math.max(body.months ?? 12, 1), 24),
			similarityThreshold: Math.min(Math.max(body.similarityThreshold ?? 0.4, 0), 1),
			...(body.estado ? { estado: body.estado.toUpperCase() } : {}),
			...(body.codigoUasg ? { codigoUasg: body.codigoUasg } : {}),
			...(body.codigoMunicipio ? { codigoMunicipio: body.codigoMunicipio } : {}),
		}

		const supabase = getSupabase()

		const { data: ata, error: ataError } = await supabase.from("procurement_ata").select("id").eq("id", ataId).is("deleted_at", null).single()

		if (ataError || !ata) return c.json({ error: "ATA não encontrada" }, 404)

		const { data: ataItems, error: itemsError } = await supabase
			.from("procurement_ata_item")
			.select("id, product_id, product_name, catmat_item_codigo, catmat_item_descricao")
			.eq("ata_id", ataId)

		if (itemsError || !ataItems) return c.json({ error: "Erro ao buscar itens da ATA" }, 500)

		// Deduplicar códigos CATMAT
		const catmatMap = new Map<number, string | null>()
		for (const item of ataItems) {
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
				batch.map(async ([catmatCode, descricaoAta]) => {
					try {
						const catmatDescricao = (await buscarDescricaoCatmat(supabase, catmatCode)) ?? descricaoAta
						const rawItems = await consultarMaterialPrecos(catmatCode, {
							estado: options.estado,
							codigoUasg: options.codigoUasg,
							codigoMunicipio: options.codigoMunicipio,
						})
						analysisMap.set(catmatCode, analisarPrecos(catmatCode, catmatDescricao, rawItems, options))
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err)
						console.error(`[price-research] ATA ${ataId} CATMAT ${catmatCode}: ${msg}`)
						errorMap.set(catmatCode, msg)
					}
				})
			)
			if (i + CONCURRENCY < entries.length) await new Promise((r) => setTimeout(r, 500))
		}

		// Mapear resultados para os itens da ATA
		const items: AtaItemPriceResult[] = ataItems.map((item) => {
			const catmat = item.catmat_item_codigo
			if (catmat == null) {
				return {
					ataItemId: item.id,
					productId: item.product_id ?? null,
					productName: item.product_name,
					catmatCodigo: null,
					catmatDescricao: null,
					analysis: null,
					error: "Item sem código CATMAT vinculado — vincule o produto a um item do catálogo CATMAT",
				}
			}
			return {
				ataItemId: item.id,
				productId: item.product_id ?? null,
				productName: item.product_name,
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
			ataId,
			options,
			items,
			summary,
		})

		if (!researchId) {
			console.error(`[price-research] Memória de cálculo NÃO persistida para ATA ${ataId}`)
		}

		return c.json({ researchId, ataId, consultedAt: new Date().toISOString(), items, summary })
	})

	// ─── GET /ata/:ataId/history ──────────────────────────────────────────────────
	//
	// Lista todas as pesquisas realizadas para uma ATA (resumo, sem amostras).
	// Use GET /research/:researchId para o audit trail completo.

	.get("/ata/:ataId/history", async (c) => {
		const ataId = c.req.param("ataId")
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
			.eq("ata_id", ataId)
			.order("created_at", { ascending: false })

		if (error) return c.json({ error: "Erro ao buscar histórico de pesquisas" }, 500)

		return c.json({ ataId, researches: data ?? [] })
	})

	// ─── GET /research/:researchId ────────────────────────────────────────────────
	//
	// Audit trail completo: parâmetros + funil por item + TODAS as amostras
	// classificadas (válidas / outliers / poluição).

	.get("/research/:researchId", async (c) => {
		const researchId = c.req.param("researchId")
		const supabase = getSupabase()

		const { data: research, error: errResearch } = await supabase.from("procurement_pesquisa_preco").select("*").eq("id", researchId).single()

		if (errResearch || !research) return c.json({ error: "Pesquisa não encontrada" }, 404)

		const { data: items, error: errItems } = await supabase
			.from("procurement_pesquisa_preco_item")
			.select(`
      *,
      samples:procurement_pesquisa_preco_amostra (
        id,
        sample_type,
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
        marca,
        similarity
      )
    `)
			.eq("research_id", researchId)
			.order("id")

		if (errItems) return c.json({ error: "Erro ao buscar itens da pesquisa" }, 500)

		return c.json({ ...research, items: items ?? [] })
	})
