/**
 * @module workspace.fn
 * Área de trabalho da seção (checklist mensal, avisos, nota livre) e referência de
 * Unidades Gestoras — persistidos no schema `sucont`. Antes viviam só em localStorage
 * (por-browser); agora são dados compartilhados da seção.
 *
 * Leitura exige `sucont` nível 1; escrita, nível 2 (requireSucontEditor).
 */

import type { ChecklistItem, Notice, UnidadeGestora } from "@iefa/database/sucont"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireSucontAccess, requireSucontEditor } from "#/lib/auth.server"
import { getSucontServerClient } from "#/lib/supabase.server"

// ── Checklist ─────────────────────────────────────────────────────────────────
export const listChecklistFn = createServerFn({ method: "GET" }).handler(async (): Promise<ChecklistItem[]> => {
	await requireSucontAccess()
	const { data, error } = await getSucontServerClient()
		.from("checklist_item")
		.select("*")
		.order("sort_order", { ascending: true })
		.order("created_at", { ascending: true })
	if (error) throw new Error(error.message)
	return data ?? []
})

export const createChecklistItemFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			task: z.string().min(1),
			deadline: z.string().optional(),
			description: z.string().optional(),
			responsible: z.string().optional(),
			path: z.string().optional(),
		})
	)
	.handler(async ({ data }): Promise<ChecklistItem> => {
		await requireSucontEditor()
		const { data: row, error } = await getSucontServerClient()
			.from("checklist_item")
			.insert({
				task: data.task,
				deadline: data.deadline ?? "Mensal",
				description: data.description ?? "",
				responsible: data.responsible ?? "Pendente",
				path: data.path || null,
				sort_order: 999,
			})
			.select("*")
			.single()
		if (error) throw new Error(error.message)
		return row
	})

export const updateChecklistResponsibleFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().uuid(), responsible: z.string() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireSucontEditor()
		const { error } = await getSucontServerClient().from("checklist_item").update({ responsible: data.responsible }).eq("id", data.id)
		if (error) throw new Error(error.message)
		return { ok: true }
	})

export const deleteChecklistItemFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireSucontEditor()
		const { error } = await getSucontServerClient().from("checklist_item").delete().eq("id", data.id)
		if (error) throw new Error(error.message)
		return { ok: true }
	})

// ── Avisos ────────────────────────────────────────────────────────────────────
export const listNoticesFn = createServerFn({ method: "GET" }).handler(async (): Promise<Notice[]> => {
	await requireSucontAccess()
	const { data, error } = await getSucontServerClient().from("notice").select("*").order("created_at", { ascending: false })
	if (error) throw new Error(error.message)
	return data ?? []
})

export const createNoticeFn = createServerFn({ method: "POST" })
	.validator(z.object({ content: z.string().min(1), type: z.enum(["info", "alert"]) }))
	.handler(async ({ data }): Promise<Notice> => {
		await requireSucontEditor()
		const { data: row, error } = await getSucontServerClient()
			.from("notice")
			.insert({ content: data.content, type: data.type, date: new Date().toLocaleDateString("pt-BR") })
			.select("*")
			.single()
		if (error) throw new Error(error.message)
		return row
	})

export const deleteNoticeFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireSucontEditor()
		const { error } = await getSucontServerClient().from("notice").delete().eq("id", data.id)
		if (error) throw new Error(error.message)
		return { ok: true }
	})

// ── Nota livre (singleton) ────────────────────────────────────────────────────
export const getWorkspaceNoteFn = createServerFn({ method: "GET" }).handler(async (): Promise<string> => {
	await requireSucontAccess()
	const { data, error } = await getSucontServerClient().from("workspace_note").select("content").eq("id", 1).maybeSingle()
	if (error) throw new Error(error.message)
	return data?.content ?? ""
})

export const saveWorkspaceNoteFn = createServerFn({ method: "POST" })
	.validator(z.object({ content: z.string() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		const ctx = await requireSucontEditor()
		const { error } = await getSucontServerClient().from("workspace_note").upsert({ id: 1, content: data.content, updated_by: ctx.userId })
		if (error) throw new Error(error.message)
		return { ok: true }
	})

// ── Referência: Unidades Gestoras ─────────────────────────────────────────────
export const listUnidadesGestorasFn = createServerFn({ method: "GET" }).handler(async (): Promise<UnidadeGestora[]> => {
	await requireSucontAccess()
	const { data, error } = await getSucontServerClient().from("unidade_gestora").select("*").order("codigo", { ascending: true })
	if (error) throw new Error(error.message)
	return data ?? []
})
