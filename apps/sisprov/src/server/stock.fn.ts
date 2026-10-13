/**
 * @module stock.fn
 * Estoque do SISPROV: os locais que o grant `storage` do usuário alcança. O estoque é um só, de
 * toda classe (`inventory`); esta é a lente do SISPROV, e o sisub é a do rancho
 * (`openspec/changes/sisprov-foundation`, D3 e D14).
 *
 * Quem enxerga qual local é a mesma regra das operações (`requireStockLocation` do domínio):
 * global, a cozinha do local, ou uma OM que cubra a do local pela hierarquia de apoio, com o
 * deny vencendo. A lista não é um filtro de tela: é a regra que o servidor aplica.
 */

import { fetchUnitSupportGraph } from "@iefa/pbac"
import { PermissionDeniedError, requireStockLocation } from "@iefa/sisprov-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireStock } from "@/lib/auth.server"
import { getCoreReadClient, getInventoryClient } from "@/lib/supabase.server"

export type StockLocationTier = "central_depot" | "unit_storeroom" | "kitchen"

export type StockLocationView = {
	id: number
	name: string
	tier: StockLocationTier
	unitId: number
	unitCode: string
	kitchenId: number | null
	supplyClasses: string[]
}

export const listMyStockLocationsFn = createServerFn({ method: "GET" }).handler(async (): Promise<StockLocationView[]> => {
	const ctx = await requireStock(1)
	const core = getCoreReadClient()
	const graph = await fetchUnitSupportGraph(core)

	const { data: locations, error } = await getInventoryClient()
		.from("stock_location")
		.select("id, name, tier, unit_id, kitchen_id, supply_classes")
		.is("deleted_at", null)
		.order("unit_id")
		.order("name")
	if (error) throw new Error(`Erro ao ler os locais de estoque: ${error.message}`)

	const reachable = (locations ?? []).filter((location) => {
		try {
			requireStockLocation(ctx, 1, { id: location.id, unitId: location.unit_id, kitchenId: location.kitchen_id }, graph)
			return true
		} catch (denied) {
			if (denied instanceof PermissionDeniedError) return false
			throw denied
		}
	})
	if (reachable.length === 0) return []

	const unitIds = [...new Set(reachable.map((location) => location.unit_id))]
	const { data: units, error: unitsError } = await core.from("units").select("id, code").in("id", unitIds)
	if (unitsError) throw new Error(`Erro ao ler as OMs dos locais: ${unitsError.message}`)
	const codeOf = new Map((units ?? []).map((unit) => [unit.id, unit.code]))

	return reachable.map((location) => ({
		id: location.id,
		name: location.name,
		tier: location.tier as StockLocationTier,
		unitId: location.unit_id,
		unitCode: codeOf.get(location.unit_id) ?? `OM ${location.unit_id}`,
		kitchenId: location.kitchen_id,
		supplyClasses: location.supply_classes,
	}))
})
