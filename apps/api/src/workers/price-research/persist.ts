/**
 * Persistência da memória de cálculo da pesquisa de preços do anexo quantitativo (rota admin
 * `POST /api/admin/price-research/quantity-estimates/:id`), para auditoria (Lei 14.133/2021,
 * art. 23; IN SEGES/ME 65/2021).
 *
 * Mora fora da rota para ser testável sem `env.ts`: o módulo da rota valida o ambiente na
 * carga, e o Bun roda todos os testes de `src/` no mesmo processo (ver `routes.auth.test.ts`).
 *
 * ## Idempotência: insert + 23505, não `upsert(onConflict)`
 *
 * O índice único da chave é PARCIAL (`uq_price_research_idempotency ... where idempotency_key
 * is not null`). O PostgREST gera `ON CONFLICT (idempotency_key)` sem o predicado, e o Postgres
 * não infere índice parcial como árbitro: responde 42P10 ("no unique or exclusion constraint
 * matching the ON CONFLICT specification") em TODA gravação, não só no reenvio. Era o que
 * acontecia aqui: a rota devolvia `researchId: null` e nada era gravado. O caminho do sisub
 * (`savePriceResearchAudit`, Drizzle) manda o `where` no `on conflict`; o PostgREST não tem
 * como. Por isso: `insert` simples e, em 23505, reler a linha pela chave.
 */

import { createHash } from "node:crypto"
import type { createClient } from "@supabase/supabase-js"
import type { PriceResearchOptions } from "./analyzer.ts"
import type { PriceSample, QuantityEstimateItemPriceResult } from "./types.ts"

// biome-ignore lint/suspicious/noExplicitAny: o client da rota não é tipado (schemas custom fora do `Database` gerado)
export type PriceResearchClient = ReturnType<typeof createClient<any, any, any>>

/** Código do Postgres para violação de unicidade — aqui, "esta pesquisa já foi gravada hoje". */
const UNIQUE_VIOLATION = "23505"

export interface PersistResearchInput {
	quantityEstimateId: string
	options: PriceResearchOptions
	items: QuantityEstimateItemPriceResult[]
	summary: {
		total: number
		withPrice: number
		withoutCatmat: number
		nonCompliant: number
	}
	/** Relógio injetável (teste). Define o dia da chave de idempotência. */
	now?: Date
}

/**
 * Chave de idempotência: mesmo anexo + mesmos parâmetros + mesmo dia ⇒ não duplica a memória
 * de cálculo. Dia incluído ⇒ re-pesquisa periódica cria histórico próprio.
 */
export function buildIdempotencyKey(quantityEstimateId: string, options: PriceResearchOptions, now: Date = new Date()): string {
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
	const day = now.toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 10)
	return `quantity-estimate:v1:${quantityEstimateId}:${paramsHash}:${day}`
}

/**
 * Grava o cabeçalho, ou acha o que já existe com a mesma chave.
 * `created: false` ⇒ reenvio: a memória de cálculo já está lá e não se regrava.
 */
async function claimResearchHeader(
	supabase: PriceResearchClient,
	row: Record<string, unknown> & { idempotency_key: string }
): Promise<{ id: string; created: boolean } | null> {
	const { data: inserted, error } = await supabase.from("price_research").insert(row).select("id").single()
	if (!error && inserted) return { id: inserted.id as string, created: true }

	if (error?.code !== UNIQUE_VIOLATION) {
		console.error("[price-research] Falha ao persistir cabeçalho:", error?.message ?? "nenhuma linha devolvida")
		return null
	}

	// Pesquisa idêntica já persistida hoje (reenvio ou corrida com outra requisição): segue com ela.
	const { data: existing, error: errExisting } = await supabase.from("price_research").select("id").eq("idempotency_key", row.idempotency_key).maybeSingle()
	if (errExisting || !existing) {
		console.error(
			"[price-research] Chave de idempotência em conflito, mas a pesquisa existente não foi relida:",
			errExisting?.message ?? "linha não encontrada"
		)
		return null
	}
	return { id: existing.id as string, created: false }
}

/**
 * Persiste o resultado completo da pesquisa de preços.
 *
 * Falhas de persistência são logadas mas não interrompem o fluxo —
 * o resultado analítico é sempre retornado ao cliente mesmo se o audit trail falhar.
 *
 * @returns researchId — UUID da pesquisa salva (ou da já existente com a mesma chave), ou null em caso de falha
 */
export async function persistResearch(supabase: PriceResearchClient, input: PersistResearchInput): Promise<string | null> {
	try {
		const { quantityEstimateId, options, items, summary } = input

		// ── 1. Cabeçalho da pesquisa (idempotente pela chave) ─────────────────
		const header = await claimResearchHeader(supabase, {
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
			idempotency_key: buildIdempotencyKey(quantityEstimateId, options, input.now),
		})

		if (!header) return null
		if (!header.created) return header.id

		const researchId = header.id

		// ── 2. Resultado por item + amostras ──────────────────────────────────
		for (const item of items) {
			const analysis = item.analysis

			const { data: researchItem, error: errItem } = await supabase
				.from("price_research_item")
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
			const { data: priceSampleIds, error: errRpc } = await supabase.rpc("upsert_price_samples", { p_samples: factRows })

			if (errRpc || !priceSampleIds || priceSampleIds.length !== classified.length) {
				console.error(`[price-research] Falha no catálogo de amostras do item ${researchItem.id}:`, errRpc?.message ?? "contagem inesperada")
				continue
			}

			// Ponte por-pesquisa (em lotes; ON CONFLICT DO NOTHING). O índice
			// `uq_price_research_sample_item_sample` é TOTAL, então o `onConflict` do PostgREST serve.
			const bridge = classified.map(({ type, a }, i) => ({
				research_item_id: researchItem.id,
				price_sample_id: priceSampleIds[i] as string,
				sample_type: type,
				similarity: a.similarity,
			}))

			const BATCH = 500
			for (let i = 0; i < bridge.length; i += BATCH) {
				const { error: errSamples } = await supabase
					.from("price_research_sample")
					.upsert(bridge.slice(i, i + BATCH), { onConflict: "research_item_id,price_sample_id", ignoreDuplicates: true })

				if (errSamples) {
					console.error(`[price-research] Falha nas amostras do item ${researchItem.id} (lote ${i}):`, errSamples.message)
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
 * Extrai os campos de FATO de uma PriceSample para o catálogo procurement.price_sample.
 * Os atributos por-pesquisa (sample_type, similarity) ficam de fora — vão na ponte.
 */
function factPayload(a: PriceSample) {
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
