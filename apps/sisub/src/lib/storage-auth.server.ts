/**
 * @module storage-auth.server
 * Guard PBAC `storage` do estoque, ESCOPADO pelo local de estoque da cozinha.
 *
 * O estoque é do SISPROV, de toda classe (`openspec/changes/sisprov-foundation`, D3 e D14), e o
 * sisub é a lente da alimentação: chega pela cozinha (`/storage/$kitchenId`) e opera o local de
 * estoque dela. O grant `storage` vale para o local quando é global, da cozinha do local, ou de
 * uma OM que cubra a OM do local pela hierarquia de apoio; deny vence. A regra é a do domínio
 * (`requireStockLocation`), a mesma que o SISPROV aplica.
 *
 * Guards sem escopo aceitavam a permissão de uma cozinha para dados de qualquer outra (review
 * Greptile); a service role não tem RLS para segurar isso, então o escopo é sempre do local.
 */

import { type AssuranceRequirement, fetchUnitSupportGraph, NO_ASSURANCE, type UnitSupportEdge, type UserPermission } from "@iefa/pbac"
import { canOnStockLocation, requireStockLocation, type StockLocationTarget, PermissionDeniedError as StockPermissionDeniedError } from "@iefa/sisprov-domain"
import type { UserContext } from "@iefa/sisub-domain/types"
import { setResponseStatus } from "@tanstack/react-start/server"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { publicDbMessage } from "@/lib/db-error-message"
import { getServerClient } from "@/lib/supabase.server"

/** O local de estoque de uma cozinha: o id que o `inventory` usa, a OM e a própria cozinha. */
export type KitchenStockLocation = StockLocationTarget

/**
 * Local de estoque da cozinha. Toda cozinha tem exatamente um, criado e mantido por trigger em
 * `kitchen.kitchen` (migration `inventory_multiclass`); a ausência é falha de dado, não regra.
 */
export async function resolveKitchenLocation(kitchenId: number): Promise<KitchenStockLocation> {
	const { data, error } = await getServerClient("inventory")
		.from("stock_location")
		.select("id, unit_id, kitchen_id")
		.eq("kitchen_id", kitchenId)
		.is("deleted_at", null)
		.maybeSingle()
	if (error) throw new Error(`Falha ao ler o local de estoque da cozinha: ${publicDbMessage(error)}`)
	if (!data) throw new Error(`A cozinha ${kitchenId} não tem local de estoque.`)
	return { id: data.id, unitId: data.unit_id, kitchenId: data.kitchen_id }
}

/** O grafo de apoio só é lido quando há `storage` escopado por OM: é ele que precisa. */
function hasUnitScopedStorage(ctx: UserContext): boolean {
	return ctx.permissions.some((p) => p.module === "storage" && p.unit_id !== null)
}

/** Grafo de apoio, lido só se alguma das permissões for `storage` por OM. */
export async function stockSupportGraphFor(permissions: readonly UserPermission[]): Promise<UnitSupportEdge[] | undefined> {
	return permissions.some((p) => p.module === "storage" && p.unit_id !== null) ? fetchUnitSupportGraph(getServerClient("core")) : undefined
}

/**
 * A regra de `storage` num local, como pergunta: este conjunto de permissões alcança o local no
 * nível pedido? Para decidir o que mostrar (contagem cega) ou se existe OUTRO aprovador, com a
 * mesma regra que o guard aplica (cozinha, OM que cobre a do local, global; deny vence).
 */
export async function allowsOnStockLocation(permissions: readonly UserPermission[], level: 1 | 2 | 3, location: KitchenStockLocation): Promise<boolean> {
	return canOnStockLocation(permissions, level, location, await stockSupportGraphFor(permissions))
}

/**
 * `storage` no local de estoque da cozinha, devolvendo o contexto e o local. As server functions
 * de estoque usam `location.id` em toda leitura e escrita do `inventory`.
 */
export async function requireStockForKitchen(
	level: 1 | 2 | 3,
	kitchenId: number,
	// Piso de garantia da operação, repassado ao guard. Default: nenhum — a etapa 9 do plano
	// é quem passa `enforcedAssuranceFor("<nomeDaFn>")` aqui.
	assurance: AssuranceRequirement = NO_ASSURANCE
): Promise<{ ctx: UserContext; location: KitchenStockLocation }> {
	// O módulo em algum escopo e a garantia de identidade: o recorte pelo local vem logo abaixo.
	const ctx = await requireAuthWithPermission("storage", level, undefined, assurance)
	const location = await resolveKitchenLocation(kitchenId)
	await assertStockLocation(ctx, level, location)
	return { ctx, location }
}

/** O local de estoque pelo id: OM e cozinha (nula se o local não é de cozinha). */
export async function resolveStockLocation(locationId: number): Promise<KitchenStockLocation> {
	const { data, error } = await getServerClient("inventory").from("stock_location").select("id, unit_id, kitchen_id").eq("id", locationId).maybeSingle()
	if (error) throw new Error(`Falha ao ler o local de estoque: ${publicDbMessage(error)}`)
	if (!data) throw new Error(`Local de estoque ${locationId} não encontrado.`)
	return { id: data.id, unitId: data.unit_id, kitchenId: data.kitchen_id }
}

/** A cozinha dona do local de estoque, ou nula se o local não é de cozinha. */
export async function kitchenOfLocation(locationId: number): Promise<number | null> {
	return (await resolveStockLocation(locationId)).kitchenId
}

/** Aplica a regra de `storage` num local já resolvido (global, cozinha do local, OM que o cobre). */
async function assertStockLocation(ctx: UserContext, level: 1 | 2 | 3, location: KitchenStockLocation): Promise<void> {
	const graph = hasUnitScopedStorage(ctx) ? await fetchUnitSupportGraph(getServerClient("core")) : undefined
	try {
		requireStockLocation(ctx, level, location, graph)
	} catch (error) {
		if (error instanceof StockPermissionDeniedError) {
			setResponseStatus(403)
			throw new Error(error.message || "Forbidden")
		}
		throw error
	}
}

/**
 * `storage` no local de estoque de um REGISTRO (recebimento, contagem, ajuste, lote, requisição):
 * o caminho de quem chega pelo id do documento e não pela cozinha da URL.
 */
export async function requireStockForLocation(
	level: 1 | 2 | 3,
	locationId: number,
	assurance: AssuranceRequirement = NO_ASSURANCE
): Promise<{ ctx: UserContext; location: KitchenStockLocation }> {
	const ctx = await requireAuthWithPermission("storage", level, undefined, assurance)
	const location = await resolveStockLocation(locationId)
	await assertStockLocation(ctx, level, location)
	return { ctx, location }
}

export async function requireStorageForLocation(level: 1 | 2 | 3, locationId: number, assurance: AssuranceRequirement = NO_ASSURANCE): Promise<UserContext> {
	return (await requireStockForLocation(level, locationId, assurance)).ctx
}

export async function requireStorageForKitchen(
	level: 1 | 2 | 3,
	kitchenId: number | null | undefined,
	assurance: AssuranceRequirement = NO_ASSURANCE
): Promise<UserContext> {
	if (kitchenId != null) return (await requireStockForKitchen(level, kitchenId, assurance)).ctx
	// Sem cozinha resolvível: só permissão GLOBAL de storage passa — permissão
	// escopada em outra cozinha ou OM não pode alcançar dados sem escopo.
	const ctx = await requireAuthWithPermission("storage", level, undefined, assurance)
	const isGlobal = ctx.permissions.some(
		(p) => p.module === "storage" && p.level >= level && p.kitchen_id === null && p.unit_id === null && p.mess_hall_id === null
	)
	if (!isGlobal) throw new Error("Requer permissão global de estoque para dados sem cozinha atribuída")
	return ctx
}
