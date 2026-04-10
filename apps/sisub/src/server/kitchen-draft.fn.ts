import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { DraftWithSelections, KitchenAtaDraft } from "@/types/domain/ata"

const TemplateSelectionSchema = z.object({
	templateId: z.string(),
	templateName: z.string(),
	repetitions: z.number().min(1),
})

// ─── Listar rascunhos da cozinha ──────────────────────────────────────────────

export const fetchKitchenDraftsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ kitchenId: z.number() }))
	.handler(async ({ data }): Promise<DraftWithSelections[]> => {
		const { data: drafts, error } = await getSupabaseServerClient()
			.from("kitchen_ata_draft")
			.select(
				`
        *,
        selections:kitchen_ata_draft_selection (
          *,
          template:template_id ( id, name, template_type )
        )
      `
			)
			.eq("kitchen_id", data.kitchenId)
			.order("created_at", { ascending: false })

		if (error) throw new Error(`Erro ao buscar rascunhos: ${error.message}`)
		// biome-ignore lint/suspicious/noExplicitAny: relation shape differs from generated types
		return (drafts as any) || []
	})

// ─── Buscar rascunho enviado pendente para a cozinha ──────────────────────────

export const fetchPendingDraftFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ kitchenId: z.number() }))
	.handler(async ({ data }): Promise<DraftWithSelections | null> => {
		const { data: draft, error } = await getSupabaseServerClient()
			.from("kitchen_ata_draft")
			.select(
				`
        *,
        selections:kitchen_ata_draft_selection (
          *,
          template:template_id ( id, name, template_type )
        )
      `
			)
			.eq("kitchen_id", data.kitchenId)
			.eq("status", "sent")
			.order("created_at", { ascending: false })
			.limit(1)
			.maybeSingle()

		if (error) throw new Error(`Erro ao buscar rascunho pendente: ${error.message}`)
		// biome-ignore lint/suspicious/noExplicitAny: relation shape differs from generated types
		return (draft as any) || null
	})

// ─── Criar rascunho ───────────────────────────────────────────────────────────

export const createKitchenDraftFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			kitchenId: z.number(),
			title: z.string().min(1),
			notes: z.string().optional(),
			selections: z.array(TemplateSelectionSchema),
		})
	)
	.handler(async ({ data }): Promise<KitchenAtaDraft> => {
		const supabase = getSupabaseServerClient()

		const { data: draft, error: draftError } = await supabase
			.from("kitchen_ata_draft")
			.insert({
				kitchen_id: data.kitchenId,
				title: data.title,
				notes: data.notes || null,
				status: "pending",
			})
			.select()
			.single()

		if (draftError) throw new Error(`Erro ao criar rascunho: ${draftError.message}`)

		if (data.selections.length > 0) {
			const rows = data.selections.map((s) => ({
				draft_id: draft.id,
				template_id: s.templateId,
				repetitions: s.repetitions,
			}))
			const { error: selError } = await supabase.from("kitchen_ata_draft_selection").insert(rows)
			if (selError) {
				await supabase.from("kitchen_ata_draft").delete().eq("id", draft.id)
				throw new Error(`Erro ao salvar seleções do rascunho: ${selError.message}`)
			}
		}

		return draft
	})

// ─── Atualizar rascunho ───────────────────────────────────────────────────────

export const updateKitchenDraftFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			draftId: z.string(),
			updates: z.object({
				title: z.string().min(1).optional(),
				notes: z.string().optional().nullable(),
			}),
			selections: z.array(TemplateSelectionSchema).optional(),
		})
	)
	.handler(async ({ data }): Promise<KitchenAtaDraft> => {
		const supabase = getSupabaseServerClient()

		const { data: draft, error } = await supabase
			.from("kitchen_ata_draft")
			.update({ ...data.updates, updated_at: new Date().toISOString() })
			.eq("id", data.draftId)
			.select()
			.single()

		if (error) throw new Error(`Erro ao atualizar rascunho: ${error.message}`)

		if (data.selections !== undefined) {
			await supabase.from("kitchen_ata_draft_selection").delete().eq("draft_id", data.draftId)

			if (data.selections.length > 0) {
				const rows = data.selections.map((s) => ({
					draft_id: data.draftId,
					template_id: s.templateId,
					repetitions: s.repetitions,
				}))
				const { error: selError } = await supabase.from("kitchen_ata_draft_selection").insert(rows)
				if (selError) throw new Error(`Erro ao atualizar seleções: ${selError.message}`)
			}
		}

		return draft
	})

// ─── Enviar rascunho para a gestão ───────────────────────────────────────────

export const sendKitchenDraftFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ draftId: z.string() }))
	.handler(async ({ data }): Promise<void> => {
		const { error } = await getSupabaseServerClient()
			.from("kitchen_ata_draft")
			.update({ status: "sent", updated_at: new Date().toISOString() })
			.eq("id", data.draftId)
		if (error) throw new Error(`Erro ao enviar rascunho: ${error.message}`)
	})

// ─── Deletar rascunho ─────────────────────────────────────────────────────────

export const deleteKitchenDraftFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ draftId: z.string() }))
	.handler(async ({ data }): Promise<void> => {
		const { error } = await getSupabaseServerClient().from("kitchen_ata_draft").delete().eq("id", data.draftId)
		if (error) throw new Error(`Erro ao deletar rascunho: ${error.message}`)
	})
