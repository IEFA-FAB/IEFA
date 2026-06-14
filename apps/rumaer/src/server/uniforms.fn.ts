/**
 * @module uniforms.fn
 * Leitura pública de uniformes (lista filtrável + detalhe com joins).
 * Usa service-role (getRumaerServerClient); RLS já permite leitura pública,
 * mas o service-role simplifica e evita round-trips de auth.
 */

import type { CategoriaMilitar, Uniform, UniformDetail } from "@iefa/database/rumaer"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getRumaerServerClient } from "@/lib/supabase.server"

const GRUPOS = ["historicos", "representacao", "servicos", "educacao_fisica", "desfile"] as const
const CATEGORIAS = ["oficiais", "cadetes", "suboficiais", "sargentos", "alunos_formacao", "pracas"] as const

export type UniformListItem = Uniform & { categories: { categoria: CategoriaMilitar }[] }

export const listUniformsFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			grupo: z.enum(GRUPOS).optional(),
			categoria: z.enum(CATEGORIAS).optional(),
		})
	)
	.handler(async ({ data }): Promise<UniformListItem[]> => {
		const supabase = getRumaerServerClient()

		// inner join em categoria quando filtrando por ela; senão left join.
		const categorySelect = data.categoria ? "categories:uniform_category!inner(categoria)" : "categories:uniform_category(categoria)"

		let query = supabase.from("uniform").select(`*, ${categorySelect}`).is("deleted_at", null).order("ordem", { ascending: true })

		if (data.grupo) query = query.eq("grupo", data.grupo)
		if (data.categoria) query = query.eq("categories.categoria", data.categoria)

		const { data: rows, error } = await query
		if (error) throw new Error(error.message)
		return (rows ?? []) as UniformListItem[]
	})

export const getUniformFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }): Promise<UniformDetail | null> => {
		const supabase = getRumaerServerClient()

		const { data: row, error } = await supabase
			.from("uniform")
			.select(
				`*,
				categories:uniform_category(*),
				variants:uniform_variant(
					*,
					pieces:uniform_variant_piece(*, piece:piece(*))
				)`
			)
			.eq("id", data.id)
			.is("deleted_at", null)
			.maybeSingle()

		if (error) throw new Error(error.message)
		if (!row) return null

		// Ordenação determinística (PostgREST não ordena embeds aninhados).
		const detail = row as unknown as UniformDetail
		detail.variants = [...detail.variants].sort((a, b) => a.ordem - b.ordem)
		for (const v of detail.variants) {
			v.pieces = [...v.pieces].sort((a, b) => a.ordem - b.ordem)
		}
		return detail
	})
