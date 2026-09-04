/**
 * @module review-queues.fn
 * Filas de revisão do catálogo: unidades de medida fora do catálogo canônico,
 * barcodes que não migraram para GTIN e itens de compra sem acondicionamento
 * declarado. Leitura das views core.v_measure_unit_review,
 * gs1_integration.v_barcode_review e
 * procurement.v_purchase_item_conditioning_review.
 * CLIENT: getServerClient (service role). AUTH: `global` nível 1 (leitura).
 * @domain kitchen
 * @migration 20260728120000_core_measure_unit, 20260728121000_gs1_gtin_catalog, 20260901120100_purchase_item_conditioning
 */

import { createServerFn } from "@tanstack/react-start"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: views novas ainda fora dos tipos gerados (regen na task 2.4)
type LooseClient = { from: (table: string) => any }

export interface MeasureUnitReviewRow {
	source_table: string
	source_id: string
	source_description: string
	raw_value: string
}

export interface BarcodeReviewRow {
	ingredient_item_id: string
	description: string
	raw_barcode: string
	ingredient_id: string | null
}

/** Unidades de medida fora do catálogo canônico — bloqueiam movimento de estoque do item. */
export const fetchMeasureUnitReviewFn = createServerFn({ method: "GET" }).handler(async (): Promise<MeasureUnitReviewRow[]> => {
	await requireAuthWithPermission("global", 1)
	const core = getServerClient("core") as unknown as LooseClient
	const { data, error } = await core.from("v_measure_unit_review").select("*").order("source_table").limit(500)
	if (error) throw new Error(`Erro ao buscar fila de unidades: ${error.message}`)
	return (data ?? []) as MeasureUnitReviewRow[]
})

/** Barcodes legados que não viraram GTIN (check digit inválido ou colisão). */
export const fetchBarcodeReviewFn = createServerFn({ method: "GET" }).handler(async (): Promise<BarcodeReviewRow[]> => {
	await requireAuthWithPermission("global", 1)
	const gs1 = getServerClient("gs1_integration") as unknown as LooseClient
	const { data, error } = await gs1.from("v_barcode_review").select("*").order("description").limit(500)
	if (error) throw new Error(`Erro ao buscar fila de barcodes: ${error.message}`)
	return (data ?? []) as BarcodeReviewRow[]
})

export interface ConditioningReviewRow {
	purchase_item_id: string
	description: string
	catmat_item_codigo: number | null
	delivery_conditioning: string | null
	conservation_class: string | null
	pendencia: "sem_classe" | "sem_faixa_de_temperatura"
	pista_catmat: string | null
	itens_vinculados: number
}

/**
 * Itens de compra sem conservação declarada, ou perecíveis sem faixa de
 * temperatura. Ordenada por `itens_vinculados` DESC de propósito: classificar a
 * especificação que serve 50 insumos vale 50 vezes mais que a que serve 1.
 */
export const fetchConditioningReviewFn = createServerFn({ method: "GET" }).handler(async (): Promise<ConditioningReviewRow[]> => {
	await requireAuthWithPermission("global", 1)
	const procurement = getServerClient("procurement") as unknown as LooseClient
	const { data, error } = await procurement.from("v_purchase_item_conditioning_review").select("*").order("itens_vinculados", { ascending: false }).limit(500)
	if (error) throw new Error(`Erro ao buscar fila de acondicionamento: ${error.message}`)
	return (data ?? []) as ConditioningReviewRow[]
})
