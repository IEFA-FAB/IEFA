/**
 * Gate do estoque num LOCAL, no SISPROV: o mesmo `requireStockLocation` do domínio que o sisub
 * aplica (global, cozinha do local, OM que cobre a do local; deny vence). A server function que
 * opera um local passa por aqui, nunca por `requireStock` sozinho, que só diz "tem o módulo".
 */

import { fetchUnitSupportGraph, type UserContext } from "@iefa/pbac"
import { forbidden } from "@iefa/pbac/start"
import { PermissionDeniedError, requireStockLocation } from "@iefa/sisprov-domain"
import { requireStock } from "@/lib/auth.server"
import { getCoreReadClient, getInventoryClient } from "@/lib/supabase.server"

export type StockLocationRow = {
	id: number
	unit_id: number
	kitchen_id: number | null
	level: number
	supplied_by_location_id: number | null
	receives_direct: boolean
	gln: string | null
	uses_positions: boolean
	name: string
	supply_classes: string[]
	updated_at: string
	deleted_at: string | null
}

const LOCATION_COLUMNS =
	"id, unit_id, kitchen_id, level, supplied_by_location_id, receives_direct, gln, uses_positions, name, supply_classes, updated_at, deleted_at"

export async function readStockLocation(locationId: number): Promise<StockLocationRow> {
	const { data, error } = await getInventoryClient().from("stock_location").select(LOCATION_COLUMNS).eq("id", locationId).maybeSingle()
	if (error) throw new Error(`Erro ao ler o local de estoque: ${error.message}`)
	if (!data || data.deleted_at) throw new Error("Local de estoque não encontrado")
	return data as StockLocationRow
}

/** `storage` no nível pedido NESTE local. Devolve o contexto e a linha do local. */
export async function requireStockAt(level: 1 | 2 | 3, locationId: number): Promise<{ ctx: UserContext; location: StockLocationRow }> {
	const ctx = await requireStock(level)
	const location = await readStockLocation(locationId)
	const hasUnitGrant = ctx.permissions.some((p) => p.module === "storage" && p.unit_id !== null)
	const graph = hasUnitGrant ? await fetchUnitSupportGraph(getCoreReadClient()) : undefined
	try {
		requireStockLocation(ctx, level, { id: location.id, unitId: location.unit_id, kitchenId: location.kitchen_id }, graph)
	} catch (error) {
		if (error instanceof PermissionDeniedError) forbidden("Seu acesso ao estoque não alcança este local.")
		throw error
	}
	return { ctx, location }
}

/** O local precisa ser endereçado para posição, unidade e separação. */
export function assertAddressed(location: StockLocationRow): void {
	if (!location.uses_positions) throw new Error("Este local não é endereçado. Ligue o endereçamento na configuração do local.")
}

/**
 * Mensagem do banco para a tela: os RAISE do estoque vêm como `CODIGO: frase`; a frase é o que
 * a pessoa entende.
 */
export function stockDbMessage(error: { message?: string } | null | undefined): string {
	const message = error?.message ?? "erro desconhecido"
	const match = /^[A-Z][A-Z0-9_]+: (.+)$/s.exec(message)
	return match ? (match[1] as string) : message
}
