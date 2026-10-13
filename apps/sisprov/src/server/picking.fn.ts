/**
 * @module picking.fn
 * Lista de separação de um local endereçado (`openspec/changes/sisprov-foundation`, D18). A
 * alocação FEFO, a numeração por local e ano e a ordem das linhas são do banco
 * (`inventory.create_picking_list`), na mesma transação; aqui só o gate, a validação e a leitura.
 * A lista não move estoque: é o roteiro de quem separa.
 */

import { pickingLinesSchema } from "@iefa/sisprov-domain/inventory"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { assertAddressed, requireStockAt, requireStockOrAdminAt, stockDbMessage } from "@/lib/stock-auth.server"
import { getCoreReadClient, getInventoryClient } from "@/lib/supabase.server"

export type PickingListSummary = {
	id: string
	year: number
	number: number
	status: "open" | "picked" | "cancelled"
	reference: string | null
	createdAt: string
}

export const listPickingListsFn = createServerFn({ method: "GET" })
	.validator(z.object({ locationId: z.number().int().positive() }))
	.handler(async ({ data }): Promise<PickingListSummary[]> => {
		await requireStockOrAdminAt(1, data.locationId)
		const { data: rows, error } = await getInventoryClient()
			.from("picking_list")
			.select("id, year, number, status, reference, created_at")
			.eq("location_id", data.locationId)
			.order("created_at", { ascending: false })
			.limit(100)
		if (error) throw new Error(`Erro ao ler as listas de separação: ${error.message}`)
		return (rows ?? []).map((row) => ({
			id: row.id,
			year: row.year,
			number: row.number,
			status: row.status as PickingListSummary["status"],
			reference: row.reference,
			createdAt: row.created_at,
		}))
	})

export type PickingLineView = {
	lineNumber: number
	description: string
	measureUnit: string | null
	lotCode: string | null
	address: string | null
	quantity: number
	shortage: boolean
}

export const fetchPickingListFn = createServerFn({ method: "GET" })
	.validator(z.object({ locationId: z.number().int().positive(), listId: z.uuid() }))
	.handler(async ({ data }): Promise<{ list: PickingListSummary; lines: PickingLineView[] }> => {
		await requireStockOrAdminAt(1, data.locationId)
		const inv = getInventoryClient()
		const { data: list, error } = await inv
			.from("picking_list")
			.select("id, year, number, status, reference, created_at")
			.eq("id", data.listId)
			.eq("location_id", data.locationId)
			.maybeSingle()
		if (error) throw new Error(`Erro ao ler a lista: ${error.message}`)
		if (!list) throw new Error("Lista de separação não encontrada neste local.")
		const { data: lines, error: linesError } = await inv
			.from("picking_list_line")
			.select("line_number, item_id, lot_id, position_id, quantity, shortage")
			.eq("picking_list_id", data.listId)
			.order("line_number")
		if (linesError) throw new Error(`Erro ao ler as linhas: ${linesError.message}`)
		const rows = lines ?? []
		const itemIds = [...new Set(rows.map((row) => row.item_id))]
		const lotIds = [...new Set(rows.map((row) => row.lot_id).filter((id): id is string => id !== null))]
		const positionIds = [...new Set(rows.map((row) => row.position_id).filter((id): id is number => id !== null))]
		const [items, lots, positions] = await Promise.all([
			itemIds.length > 0
				? getCoreReadClient().from("item").select("id, description, measure_unit").in("id", itemIds)
				: Promise.resolve({ data: [], error: null }),
			lotIds.length > 0 ? inv.from("stock_lot").select("id, lot_code").in("id", lotIds) : Promise.resolve({ data: [], error: null }),
			positionIds.length > 0 ? inv.from("storage_position").select("id, address").in("id", positionIds) : Promise.resolve({ data: [], error: null }),
		])
		for (const result of [items, lots, positions]) if (result.error) throw new Error(`Erro ao ler a lista: ${result.error.message}`)
		const itemOf = new Map((items.data ?? []).map((item) => [item.id, item]))
		const lotCodeOf = new Map((lots.data ?? []).map((lot) => [lot.id, lot.lot_code]))
		const addressOf = new Map((positions.data ?? []).map((position) => [position.id, position.address]))
		return {
			list: {
				id: list.id,
				year: list.year,
				number: list.number,
				status: list.status as PickingListSummary["status"],
				reference: list.reference,
				createdAt: list.created_at,
			},
			lines: rows.map((row) => ({
				lineNumber: row.line_number,
				description: itemOf.get(row.item_id)?.description ?? "—",
				measureUnit: itemOf.get(row.item_id)?.measure_unit ?? null,
				lotCode: row.lot_id ? (lotCodeOf.get(row.lot_id) ?? null) : null,
				address: row.position_id === null ? null : (addressOf.get(row.position_id) ?? null),
				quantity: Number(row.quantity),
				shortage: row.shortage,
			})),
		}
	})

export const createPickingListFn = createServerFn({ method: "POST" })
	.validator(z.object({ locationId: z.number().int().positive(), reference: z.string().trim().max(120).nullable(), lines: pickingLinesSchema }))
	.handler(async ({ data }): Promise<{ id: string }> => {
		const { ctx, location } = await requireStockAt(2, data.locationId)
		assertAddressed(location)
		const { data: id, error } = await getInventoryClient().rpc("create_picking_list", {
			p_location_id: data.locationId,
			p_lines: data.lines.map((line) => ({ item_id: line.itemId, quantity: line.quantity })),
			p_reference: data.reference || null,
			p_user: ctx.userId,
		})
		if (error) throw new Error(`Não foi possível gerar a lista: ${stockDbMessage(error)}`)
		return { id: id as string }
	})

export const closePickingListFn = createServerFn({ method: "POST" })
	.validator(z.object({ locationId: z.number().int().positive(), listId: z.uuid(), status: z.enum(["picked", "cancelled"]) }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		const { ctx } = await requireStockAt(2, data.locationId)
		// a lista tem de ser deste local: o gate foi aplicado ao local do pedido
		const { data: list, error: listError } = await getInventoryClient().from("picking_list").select("location_id").eq("id", data.listId).maybeSingle()
		if (listError) throw new Error(`Erro ao ler a lista: ${listError.message}`)
		if (!list || list.location_id !== data.locationId) throw new Error("Lista de separação não encontrada neste local.")
		const { error } = await getInventoryClient().rpc("close_picking_list", { p_list_id: data.listId, p_status: data.status, p_user: ctx.userId })
		if (error) throw new Error(`Não foi possível fechar a lista: ${stockDbMessage(error)}`)
		return { ok: true }
	})
