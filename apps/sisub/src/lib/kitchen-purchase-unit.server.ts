/**
 * Unidade COMPRADORA de uma cozinha: é o CNPJ dela que vem na NF-e, e é nela que o empenho e a
 * designação moram. A regra (`purchase_unit_id`, senão `unit_id`) é a de `resolvePurchaseUnitId`;
 * aqui fica só a leitura, que LANÇA no erro: devolver `null` numa falha transitória virava
 * "cozinha sem unidade de compra" e recusava o que era só uma leitura que falhou.
 */

import { resolvePurchaseUnitId } from "@iefa/sisub-domain"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: leitura enxuta da cozinha, sem depender dos tipos gerados deste client
type LooseClient = { from: (table: string) => any }

export async function purchaseUnitIdOfKitchen(kitchenId: number): Promise<number | null> {
	const { data: row, error } = await (getServerClient("kitchen") as unknown as LooseClient)
		.from("kitchen")
		.select("unit_id, purchase_unit_id")
		.eq("id", kitchenId)
		.maybeSingle()
	if (error) throw new Error(`Erro ao carregar a cozinha: ${error.message}`)
	return resolvePurchaseUnitId({ unitId: row?.unit_id ?? null, purchaseUnitId: row?.purchase_unit_id ?? null })
}
