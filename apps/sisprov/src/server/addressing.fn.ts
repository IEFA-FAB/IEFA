/**
 * @module addressing.fn
 * Endereçamento de um local de estoque (`openspec/changes/sisprov-foundation`, D18): posições em
 * árvore, lotes guardados e pendentes, movimentação entre posições e unidades de movimentação
 * (pallet GIAI, caixa SSCC).
 *
 * Cadastro de posição: `storage` 3 no local. Guardar, mover e unidades: `storage` 2. Leitura: 1.
 * As regras de forma (tipo, endereço, SSCC, GIAI) são conferidas aqui pelo schema do domínio e de
 * novo pelo banco, que é a trava. Movimentar posição não mexe no ledger: saldo e custo não mudam.
 */

import { handlingUnitInputSchema, POSITION_KINDS, type PositionKind, positionInputSchema } from "@iefa/sisprov-domain/inventory"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { assertAddressed, requireStockAt, requireStockOrAdminAt, stockDbMessage } from "@/lib/stock-auth.server"
import { getCoreReadClient, getInventoryClient } from "@/lib/supabase.server"

export type PositionView = {
	id: number
	parentId: number | null
	kind: PositionKind
	code: string
	address: string
	aisle: number | null
	rackType: string | null
	pickingSequence: number | null
	holdsStock: boolean
	lastCountedAt: string | null
	updatedAt: string
}

/** Posições ativas do local. */
export const listPositionsFn = createServerFn({ method: "GET" })
	.validator(z.object({ locationId: z.number().int().positive() }))
	.handler(async ({ data }): Promise<PositionView[]> => {
		await requireStockOrAdminAt(1, data.locationId)
		const { data: rows, error } = await getInventoryClient()
			.from("storage_position")
			.select("id, parent_id, kind, code, address, aisle, rack_type, picking_sequence, holds_stock, last_counted_at, updated_at")
			.eq("location_id", data.locationId)
			.is("deleted_at", null)
			.order("address")
			.limit(5000)
		if (error) throw new Error(`Erro ao ler os endereços: ${error.message}`)
		return (rows ?? []).map((row) => ({
			id: row.id,
			parentId: row.parent_id,
			kind: row.kind as PositionKind,
			code: row.code,
			address: row.address,
			aisle: row.aisle,
			rackType: row.rack_type,
			pickingSequence: row.picking_sequence,
			holdsStock: row.holds_stock,
			lastCountedAt: row.last_counted_at,
			updatedAt: row.updated_at,
		}))
	})

export const createPositionFn = createServerFn({ method: "POST" })
	.validator(positionInputSchema)
	.handler(async ({ data }): Promise<{ id: number }> => {
		const { ctx, location } = await requireStockOrAdminAt(3, data.locationId)
		assertAddressed(location)
		const { data: created, error } = await getInventoryClient()
			.from("storage_position")
			.insert({
				location_id: data.locationId,
				parent_id: data.parentId,
				kind: data.kind,
				code: data.code.toUpperCase(),
				// o endereço é derivado pelo banco; vai qualquer valor e o trigger o reescreve
				address: data.code.toUpperCase(),
				aisle: data.aisle,
				rack_type: data.rackType || null,
				picking_sequence: data.pickingSequence,
				created_by: ctx.userId,
			})
			.select("id")
			.single()
		if (error) {
			if (error.code === "23505") throw new Error("Já existe uma posição ativa com este endereço no local.")
			throw new Error(`Não foi possível criar a posição: ${stockDbMessage(error)}`)
		}
		return { id: created.id }
	})

/** Código, ordem de separação, corredor e tipo. Confere a versão vista; o endereço das filhas acompanha. */
export const updatePositionFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			locationId: z.number().int().positive(),
			positionId: z.number().int().positive(),
			code: z
				.string()
				.trim()
				.regex(/^[A-Za-z0-9]{1,12}$/, "Código: letras e dígitos, até 12"),
			aisle: z.number().int().positive().nullable(),
			rackType: z.string().trim().max(60).nullable(),
			pickingSequence: z.number().int().min(0).nullable(),
			seenUpdatedAt: z.string().min(1),
		})
	)
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireStockOrAdminAt(3, data.locationId)
		const { data: updated, error } = await getInventoryClient()
			.from("storage_position")
			.update({ code: data.code.toUpperCase(), aisle: data.aisle, rack_type: data.rackType || null, picking_sequence: data.pickingSequence })
			.eq("id", data.positionId)
			.eq("location_id", data.locationId)
			.eq("updated_at", data.seenUpdatedAt)
			.select("id")
		if (error) {
			if (error.code === "23505") throw new Error("Já existe uma posição ativa com este endereço no local.")
			throw new Error(`Não foi possível salvar a posição: ${stockDbMessage(error)}`)
		}
		if (!updated || updated.length === 0) throw new Error("A posição foi alterada por outra pessoa. Recarregue para ver a versão atual.")
		return { ok: true }
	})

/** Desativa a posição. O banco recusa se houver posição ativa dentro dela ou estoque guardado. */
export const deactivatePositionFn = createServerFn({ method: "POST" })
	.validator(z.object({ locationId: z.number().int().positive(), positionId: z.number().int().positive() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireStockOrAdminAt(3, data.locationId)
		const { data: updated, error } = await getInventoryClient()
			.from("storage_position")
			.update({ deleted_at: new Date().toISOString() })
			.eq("id", data.positionId)
			.eq("location_id", data.locationId)
			.is("deleted_at", null)
			.select("id")
		if (error) throw new Error(`Não foi possível desativar: ${stockDbMessage(error)}`)
		if (!updated || updated.length === 0) throw new Error("Posição não encontrada ou já desativada.")
		return { ok: true }
	})

export type LotView = {
	lotId: string
	itemId: string
	description: string
	measureUnit: string | null
	lotCode: string
	shortCode: string | null
	expiryDate: string | null
	balance: number
	quarantined: boolean
	positionId: number | null
	address: string | null
}

/** Lotes com saldo no local, com a posição; `pendingOnly` = os que esperam endereçamento. */
export const listLocationLotsFn = createServerFn({ method: "GET" })
	.validator(z.object({ locationId: z.number().int().positive(), pendingOnly: z.boolean().default(false) }))
	.handler(async ({ data }): Promise<LotView[]> => {
		await requireStockOrAdminAt(1, data.locationId)
		const inv = getInventoryClient()
		let query = inv
			.from("v_lot_expiry")
			.select("lot_id, item_id, lot_code, short_code, expiry_date, balance, quarantined_at, position_id")
			.eq("location_id", data.locationId)
			.order("expiry_date", { ascending: true, nullsFirst: false })
			.limit(2000)
		if (data.pendingOnly) query = query.is("position_id", null)
		const { data: rows, error } = await query
		if (error) throw new Error(`Erro ao ler os lotes do local: ${error.message}`)
		const lots = (rows ?? []).filter((row) => row.lot_id && row.item_id)

		const itemIds = [...new Set(lots.map((row) => row.item_id as string))]
		const positionIds = [...new Set(lots.map((row) => row.position_id).filter((id): id is number => id !== null))]
		const [items, positions] = await Promise.all([
			itemIds.length > 0
				? getCoreReadClient().from("item").select("id, description, measure_unit").in("id", itemIds)
				: Promise.resolve({ data: [], error: null }),
			positionIds.length > 0 ? inv.from("storage_position").select("id, address").in("id", positionIds) : Promise.resolve({ data: [], error: null }),
		])
		if (items.error) throw new Error(`Erro ao ler os itens: ${items.error.message}`)
		if (positions.error) throw new Error(`Erro ao ler os endereços: ${positions.error.message}`)
		const itemOf = new Map((items.data ?? []).map((item) => [item.id, item]))
		const addressOf = new Map((positions.data ?? []).map((position) => [position.id, position.address]))

		return lots.map((row) => {
			const item = itemOf.get(row.item_id as string)
			return {
				lotId: row.lot_id as string,
				itemId: row.item_id as string,
				description: item?.description ?? "—",
				measureUnit: item?.measure_unit ?? null,
				lotCode: row.lot_code ?? "",
				shortCode: row.short_code,
				expiryDate: row.expiry_date,
				balance: Number(row.balance ?? 0),
				quarantined: row.quarantined_at != null,
				positionId: row.position_id,
				address: row.position_id === null ? null : (addressOf.get(row.position_id) ?? null),
			}
		})
	})

/** Guarda ou move lote ou unidade (lote/unidade solta → posição; caixa → pallet). */
export const moveToPositionFn = createServerFn({ method: "POST" })
	.validator(
		z
			.object({
				locationId: z.number().int().positive(),
				lotId: z.uuid().nullable(),
				handlingUnitId: z.uuid().nullable(),
				toPositionId: z.number().int().positive().nullable(),
				toPalletId: z.uuid().nullable(),
				reason: z.string().trim().max(200).nullable(),
			})
			.refine((value) => (value.lotId === null) !== (value.handlingUnitId === null), "Informe o lote ou a unidade")
			.refine((value) => (value.toPositionId === null) !== (value.toPalletId === null), "Informe a posição ou o pallet de destino")
	)
	.handler(async ({ data }): Promise<{ moveId: string }> => {
		const { ctx, location } = await requireStockAt(2, data.locationId)
		assertAddressed(location)
		const inv = getInventoryClient()
		// o alvo tem de ser deste local: o gate foi aplicado ao local do pedido, não ao do lote
		const target = data.lotId
			? await inv.from("stock_lot").select("location_id").eq("id", data.lotId).maybeSingle()
			: await inv
					.from("handling_unit")
					.select("location_id")
					.eq("id", data.handlingUnitId as string)
					.maybeSingle()
		if (target.error) throw new Error(`Erro ao ler o que será movido: ${target.error.message}`)
		if (!target.data || target.data.location_id !== data.locationId) throw new Error("Lote ou unidade não encontrado neste local.")

		const { data: moveId, error } = await inv.rpc("move_to_position", {
			p_lot_id: data.lotId,
			p_handling_unit_id: data.handlingUnitId,
			p_to_position_id: data.toPositionId,
			p_to_pallet_id: data.toPalletId,
			p_reason: data.reason,
			p_user: ctx.userId,
		})
		if (error) throw new Error(`Não foi possível mover: ${stockDbMessage(error)}`)
		return { moveId: moveId as string }
	})

export type HandlingUnitView = {
	id: string
	kind: "pallet" | "box"
	code: string
	parentId: string | null
	lotId: string | null
	positionId: number | null
	address: string | null
	quantity: number | null
	weightKg: number | null
	boxCategory: string | null
}

/** Unidades abertas do local, com o endereço (a caixa no pallet herda o do pallet). */
export const listHandlingUnitsFn = createServerFn({ method: "GET" })
	.validator(z.object({ locationId: z.number().int().positive() }))
	.handler(async ({ data }): Promise<HandlingUnitView[]> => {
		await requireStockOrAdminAt(1, data.locationId)
		const inv = getInventoryClient()
		const { data: rows, error } = await inv
			.from("handling_unit")
			.select("id, kind, code, parent_id, lot_id, position_id, quantity, weight_kg, box_category")
			.eq("location_id", data.locationId)
			.is("closed_at", null)
			.order("kind", { ascending: false })
			.order("code")
			.limit(5000)
		if (error) throw new Error(`Erro ao ler as unidades: ${error.message}`)
		const units = rows ?? []
		const positionOfUnit = new Map(units.map((unit) => [unit.id, unit.position_id]))
		const effectivePosition = (unit: (typeof units)[number]) => (unit.parent_id ? (positionOfUnit.get(unit.parent_id) ?? null) : unit.position_id)
		const positionIds = [...new Set(units.map(effectivePosition).filter((id): id is number => id !== null))]
		const { data: positions, error: positionsError } =
			positionIds.length > 0 ? await inv.from("storage_position").select("id, address").in("id", positionIds) : { data: [], error: null }
		if (positionsError) throw new Error(`Erro ao ler os endereços: ${positionsError.message}`)
		const addressOf = new Map((positions ?? []).map((position) => [position.id, position.address]))
		return units.map((unit) => {
			const position = effectivePosition(unit)
			return {
				id: unit.id,
				kind: unit.kind as "pallet" | "box",
				code: unit.code,
				parentId: unit.parent_id,
				lotId: unit.lot_id,
				positionId: position,
				address: position === null ? null : (addressOf.get(position) ?? null),
				quantity: unit.quantity === null ? null : Number(unit.quantity),
				weightKg: unit.weight_kg === null ? null : Number(unit.weight_kg),
				boxCategory: unit.box_category,
			}
		})
	})

export const createHandlingUnitFn = createServerFn({ method: "POST" })
	.validator(handlingUnitInputSchema)
	.handler(async ({ data }): Promise<{ id: string }> => {
		const { ctx, location } = await requireStockAt(2, data.locationId)
		assertAddressed(location)
		const inv = getInventoryClient()
		const { data: created, error } =
			data.kind === "pallet"
				? await inv
						.from("handling_unit")
						.insert({
							location_id: data.locationId,
							kind: "pallet",
							code: data.code,
							position_id: data.positionId,
							weight_kg: data.weightKg,
							created_by: ctx.userId,
						})
						.select("id")
						.single()
				: await inv
						.from("handling_unit")
						.insert({
							location_id: data.locationId,
							kind: "box",
							code: data.code,
							lot_id: data.lotId,
							parent_id: data.palletId,
							// caixa no pallet segue a posição dele
							position_id: data.palletId ? null : data.positionId,
							quantity: data.quantity,
							weight_kg: data.weightKg,
							box_category: data.boxCategory || null,
							created_by: ctx.userId,
						})
						.select("id")
						.single()
		if (error) {
			if (error.code === "23505") throw new Error("Já existe unidade aberta com este código.")
			throw new Error(`Não foi possível cadastrar a unidade: ${stockDbMessage(error)}`)
		}
		return { id: created.id }
	})

/** Fecha a unidade (desmontou o pallet, a caixa acabou). O banco recusa pallet com caixa dentro. */
export const closeHandlingUnitFn = createServerFn({ method: "POST" })
	.validator(z.object({ locationId: z.number().int().positive(), handlingUnitId: z.uuid() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireStockAt(2, data.locationId)
		const { data: updated, error } = await getInventoryClient()
			.from("handling_unit")
			.update({ closed_at: new Date().toISOString() })
			.eq("id", data.handlingUnitId)
			.eq("location_id", data.locationId)
			.is("closed_at", null)
			.select("id")
		if (error) throw new Error(`Não foi possível fechar a unidade: ${stockDbMessage(error)}`)
		if (!updated || updated.length === 0) throw new Error("Unidade não encontrada ou já fechada.")
		return { ok: true }
	})

/** Os tipos que a tela oferece, na ordem de profundidade (fonte: o domínio). */
export const POSITION_KIND_ORDER = POSITION_KINDS
