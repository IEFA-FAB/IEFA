/**
 * @module price-research.fn
 * Price research against Compras.gov.br material price data with retry/backoff fetch and Supabase persistence.
 * @domain external
 * @migration n-a
 */

import { createHash } from "node:crypto"
import type { Json } from "@iefa/database"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { ComprasMaterialPricePage } from "@/types/domain/price-research"

const COMPRAS_BASE = "https://dadosabertos.compras.gov.br"
const TIMEOUT_MS = 30_000
const MAX_RETRIES = 3

async function fetchCompras(url: string): Promise<Response> {
	let lastErr: unknown
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		try {
			if (attempt > 0) {
				await new Promise((r) => setTimeout(r, (2 ** attempt - 1) * 1_000))
			}
			const res = await fetch(url, {
				signal: AbortSignal.timeout(TIMEOUT_MS),
				headers: { accept: "application/json" },
			})
			if (!res.ok) throw new Error(`HTTP ${res.status} ao consultar Compras.gov.br`)
			return res
		} catch (err) {
			lastErr = err
		}
	}
	throw lastErr
}

export const searchMaterialPricesFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			codigoItemCatalogo: z.number().int().positive(),
			pagina: z.number().int().min(1).default(1),
			tamanhoPagina: z.number().int().min(1).max(500).default(20),
			estado: z.string().optional(),
		})
	)
	.handler(async ({ data }): Promise<ComprasMaterialPricePage> => {
		const params = new URLSearchParams({
			pagina: String(data.pagina),
			tamanhoPagina: String(data.tamanhoPagina),
			codigoItemCatalogo: String(data.codigoItemCatalogo),
		})
		if (data.estado) params.set("estado", data.estado)

		const url = `${COMPRAS_BASE}/modulo-pesquisa-preco/1_consultarMaterial?${params}`
		const res = await fetchCompras(url)
		return (await res.json()) as ComprasMaterialPricePage
	})

// ─── Schema de amostra (subconjunto de ComprasMaterialPriceResult) ────────────

const SampleSchema = z.object({
	idCompra: z.string(),
	idItemCompra: z.number(),
	descricaoItem: z.string().nullable().optional(),
	precoUnitario: z.number().nullable().optional(),
	capacidadeUnidadeFornecimento: z.number().nullable().optional(),
	siglaUnidadeFornecimento: z.string().nullable().optional(),
	siglaUnidadeMedida: z.string().nullable().optional(),
	quantidade: z.number().nullable().optional(),
	codigoUasg: z.string().nullable().optional(),
	nomeUasg: z.string().nullable().optional(),
	municipio: z.string().nullable().optional(),
	estado: z.string().nullable().optional(),
	marca: z.string().nullable().optional(),
	dataCompra: z.string().nullable().optional(),
	dataResultado: z.string().nullable().optional(),
})

// ─── Salvar memória de cálculo para auditoria (Lei 14.133/2021) ───────────────

export const savePrecoAuditFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			catmatCodigo: z.number().int().positive(),
			catmatDescricao: z.string().nullable().optional(),
			method: z.enum(["mean", "median"]),
			referencePrice: z.number(),
			stats: z.object({
				mean: z.number(),
				median: z.number(),
				stdDev: z.number(),
				cv: z.number(),
				min: z.number(),
				max: z.number(),
				uniqueSources: z.number().int(),
			}),
			rawCount: z.number().int(),
			validCount: z.number().int(),
			outlierCount: z.number().int(),
			validSamples: z.array(SampleSchema),
			outlierSamples: z.array(SampleSchema),
			// Se fornecidos, linka imediatamente (caso ATA já existente)
			ataId: z.string().uuid().optional(),
			ataItemId: z.string().uuid().optional(),
		})
	)
	.handler(async ({ data }): Promise<{ researchId: string; researchItemId: string }> => {
		const supabase = getSupabaseServerClient()

		// 0. Chave de idempotência — evita gravar a MESMA memória de cálculo duas
		// vezes (re-clique em "Usar", re-execução do bulk). Escopo: item/CATMAT +
		// método + dia + conjunto exato de amostras. Seleção diferente ⇒ chave
		// diferente ⇒ novo registro (refino legítimo preservado). Dia incluído ⇒
		// re-pesquisa periódica cria histórico (Lei 14.133/2021, Art. 23).
		const sampleFingerprint = createHash("sha256")
			.update(
				[...data.validSamples.map((s) => `v:${s.idCompra}:${s.idItemCompra}`), ...data.outlierSamples.map((s) => `o:${s.idCompra}:${s.idItemCompra}`)]
					.sort()
					.join("|")
			)
			.digest("hex")
			.slice(0, 16)
		const scope = data.ataItemId ?? `catmat-${data.catmatCodigo}`
		// Dia no fuso de Brasília (não UTC) — senão re-execuções entre 21h–24h BRT
		// cairiam em dias UTC distintos e gerariam registros duplicados.
		const day = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 10)
		const idempotencyKey = `audit:v1:${scope}:${data.method}:${day}:${sampleFingerprint}`

		// 1. Cabeçalho da pesquisa (ON CONFLICT DO NOTHING via idempotency_key)
		const { data: inserted, error: researchErr } = await supabase
			.schema("sisub")
			.from("procurement_pesquisa_preco")
			.upsert(
				{
					ata_id: data.ataId ?? null,
					reference_method: data.method,
					total_items: 1,
					items_with_price: data.validCount > 0 ? 1 : 0,
					items_without_catmat: 0,
					non_compliant_items: 0,
					idempotency_key: idempotencyKey,
				},
				{ onConflict: "idempotency_key", ignoreDuplicates: true }
			)
			.select("id")
		if (researchErr) throw new Error(`Erro ao salvar pesquisa: ${researchErr.message}`)

		// Conflito: pesquisa idêntica já existe hoje — devolve a existente sem duplicar.
		if (!inserted || inserted.length === 0) {
			const { data: existing, error: existingErr } = await supabase
				.schema("sisub")
				.from("procurement_pesquisa_preco")
				.select("id, procurement_pesquisa_preco_item(id)")
				.eq("idempotency_key", idempotencyKey)
				.single()
			if (existingErr || !existing) throw new Error(`Erro ao recuperar pesquisa idempotente: ${existingErr?.message}`)
			const existingItemId = existing.procurement_pesquisa_preco_item?.[0]?.id
			if (!existingItemId) throw new Error("Pesquisa idempotente sem item associado")
			return { researchId: existing.id, researchItemId: existingItemId }
		}
		const research = inserted[0]

		// 2. Item da pesquisa (um por ingredient/catmat consultado)
		const { data: researchItem, error: itemErr } = await supabase
			.schema("sisub")
			.from("procurement_pesquisa_preco_item")
			.insert({
				research_id: research.id,
				ata_item_id: data.ataItemId ?? null,
				catmat_codigo: data.catmatCodigo,
				catmat_descricao: data.catmatDescricao ?? null,
				product_name: data.catmatDescricao ?? String(data.catmatCodigo),
				total_raw: data.rawCount,
				total_after_date_filter: data.rawCount,
				total_after_pollution_filter: data.rawCount,
				total_after_outlier: data.validCount,
				price_min: data.stats.min,
				price_max: data.stats.max,
				price_mean: data.stats.mean,
				price_median: data.stats.median,
				std_dev: data.stats.stdDev,
				cv_pct: data.stats.cv,
				unique_sources: data.stats.uniqueSources,
				reference_price: data.referencePrice,
				reference_method: data.method,
				is_compliant: data.validCount >= 3 && data.stats.uniqueSources >= 3,
				non_compliance_reasons: [
					...(data.validCount < 3 ? ["Menos de 3 amostras válidas"] : []),
					...(data.stats.uniqueSources < 3 ? ["Menos de 3 UASGs distintas"] : []),
				],
			})
			.select("id")
			.single()
		if (itemErr) throw new Error(`Erro ao salvar item da pesquisa: ${itemErr.message}`)

		// 3. Amostras individuais — separa FATO (catálogo deduplicado) de
		// PARTICIPAÇÃO (ponte por-pesquisa). Os fatos da compra pública vão para
		// sisub.compras_amostra via RPC idempotente (dedup por fingerprint de
		// conteúdo); aqui guardamos só a classificação.
		const classified = [
			...data.validSamples.map((s) => ({ sample: s, type: "valid" as const })),
			...data.outlierSamples.map((s) => ({ sample: s, type: "outlier" as const })),
		]

		if (classified.length > 0) {
			const factRows = classified.map(({ sample }) => {
				const cap = sample.capacidadeUnidadeFornecimento ?? 1
				const preco = sample.precoUnitario ?? null
				return {
					id_compra: sample.idCompra,
					id_item_compra: sample.idItemCompra,
					descricao_item: sample.descricaoItem ?? null,
					preco_unitario: preco,
					capacidade_unidade_fornecimento: sample.capacidadeUnidadeFornecimento ?? null,
					sigla_unidade_fornecimento: sample.siglaUnidadeFornecimento ?? null,
					sigla_unidade_medida: sample.siglaUnidadeMedida ?? null,
					quantidade: sample.quantidade ?? null,
					codigo_uasg: sample.codigoUasg ?? null,
					nome_uasg: sample.nomeUasg ?? null,
					municipio: sample.municipio ?? null,
					estado: sample.estado ?? null,
					esfera: null,
					marca: sample.marca ?? null,
					normalized_price: preco !== null && cap > 0 ? preco / cap : preco,
					reference_date: sample.dataResultado ?? sample.dataCompra ?? null,
				}
			})

			// Upsert no catálogo → ids alinhados à ordem de entrada.
			const { data: amostraIds, error: rpcErr } = await supabase.schema("sisub").rpc("upsert_compras_amostras", { p_samples: factRows as unknown as Json })
			if (rpcErr) throw new Error(`Erro ao salvar observações de compra: ${rpcErr.message}`)
			if (!amostraIds || amostraIds.length !== classified.length) {
				throw new Error("Catálogo de amostras retornou contagem inesperada")
			}

			const bridge = classified.map(({ type }, i) => ({
				research_item_id: researchItem.id,
				amostra_id: amostraIds[i],
				sample_type: type,
				similarity: null,
			}))

			const { error: bridgeErr } = await supabase
				.schema("sisub")
				.from("procurement_pesquisa_preco_amostra")
				.upsert(bridge, { onConflict: "research_item_id,amostra_id", ignoreDuplicates: true })
			if (bridgeErr) throw new Error(`Erro ao salvar amostras: ${bridgeErr.message}`)
		}

		return { researchId: research.id, researchItemId: researchItem.id }
	})
