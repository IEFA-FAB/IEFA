/**
 * @module pieces.fn
 * Catálogo de peças (leitura pública).
 */

import type { Piece } from "@iefa/database/rumaer"
import { createServerFn } from "@tanstack/react-start"
import { getRumaerServerClient } from "@/lib/supabase.server"

export const listPiecesFn = createServerFn({ method: "GET" }).handler(async (): Promise<Piece[]> => {
	const supabase = getRumaerServerClient()
	const { data, error } = await supabase.from("piece").select("*").is("deleted_at", null).order("tipo", { ascending: true }).order("nome", { ascending: true })
	if (error) throw new Error(error.message)
	return data ?? []
})
