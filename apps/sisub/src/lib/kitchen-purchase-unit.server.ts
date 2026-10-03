/**
 * Unidade COMPRADORA de uma cozinha: é o CNPJ dela que vem na NF-e, e é nela que o empenho e a
 * designação moram. A regra (`purchase_unit_id`, senão `unit_id`) é a de `resolvePurchaseUnitId`;
 * aqui fica só a leitura, que LANÇA no erro: devolver `null` numa falha transitória virava
 * "cozinha sem unidade de compra" e recusava o que era só uma leitura que falhou.
 */

import { resolvePurchaseUnitId } from "@iefa/sisub-domain"
import { getServerClient } from "@/lib/supabase.server"
import { publicDbMessage } from "./db-error-message"

export async function purchaseUnitIdOfKitchen(kitchenId: number): Promise<number | null> {
	const { data: row, error } = await getServerClient("kitchen").from("kitchen").select("unit_id, purchase_unit_id").eq("id", kitchenId).maybeSingle()
	if (error) throw new Error(`Erro ao carregar a cozinha: ${publicDbMessage(error)}`)
	return resolvePurchaseUnitId({ unitId: row?.unit_id ?? null, purchaseUnitId: row?.purchase_unit_id ?? null })
}
