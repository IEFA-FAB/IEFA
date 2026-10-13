/**
 * @module stock.fn
 * Estoque do SISPROV: os locais que o grant `storage` alcança, o detalhe de cada um e a
 * configuração (nível, abastecedor, recebe direto, GLN, endereçamento). O estoque é um só, de
 * toda classe (`inventory`); esta é a lente do SISPROV, e o sisub é a da cozinha
 * (`openspec/changes/sisprov-foundation`, D3, D14 e D17).
 *
 * Quem enxerga qual local é a mesma regra das operações (`requireStockLocation` do domínio).
 * Criar local é da SDAB (`sisprov-admin` 2, na cobertura dela); configurar é do gestor do local
 * (`storage` 3) ou da SDAB. A escrita confere a versão que a tela viu (`updated_at`), no servidor.
 */

import { fetchUnitSupportGraph, hasPermission } from "@iefa/pbac"
import { PermissionDeniedError, requireSisprovAdmin as requireSisprovAdminFor, requireStockLocation, SISPROV_ADMIN_MODULE } from "@iefa/sisprov-domain"
import { type StockLevel, stockLocationSettingsSchema } from "@iefa/sisprov-domain/inventory"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireSisprovAdmin, requireStock } from "@/lib/auth.server"
import { readStockLocation, requireStockAt, type StockLocationRow, stockDbMessage } from "@/lib/stock-auth.server"
import { getCoreReadClient, getInventoryClient } from "@/lib/supabase.server"

export type StockLocationView = {
	id: number
	name: string
	level: StockLevel
	unitId: number
	unitCode: string
	kitchenId: number | null
	supplyClasses: string[]
	suppliedById: number | null
	suppliedByName: string | null
	receivesDirect: boolean
	gln: string | null
	usesPositions: boolean
	updatedAt: string
}

const SUPPLY_CLASSES = ["alimentacao", "auxiliar", "permanente", "fardamento"] as const

async function toViews(rows: readonly StockLocationRow[]): Promise<StockLocationView[]> {
	if (rows.length === 0) return []
	const unitIds = [...new Set(rows.map((row) => row.unit_id))]
	const { data: units, error: unitsError } = await getCoreReadClient().from("units").select("id, code").in("id", unitIds)
	if (unitsError) throw new Error(`Erro ao ler as OMs dos locais: ${unitsError.message}`)
	const codeOf = new Map((units ?? []).map((unit) => [unit.id, unit.code]))

	const supplierIds = [...new Set(rows.map((row) => row.supplied_by_location_id).filter((id): id is number => id !== null))]
	const supplierName = new Map<number, string>()
	if (supplierIds.length > 0) {
		const { data: suppliers, error } = await getInventoryClient().from("stock_location").select("id, name").in("id", supplierIds)
		if (error) throw new Error(`Erro ao ler os abastecedores: ${error.message}`)
		for (const supplier of suppliers ?? []) supplierName.set(supplier.id, supplier.name)
	}

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		level: row.level as StockLevel,
		unitId: row.unit_id,
		unitCode: codeOf.get(row.unit_id) ?? `OM ${row.unit_id}`,
		kitchenId: row.kitchen_id,
		supplyClasses: row.supply_classes,
		suppliedById: row.supplied_by_location_id,
		suppliedByName: row.supplied_by_location_id === null ? null : (supplierName.get(row.supplied_by_location_id) ?? null),
		receivesDirect: row.receives_direct,
		gln: row.gln,
		usesPositions: row.uses_positions,
		updatedAt: row.updated_at,
	}))
}

/** A SDAB administra este local? `sisprov-admin` 2 global, ou escopado numa OM que cobre a do local. */
function administersUnit(ctx: Parameters<typeof requireSisprovAdminFor>[0], unitId: number, graph: Awaited<ReturnType<typeof fetchUnitSupportGraph>>): boolean {
	try {
		requireSisprovAdminFor(ctx, 2, { unitId, supportGraph: graph })
		return true
	} catch (error) {
		if (error instanceof PermissionDeniedError) return false
		throw error
	}
}

const LOCATION_COLUMNS =
	"id, unit_id, kitchen_id, level, supplied_by_location_id, receives_direct, gln, uses_positions, name, supply_classes, updated_at, deleted_at"

/** Locais que o `storage` do usuário alcança, por nível e nome. */
export const listMyStockLocationsFn = createServerFn({ method: "GET" }).handler(async (): Promise<StockLocationView[]> => {
	const ctx = await requireStock(1)
	const graph = await fetchUnitSupportGraph(getCoreReadClient())

	const { data: locations, error } = await getInventoryClient()
		.from("stock_location")
		.select(LOCATION_COLUMNS)
		.is("deleted_at", null)
		.order("level")
		.order("name")
	if (error) throw new Error(`Erro ao ler os locais de estoque: ${error.message}`)

	const reachable = ((locations ?? []) as StockLocationRow[]).filter((location) => {
		try {
			requireStockLocation(ctx, 1, { id: location.id, unitId: location.unit_id, kitchenId: location.kitchen_id }, graph)
			return true
		} catch (denied) {
			if (denied instanceof PermissionDeniedError) return false
			throw denied
		}
	})
	return toViews(reachable)
})

/** Um local, com o que a tela de detalhe precisa saber de permissão. */
export const fetchStockLocationFn = createServerFn({ method: "GET" })
	.validator(z.object({ locationId: z.number().int().positive() }))
	.handler(async ({ data }): Promise<StockLocationView & { canOperate: boolean; canManage: boolean }> => {
		const { ctx, location } = await requireStockAt(1, data.locationId)
		const target = { id: location.id, unitId: location.unit_id, kitchenId: location.kitchen_id }
		const graph = await fetchUnitSupportGraph(getCoreReadClient())
		const allows = (level: 2 | 3) => {
			try {
				requireStockLocation(ctx, level, target, graph)
				return true
			} catch {
				return false
			}
		}
		const [view] = await toViews([location])
		const isAdmin = hasPermission(ctx.permissions, SISPROV_ADMIN_MODULE, 2) && administersUnit(ctx, location.unit_id, graph)
		return { ...(view as StockLocationView), canOperate: allows(2), canManage: allows(3) || isAdmin }
	})

/** Locais que podem abastecer um de nível `level` (nível menor, ativos). */
export const listSupplierCandidatesFn = createServerFn({ method: "GET" })
	.validator(z.object({ level: z.union([z.literal(2), z.literal(3)]) }))
	.handler(async ({ data }): Promise<Array<{ id: number; name: string; level: number }>> => {
		await requireStock(1)
		const { data: rows, error } = await getInventoryClient()
			.from("stock_location")
			.select("id, name, level")
			.lt("level", data.level)
			.is("deleted_at", null)
			.is("kitchen_id", null)
			.order("level")
			.order("name")
		if (error) throw new Error(`Erro ao ler os abastecedores possíveis: ${error.message}`)
		return rows ?? []
	})

/** Local novo (depósito, distribuidor, almoxarifado). Cozinha não: o local dela nasce com ela, no sisub. */
export const createStockLocationFn = createServerFn({ method: "POST" })
	.validator(
		z.intersection(stockLocationSettingsSchema, z.object({ unitId: z.number().int().positive(), supplyClasses: z.array(z.enum(SUPPLY_CLASSES)).min(1) }))
	)
	.handler(async ({ data }): Promise<{ id: number }> => {
		const ctx = await requireSisprovAdmin(2)
		const graph = await fetchUnitSupportGraph(getCoreReadClient())
		if (!administersUnit(ctx, data.unitId, graph)) throw new Error("A OM do local está fora da sua cobertura de administração.")
		const { data: created, error } = await getInventoryClient()
			.from("stock_location")
			.insert({
				unit_id: data.unitId,
				name: data.name,
				level: data.level,
				supplied_by_location_id: data.suppliedByLocationId,
				receives_direct: data.receivesDirect,
				uses_positions: data.usesPositions,
				gln: data.gln,
				supply_classes: [...new Set(data.supplyClasses)],
			})
			.select("id")
			.single()
		if (error) throw new Error(`Não foi possível criar o local: ${stockDbMessage(error)}`)
		return { id: created.id }
	})

/**
 * Configuração do local. Confere a versão que a tela viu: duas pessoas editando ao mesmo tempo,
 * a segunda recebe o aviso em vez de apagar a mudança da primeira.
 */
export const updateStockLocationFn = createServerFn({ method: "POST" })
	.validator(z.intersection(stockLocationSettingsSchema, z.object({ locationId: z.number().int().positive(), seenUpdatedAt: z.string().min(1) })))
	.handler(async ({ data }): Promise<{ updatedAt: string }> => {
		const location = await readStockLocation(data.locationId)
		// gestor do local (storage 3) ou SDAB (sisprov-admin 2) na cobertura da OM do local
		const ctx = await requireStock(1)
		const isAdmin =
			hasPermission(ctx.permissions, SISPROV_ADMIN_MODULE, 2) && administersUnit(ctx, location.unit_id, await fetchUnitSupportGraph(getCoreReadClient()))
		if (!isAdmin) await requireStockAt(3, data.locationId)
		if (location.kitchen_id !== null && data.level !== 3) throw new Error("O local de cozinha é sempre nível 3.")

		const { data: updated, error } = await getInventoryClient()
			.from("stock_location")
			.update({
				name: data.name,
				level: data.level,
				supplied_by_location_id: data.suppliedByLocationId,
				receives_direct: data.receivesDirect,
				uses_positions: data.usesPositions,
				gln: data.gln,
			})
			.eq("id", data.locationId)
			.eq("updated_at", data.seenUpdatedAt)
			.select("updated_at")
		if (error) throw new Error(`Não foi possível salvar o local: ${stockDbMessage(error)}`)
		if (!updated || updated.length === 0) throw new Error("O local foi alterado por outra pessoa enquanto você editava. Recarregue para ver a versão atual.")
		return { updatedAt: (updated[0] as { updated_at: string }).updated_at }
	})

/** OMs em que a SDAB do usuário pode criar local (cobertura de `sisprov-admin` 2), para o seletor. */
export const listAdministeredUnitsFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<Array<{ id: number; code: string; name: string | null }>> => {
		const ctx = await requireSisprovAdmin(2)
		const core = getCoreReadClient()
		const graph = await fetchUnitSupportGraph(core)
		const { data, error } = await core.from("units").select("id, code, display_name").order("code").limit(1000)
		if (error) throw new Error(`Erro ao listar as OMs: ${error.message}`)
		return (data ?? []).filter((unit) => administersUnit(ctx, unit.id, graph)).map((unit) => ({ id: unit.id, code: unit.code, name: unit.display_name }))
	}
)
