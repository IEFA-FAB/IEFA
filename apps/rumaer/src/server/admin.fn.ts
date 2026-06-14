/**
 * @module admin.fn
 * CRUD protegido para popular o regulamento. Usa service-role (bypassa RLS).
 * Toda mutação exige usuário autenticado (requireAuth) — além do guard de rota /admin.
 */

import type { Piece, Uniform, UniformVariant } from "@iefa/database/rumaer"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getRumaerAuthClient, getRumaerServerClient } from "@/lib/supabase.server"

async function requireAuth() {
	const {
		data: { user },
	} = await getRumaerAuthClient().auth.getUser()
	if (!user) throw new Error("Não autenticado")
	return user
}

const GRUPO = z.enum(["historicos", "representacao", "servicos", "educacao_fisica", "desfile"])
const CATEGORIA = z.enum(["oficiais", "cadetes", "suboficiais", "sargentos", "alunos_formacao", "pracas"])
const CIRCULO = z.enum(["oficiais", "sargentos", "suboficiais", "cadetes", "alunos"])
const GENERO = z.enum(["masculino", "feminino", "unissex"])
const OBRIGATORIEDADE = z.enum(["obrigatorio", "eventual", "facultativo"])
const EQ_CIVIL = z.enum(["esporte", "esporte_fino", "passeio", "passeio_completo", "gala"])
const TIPO_PECA = z.enum(["cabeca", "torso", "pernas", "calcado", "acessorio", "insignia", "distintivo", "identificacao", "arma"])

// ---------------------------------------------------------------- uniform ----
export const upsertUniformFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			id: z.string().uuid().optional(),
			numero: z.number().int().nullable().optional(),
			letra: z.string().nullable().optional(),
			nome: z.string().min(1),
			grupo: GRUPO,
			subgrupo: z.string().nullable().optional(),
			traje: z.string().nullable().optional(),
			descricao_md: z.string().nullable().optional(),
			art_referencia: z.string().nullable().optional(),
			eq_mb: z.string().nullable().optional(),
			eq_eb: z.string().nullable().optional(),
			eq_civil: EQ_CIVIL.nullable().optional(),
			ordem: z.number().int().optional(),
		})
	)
	.handler(async ({ data }): Promise<Uniform> => {
		await requireAuth()
		const supabase = getRumaerServerClient()
		const { data: row, error } = await supabase.from("uniform").upsert(data).select("*").single()
		if (error) throw new Error(error.message)
		return row
	})

export const deleteUniformFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { error } = await getRumaerServerClient().from("uniform").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)
		if (error) throw new Error(error.message)
		return { ok: true }
	})

export const setUniformCategoriesFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ uniformId: z.string().uuid(), categorias: z.array(CATEGORIA) }))
	.handler(async ({ data }) => {
		await requireAuth()
		const supabase = getRumaerServerClient()
		const { error: delErr } = await supabase.from("uniform_category").delete().eq("uniform_id", data.uniformId)
		if (delErr) throw new Error(delErr.message)
		if (data.categorias.length > 0) {
			const rows = data.categorias.map((categoria) => ({ uniform_id: data.uniformId, categoria }))
			const { error } = await supabase.from("uniform_category").insert(rows)
			if (error) throw new Error(error.message)
		}
		return { ok: true }
	})

// ---------------------------------------------------------------- variant ----
export const upsertVariantFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			id: z.string().uuid().optional(),
			uniform_id: z.string().uuid(),
			circulo: CIRCULO,
			genero: GENERO,
			sub_variacao: z.string().nullable().optional(),
			image_path: z.string().nullable().optional(),
			descricao_md: z.string().nullable().optional(),
			ordem: z.number().int().optional(),
		})
	)
	.handler(async ({ data }): Promise<UniformVariant> => {
		await requireAuth()
		const { data: row, error } = await getRumaerServerClient().from("uniform_variant").upsert(data).select("*").single()
		if (error) throw new Error(error.message)
		return row
	})

export const deleteVariantFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { error } = await getRumaerServerClient().from("uniform_variant").delete().eq("id", data.id)
		if (error) throw new Error(error.message)
		return { ok: true }
	})

// ------------------------------------------------------------------ piece ----
export const upsertPieceFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			id: z.string().uuid().optional(),
			nome: z.string().min(1),
			slug: z.string().min(1),
			tipo: TIPO_PECA,
			descricao_md: z.string().nullable().optional(),
		})
	)
	.handler(async ({ data }): Promise<Piece> => {
		await requireAuth()
		const { data: row, error } = await getRumaerServerClient().from("piece").upsert(data).select("*").single()
		if (error) throw new Error(error.message)
		return row
	})

export const deletePieceFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { error } = await getRumaerServerClient().from("piece").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)
		if (error) throw new Error(error.message)
		return { ok: true }
	})

// --------------------------------------------------------- variant pieces ----
export const setVariantPiecesFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			variantId: z.string().uuid(),
			pieces: z.array(
				z.object({
					piece_id: z.string().uuid(),
					obrigatoriedade: OBRIGATORIEDADE,
					observacao: z.string().nullable().optional(),
					restricao_posto: z.array(z.string()).nullable().optional(),
					restricao_quadro: z.array(z.string()).nullable().optional(),
					ordem: z.number().int().optional(),
				})
			),
		})
	)
	.handler(async ({ data }) => {
		await requireAuth()
		const supabase = getRumaerServerClient()
		const { error: delErr } = await supabase.from("uniform_variant_piece").delete().eq("variant_id", data.variantId)
		if (delErr) throw new Error(delErr.message)
		if (data.pieces.length > 0) {
			const rows = data.pieces.map((p, i) => ({ ...p, variant_id: data.variantId, ordem: p.ordem ?? i }))
			const { error } = await supabase.from("uniform_variant_piece").insert(rows)
			if (error) throw new Error(error.message)
		}
		return { ok: true }
	})
