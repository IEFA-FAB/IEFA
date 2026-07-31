/**
 * @module review-queues.fn
 * Filas de revisão do catálogo (Fases 2a/2b do change sisub-inventory-cycle):
 * unidades de medida fora do catálogo canônico e barcodes que não migraram
 * para GTIN. Leitura das views core.v_measure_unit_review e
 * gs1_integration.v_barcode_review.
 * CLIENT: getServerClient (service role). AUTH: `global` nível 1 (leitura).
 * @domain kitchen
 * @migration 20260728120000_core_measure_unit, 20260728121000_gs1_gtin_catalog
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
