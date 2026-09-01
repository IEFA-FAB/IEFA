/**
 * @module uniforms.fn
 * Leitura pública de uniformes (lista filtrável + detalhe com joins).
 * Usa service-role (getRumaerServerClient); RLS já permite leitura pública,
 * mas o service-role simplifica e evita round-trips de auth.
 */

import type { CategoriaMilitar, Genero, Uniform, UniformDetail } from "@iefa/database/rumaer"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getRumaerServerClient } from "@/lib/supabase.server"
import { GENERO_ORDER } from "@/lib/uniforms/labels"

const GRUPOS = ["historicos", "representacao", "servicos", "educacao_fisica", "desfile"] as const
const CATEGORIAS = ["oficiais", "cadetes", "suboficiais", "sargentos", "alunos_formacao", "pracas"] as const

/**
 * Item da listagem pública. `generos` são os gêneros que o uniforme realmente
 * tem cadastrados como variante — a lista da home separa o resultado por gênero
 * (a ilustração masculina e a feminina são peças diferentes) e precisa saber, sem
 * carregar o detalhe inteiro, quais existem.
 */
export type UniformListItem = Uniform & { categories: { categoria: CategoriaMilitar }[]; generos: Genero[] }

type UniformListRow = Uniform & { categories: { categoria: CategoriaMilitar }[]; variants: { genero: Genero }[] }

// Catálogo público — ver listPiecesFn.
// nosemgrep: server-fn-missing-auth-guard
export const listUniformsFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			grupo: z.enum(GRUPOS).optional(),
			categoria: z.enum(CATEGORIAS).optional(),
		})
	)
	.handler(async ({ data }): Promise<UniformListItem[]> => {
		const supabase = getRumaerServerClient()

		// inner join em categoria quando filtrando por ela; senão left join.
		const categorySelect = data.categoria ? "categories:uniform_category!inner(categoria)" : "categories:uniform_category(categoria)"

		let query = supabase
			.from("uniform")
			.select(`*, ${categorySelect}, variants:uniform_variant(genero)`)
			.is("deleted_at", null)
			.order("ordem", { ascending: true })

		if (data.grupo) query = query.eq("grupo", data.grupo)
		if (data.categoria) query = query.eq("categories.categoria", data.categoria)

		const { data: rows, error } = await query
		if (error) throw new Error(error.message)

		return ((rows ?? []) as unknown as UniformListRow[]).map(({ variants, ...uniform }) => {
			const present = new Set(variants?.map((v) => v.genero) ?? [])
			return { ...uniform, generos: GENERO_ORDER.filter((g) => present.has(g)) }
		})
	})

// Catálogo público — ver listUniformsFn.
// nosemgrep: server-fn-missing-auth-guard
export const getUniformFn = createServerFn({ method: "GET" })
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ data }): Promise<UniformDetail | null> => {
		const supabase = getRumaerServerClient()

		const { data: row, error } = await supabase
			.from("uniform")
			.select(
				`*,
				categories:uniform_category(*),
				variants:uniform_variant(
					*,
					pieces:uniform_variant_piece(*, piece:piece(*), piece_item:piece_item(*)),
					images:uniform_variant_image(*)
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
			v.images = [...v.images].sort((a, b) => a.ordem - b.ordem)
		}
		return detail
	})
