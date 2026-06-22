/**
 * @module pieceItems.fn
 * Catálogo de itens de venda concretos (leitura pública).
 * piece_item = variante comprável de uma peça (ex.: "Sapato 43",
 * "Platina de Capitão Intendente"). A peça-pai (abstrata) vem no join.
 */

import type { PieceItemWithPiece } from "@iefa/database/rumaer"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getRumaerServerClient } from "@/lib/supabase.server"

export const listPieceItemsFn = createServerFn({ method: "GET" })
	.validator(z.object({ pieceId: z.string().uuid().optional() }))
	.handler(async ({ data }): Promise<PieceItemWithPiece[]> => {
		const supabase = getRumaerServerClient()
		let query = supabase.from("piece_item").select("*, piece:piece(*)").is("deleted_at", null).order("nome", { ascending: true })
		if (data.pieceId) query = query.eq("piece_id", data.pieceId)

		const { data: rows, error } = await query
		if (error) throw new Error(error.message)
		return (rows ?? []) as PieceItemWithPiece[]
	})
