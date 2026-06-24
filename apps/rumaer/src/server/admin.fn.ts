/**
 * @module admin.fn
 * CRUD protegido para popular o regulamento. Usa service-role (bypassa RLS).
 * Toda mutação exige usuário autenticado (requireAuth) — além do guard de rota /admin.
 */

import type { Piece, PieceItem, Uniform, UniformVariant, UniformVariantImage } from "@iefa/database/rumaer"
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

const BUCKET = "rumaer-uniforms"

/** Remove objetos do storage em melhor-esforço — órfão eventual não deve derrubar a operação no DB. */
async function removeStorageObjects(paths: (string | null | undefined)[]) {
	const valid = paths.filter((p): p is string => !!p)
	if (valid.length === 0) return
	await getRumaerServerClient().storage.from(BUCKET).remove(valid)
}

const GRUPO = z.enum(["historicos", "representacao", "servicos", "educacao_fisica", "desfile"])
const CATEGORIA = z.enum(["oficiais", "cadetes", "suboficiais", "sargentos", "alunos_formacao", "pracas"])
const CIRCULO = z.enum(["oficiais_generais", "oficiais", "sargentos", "suboficiais", "cadetes", "alunos", "pracas"])
const GENERO = z.enum(["masculino", "feminino", "unissex"])
const OBRIGATORIEDADE = z.enum(["obrigatorio", "eventual", "facultativo"])
const EQ_CIVIL = z.enum(["esporte", "esporte_fino", "passeio", "passeio_completo", "gala"])
const TIPO_PECA = z.enum(["cabeca", "torso", "pernas", "calcado", "acessorio", "insignia", "distintivo", "identificacao", "arma"])

// ---------------------------------------------------------------- uniform ----
export const upsertUniformFn = createServerFn({ method: "POST" })
	.validator(
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
	.validator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { error } = await getRumaerServerClient().from("uniform").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)
		if (error) throw new Error(error.message)
		return { ok: true }
	})

export const cloneUniformFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }): Promise<Uniform> => {
		await requireAuth()
		const supabase = getRumaerServerClient()

		// 1. uniforme de origem
		const { data: src, error: srcErr } = await supabase.from("uniform").select("*").eq("id", data.id).single()
		if (srcErr) throw new Error(srcErr.message)

		const { created_at: _c, updated_at: _u, deleted_at: _d, id: _id, ...rest } = src
		const { data: clone, error: cloneErr } = await supabase
			.from("uniform")
			.insert({ ...rest, nome: `${src.nome} (cópia)`, letra: src.letra ? `${src.letra}-cópia` : null })
			.select("*")
			.single()
		if (cloneErr) throw new Error(cloneErr.message)

		// 2. categorias
		const { data: cats, error: catErr } = await supabase.from("uniform_category").select("categoria").eq("uniform_id", data.id)
		if (catErr) throw new Error(catErr.message)
		if (cats && cats.length > 0) {
			const { error } = await supabase.from("uniform_category").insert(cats.map((c) => ({ uniform_id: clone.id, categoria: c.categoria })))
			if (error) throw new Error(error.message)
		}

		// 3. variantes + composição de peças
		const { data: variants, error: varErr } = await supabase.from("uniform_variant").select("*").eq("uniform_id", data.id).order("ordem")
		if (varErr) throw new Error(varErr.message)

		for (const v of variants ?? []) {
			const { id: oldVariantId, uniform_id: _vu, ...vrest } = v
			const { data: newVariant, error: newVarErr } = await supabase
				.from("uniform_variant")
				.insert({ ...vrest, uniform_id: clone.id })
				.select("id")
				.single()
			if (newVarErr) throw new Error(newVarErr.message)

			const { data: comp, error: compErr } = await supabase.from("uniform_variant_piece").select("*").eq("variant_id", oldVariantId).order("ordem")
			if (compErr) throw new Error(compErr.message)
			if (comp && comp.length > 0) {
				const rows = comp.map(({ id: _pid, variant_id: _vid, ...prest }) => ({ ...prest, variant_id: newVariant.id }))
				const { error } = await supabase.from("uniform_variant_piece").insert(rows)
				if (error) throw new Error(error.message)
			}
		}

		return clone
	})

export const setUniformCategoriesFn = createServerFn({ method: "POST" })
	.validator(z.object({ uniformId: z.string().uuid(), categorias: z.array(CATEGORIA) }))
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
	.validator(
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
		const supabase = getRumaerServerClient()
		// Sempre que o payload mexe na imagem base (troca p/ outro path OU limpa com null), o arquivo
		// antigo vira órfão — remover. `undefined` = payload não toca na imagem (ex.: edita só círculo);
		// nesse caso não buscamos nem removemos nada.
		let oldPath: string | null = null
		if (data.id && data.image_path !== undefined) {
			const { data: existing } = await supabase.from("uniform_variant").select("image_path").eq("id", data.id).maybeSingle()
			oldPath = existing?.image_path ?? null
		}
		const { data: row, error } = await supabase.from("uniform_variant").upsert(data).select("*").single()
		if (error) throw new Error(error.message)
		if (oldPath && oldPath !== data.image_path) await removeStorageObjects([oldPath])
		return row
	})

export const deleteVariantFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const supabase = getRumaerServerClient()
		// Coleta os paths (imagem base + alternativas) antes de deletar a variante para limpar o storage.
		const { data: variant } = await supabase
			.from("uniform_variant")
			.select("image_path, images:uniform_variant_image(image_path)")
			.eq("id", data.id)
			.maybeSingle()
		const { error } = await supabase.from("uniform_variant").delete().eq("id", data.id)
		if (error) throw new Error(error.message)
		await removeStorageObjects([variant?.image_path, ...(variant?.images ?? []).map((img) => img.image_path)])
		return { ok: true }
	})

/** Limpa apenas a imagem base da variante (path → null + remove do storage), sem apagar a variante. */
export const clearVariantImageFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const supabase = getRumaerServerClient()
		const { data: existing } = await supabase.from("uniform_variant").select("image_path").eq("id", data.id).maybeSingle()
		const { error } = await supabase.from("uniform_variant").update({ image_path: null }).eq("id", data.id)
		if (error) throw new Error(error.message)
		await removeStorageObjects([existing?.image_path])
		return { ok: true }
	})

// ------------------------------------------------------------------ piece ----
export const upsertPieceFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			id: z.string().uuid().optional(),
			nome: z.string().min(1),
			slug: z.string().min(1),
			tipo: TIPO_PECA.nullable().optional(),
			codigo: z.string().nullable().optional(),
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
	.validator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { error } = await getRumaerServerClient().from("piece").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)
		if (error) throw new Error(error.message)
		return { ok: true }
	})

// ------------------------------------------------------------- piece_item ----
export const upsertPieceItemFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			id: z.string().uuid().optional(),
			piece_id: z.string().uuid(),
			nome: z.string().min(1),
			tamanho: z.string().nullable().optional(),
			cor: z.string().nullable().optional(),
			posto: z.string().nullable().optional(),
			quadro: z.string().nullable().optional(),
			especialidade: z.string().nullable().optional(),
			genero: GENERO.nullable().optional(),
		})
	)
	.handler(async ({ data }): Promise<PieceItem> => {
		await requireAuth()
		const { data: row, error } = await getRumaerServerClient().from("piece_item").upsert(data).select("*").single()
		if (error) throw new Error(error.message)
		return row
	})

export const deletePieceItemFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { error } = await getRumaerServerClient().from("piece_item").update({ deleted_at: new Date().toISOString() }).eq("id", data.id)
		if (error) throw new Error(error.message)
		return { ok: true }
	})

// --------------------------------------------------------- variant pieces ----
export const setVariantPiecesFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			variantId: z.string().uuid(),
			pieces: z.array(
				z.object({
					piece_id: z.string().uuid(),
					piece_item_id: z.string().uuid().nullable().optional(),
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

// Adiciona UMA peça a VÁRIAS variantes de uma vez (anexa ao fim da composição de cada).
export const addPieceToVariantsFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			variantIds: z.array(z.string().uuid()).min(1),
			piece_id: z.string().uuid(),
			piece_item_id: z.string().uuid().nullable().optional(),
			obrigatoriedade: OBRIGATORIEDADE,
			observacao: z.string().nullable().optional(),
		})
	)
	.handler(async ({ data }) => {
		await requireAuth()
		const supabase = getRumaerServerClient()

		// próxima ordem por variante (anexa ao fim, sem tocar nas peças existentes)
		const { data: existing, error: exErr } = await supabase.from("uniform_variant_piece").select("variant_id, ordem").in("variant_id", data.variantIds)
		if (exErr) throw new Error(exErr.message)
		const nextOrdem = new Map<string, number>()
		for (const r of existing ?? []) nextOrdem.set(r.variant_id, Math.max(nextOrdem.get(r.variant_id) ?? -1, r.ordem))

		const rows = data.variantIds.map((variant_id) => ({
			variant_id,
			piece_id: data.piece_id,
			piece_item_id: data.piece_item_id ?? null,
			obrigatoriedade: data.obrigatoriedade,
			observacao: data.observacao ?? null,
			ordem: (nextOrdem.get(variant_id) ?? -1) + 1,
		}))
		const { error } = await supabase.from("uniform_variant_piece").insert(rows)
		if (error) throw new Error(error.message)
		return { ok: true, count: rows.length }
	})

// Lista TODAS as variantes de todos os uniformes (não-deletados), com o contexto
// do uniforme — para o modal de "adicionar peça em lote" global no dashboard.
export type AllVariantsItem = {
	id: string
	uniform_id: string
	circulo: UniformVariant["circulo"]
	genero: UniformVariant["genero"]
	sub_variacao: string | null
	uniform: { numero: number | null; letra: string | null; nome: string; grupo: Uniform["grupo"]; ordem: number }
}

export const listAllVariantsFn = createServerFn({ method: "GET" }).handler(async (): Promise<AllVariantsItem[]> => {
	await requireAuth()
	const { data, error } = await getRumaerServerClient()
		.from("uniform_variant")
		.select("id, uniform_id, circulo, genero, sub_variacao, uniform:uniform!inner(numero, letra, nome, grupo, ordem, deleted_at)")
		.is("uniform.deleted_at", null)
		.order("ordem", { ascending: true })

	if (error) throw new Error(error.message)
	const rows = (data ?? []) as unknown as (AllVariantsItem & { uniform: AllVariantsItem["uniform"] & { deleted_at: string | null } })[]
	// Ordena por (ordem do uniforme, depois pela ordem da variante já aplicada acima é por uniform.ordem;
	// agrupamento no cliente usa uniform_id) — ordena estável por uniforme.
	return rows
		.map(({ uniform: { deleted_at: _d, ...uniform }, ...rest }) => ({ ...rest, uniform }))
		.sort((a, b) => a.uniform.ordem - b.uniform.ordem || a.uniform_id.localeCompare(b.uniform_id))
})

// --------------------------------------------------- variant alt images ----
// Imagem alternativa de uma variante atrelada a uma peça facultativa/eventual.
export const upsertVariantImageFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			variant_id: z.string().uuid(),
			piece_id: z.string().uuid(),
			image_path: z.string().min(1),
			legenda: z.string().nullable().optional(),
		})
	)
	.handler(async ({ data }): Promise<UniformVariantImage> => {
		await requireAuth()
		const supabase = getRumaerServerClient()
		// Ao trocar a imagem alternativa: remove o arquivo antigo se o path mudou (órfão).
		const { data: existing } = await supabase
			.from("uniform_variant_image")
			.select("image_path")
			.eq("variant_id", data.variant_id)
			.eq("piece_id", data.piece_id)
			.maybeSingle()
		const { data: row, error } = await supabase.from("uniform_variant_image").upsert(data, { onConflict: "variant_id,piece_id" }).select("*").single()
		if (error) throw new Error(error.message)
		if (existing?.image_path && existing.image_path !== data.image_path) await removeStorageObjects([existing.image_path])
		return row
	})

export const deleteVariantImageFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const supabase = getRumaerServerClient()
		const { data: existing } = await supabase.from("uniform_variant_image").select("image_path").eq("id", data.id).maybeSingle()
		const { error } = await supabase.from("uniform_variant_image").delete().eq("id", data.id)
		if (error) throw new Error(error.message)
		await removeStorageObjects([existing?.image_path])
		return { ok: true }
	})
