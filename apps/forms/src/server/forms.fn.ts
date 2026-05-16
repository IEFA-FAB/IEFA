import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getFormsServerClient, getIefaAuthClient } from "@/lib/supabase.server"

function getAuthenticatedUser() {
	const auth = getIefaAuthClient()
	return auth.auth.getUser()
}

// ── Questionnaire CRUD ───────────────────────────────────────────────────────

export const getQuestionnairesFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ tags: z.array(z.string()).optional() }))
	.handler(async ({ data: { tags } }) => {
		const db = getFormsServerClient()
		let query = db.from("questionnaire").select("*").order("created_at", { ascending: false })
		if (tags?.length) {
			query = query.contains("tags", tags)
		}
		const { data, error } = await query
		if (error) throw new Error(error.message)
		return data
	})

export const getQuestionnaireFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data: { id } }) => {
		const {
			data: { user },
		} = await getAuthenticatedUser()
		if (!user) throw new Error("Não autenticado")

		const db = getFormsServerClient()
		const { data, error } = await db
			.from("questionnaire")
			.select("*, section(*, question(*))")
			.eq("id", id)
			.order("sort_order", { referencedTable: "section", ascending: true })
			.single()
		if (error) throw new Error(error.message)
		if (data.status !== "sent" && data.created_by !== user.id) {
			throw new Error("Sem permissão para acessar este questionário")
		}
		if (data?.section) {
			for (const section of data.section) {
				if (section.question) {
					section.question.sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
				}
			}
		}
		return data
	})

export const createQuestionnaireFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			title: z.string().min(1),
			description: z.string().optional(),
			tags: z
				.array(z.enum(["5s"]))
				.optional()
				.default([]),
		})
	)
	.handler(async ({ data: { title, description, tags } }) => {
		const {
			data: { user },
		} = await getAuthenticatedUser()
		if (!user) throw new Error("Não autenticado")

		const db = getFormsServerClient()
		const { data, error } = await db
			.from("questionnaire")
			.insert({ title, description: description ?? null, created_by: user.id, tags })
			.select()
			.single()
		if (error) throw new Error(error.message)
		return data
	})

export const updateQuestionnaireFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string().uuid(), title: z.string().min(1).optional(), description: z.string().optional() }))
	.handler(async ({ data: { id, ...updates } }) => {
		const db = getFormsServerClient()
		const { data, error } = await db.from("questionnaire").update(updates).eq("id", id).select().single()
		if (error) throw new Error(error.message)
		return data
	})

export const publishQuestionnaireFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data: { id } }) => {
		const db = getFormsServerClient()
		const { data, error } = await db.from("questionnaire").update({ status: "sent" }).eq("id", id).select().single()
		if (error) throw new Error(error.message)
		return data
	})

// ── Section CRUD ──────────────────────────────────────────────────────────────

export const createSectionFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({ questionnaire_id: z.string().uuid(), title: z.string().min(1), description: z.string().optional(), sort_order: z.number().int().optional() })
	)
	.handler(async ({ data }) => {
		const db = getFormsServerClient()
		const { data: section, error } = await db.from("section").insert(data).select().single()
		if (error) throw new Error(error.message)
		return section
	})

export const updateSectionFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string().uuid(), title: z.string().min(1).optional(), description: z.string().optional() }))
	.handler(async ({ data: { id, ...updates } }) => {
		const db = getFormsServerClient()
		const { data, error } = await db.from("section").update(updates).eq("id", id).select().single()
		if (error) throw new Error(error.message)
		return data
	})

export const deleteSectionFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data: { id } }) => {
		const db = getFormsServerClient()
		const { error } = await db.from("section").delete().eq("id", id)
		if (error) throw new Error(error.message)
	})

export const reorderSectionsFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ items: z.array(z.object({ id: z.string().uuid(), sort_order: z.number().int() })) }))
	.handler(async ({ data: { items } }) => {
		const db = getFormsServerClient()
		for (const item of items) {
			const { error } = await db.from("section").update({ sort_order: item.sort_order }).eq("id", item.id)
			if (error) throw new Error(error.message)
		}
	})

// ── Question CRUD ─────────────────────────────────────────────────────────────

export const createQuestionFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			section_id: z.string().uuid(),
			text: z.string().min(1),
			description: z.string().optional(),
			type: z.enum(["text", "textarea", "single_choice", "multiple_choice", "number", "date", "scale", "boolean", "conformity"]).optional(),
			options: z.any().optional(),
			required: z.boolean().optional(),
			sort_order: z.number().int().optional(),
		})
	)
	.handler(async ({ data }) => {
		const db = getFormsServerClient()
		const { data: question, error } = await db.from("question").insert(data).select().single()
		if (error) throw new Error(error.message)
		return question
	})

export const updateQuestionFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			id: z.string().uuid(),
			text: z.string().min(1).optional(),
			description: z.string().optional(),
			type: z.enum(["text", "textarea", "single_choice", "multiple_choice", "number", "date", "scale", "boolean", "conformity"]).optional(),
			options: z.any().optional(),
			required: z.boolean().optional(),
		})
	)
	.handler(async ({ data: { id, ...updates } }) => {
		const db = getFormsServerClient()
		const { data, error } = await db.from("question").update(updates).eq("id", id).select().single()
		if (error) throw new Error(error.message)
		return data
	})

export const deleteQuestionFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data: { id } }) => {
		const db = getFormsServerClient()
		const { error } = await db.from("question").delete().eq("id", id)
		if (error) throw new Error(error.message)
	})

export const reorderQuestionsFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ items: z.array(z.object({ id: z.string().uuid(), sort_order: z.number().int() })) }))
	.handler(async ({ data: { items } }) => {
		const db = getFormsServerClient()
		for (const item of items) {
			const { error } = await db.from("question").update({ sort_order: item.sort_order }).eq("id", item.id)
			if (error) throw new Error(error.message)
		}
	})

// ── Response Flow ─────────────────────────────────────────────────────────────

export const getMyResponseStateFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ questionnaire_id: z.string().uuid() }))
	.handler(async ({ data: { questionnaire_id } }) => {
		const {
			data: { user },
		} = await getAuthenticatedUser()
		if (!user) throw new Error("Não autenticado")

		const db = getFormsServerClient()
		const baseQuery = db.from("questionnaire_response").select("*, response(*)").eq("questionnaire_id", questionnaire_id).eq("respondent_id", user.id)

		const { data: draft, error: draftError } = await baseQuery.eq("status", "draft").maybeSingle()
		if (draftError) throw new Error(draftError.message)
		if (draft) {
			return { status: "draft" as const, session: draft }
		}

		const { data: submitted, error: submittedError } = await db
			.from("questionnaire_response")
			.select("*, response(*)")
			.eq("questionnaire_id", questionnaire_id)
			.eq("respondent_id", user.id)
			.eq("status", "sent")
			.order("submitted_at", { ascending: false })
			.limit(1)
			.maybeSingle()
		if (submittedError) throw new Error(submittedError.message)
		if (submitted) {
			return { status: "submitted" as const, session: submitted }
		}

		return { status: "not_started" as const, session: null }
	})

export const getOrCreateResponseSessionFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ questionnaire_id: z.string().uuid() }))
	.handler(async ({ data: { questionnaire_id } }) => {
		const {
			data: { user },
		} = await getAuthenticatedUser()
		if (!user) throw new Error("Não autenticado")

		const db = getFormsServerClient()

		const { data: existing } = await db
			.from("questionnaire_response")
			.select("*")
			.eq("questionnaire_id", questionnaire_id)
			.eq("respondent_id", user.id)
			.eq("status", "draft")
			.maybeSingle()

		if (existing) return existing

		const { data: submitted } = await db
			.from("questionnaire_response")
			.select("*")
			.eq("questionnaire_id", questionnaire_id)
			.eq("respondent_id", user.id)
			.eq("status", "sent")
			.order("submitted_at", { ascending: false })
			.limit(1)
			.maybeSingle()
		if (submitted) throw new Error("Questionário já respondido")

		const { data: created, error } = await db.from("questionnaire_response").insert({ questionnaire_id, respondent_id: user.id }).select().single()
		if (error) throw new Error(error.message)
		return created
	})

export const saveAnswerFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			questionnaire_response_id: z.string().uuid(),
			question_id: z.string().uuid(),
			value: z.any(),
			observation: z.string().nullable().optional(),
		})
	)
	.handler(async ({ data: { questionnaire_response_id, question_id, value, observation } }) => {
		const {
			data: { user },
		} = await getAuthenticatedUser()
		if (!user) throw new Error("Não autenticado")

		const db = getFormsServerClient()
		const { data: session, error: sessionError } = await db
			.from("questionnaire_response")
			.select("respondent_id, status")
			.eq("id", questionnaire_response_id)
			.single()
		if (sessionError) throw new Error(sessionError.message)
		if (session.respondent_id !== user.id || session.status !== "draft") {
			throw new Error("Sem permissão para alterar esta resposta")
		}

		const { data, error } = await db
			.from("response")
			.upsert(
				{
					questionnaire_response_id,
					question_id,
					value,
					observation: observation ?? null,
				},
				{ onConflict: "questionnaire_response_id,question_id" }
			)
			.select()
			.single()
		if (error) throw new Error(error.message)
		return data
	})

export const submitResponseFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data: { id } }) => {
		const {
			data: { user },
		} = await getAuthenticatedUser()
		if (!user) throw new Error("Não autenticado")

		const db = getFormsServerClient()
		const { data: session, error: sessionError } = await db.from("questionnaire_response").select("respondent_id, status").eq("id", id).single()
		if (sessionError) throw new Error(sessionError.message)
		if (session.respondent_id !== user.id || session.status !== "draft") {
			throw new Error("Sem permissão para enviar esta resposta")
		}

		const { data, error } = await db
			.from("questionnaire_response")
			.update({ status: "sent", submitted_at: new Date().toISOString() })
			.eq("id", id)
			.select()
			.single()
		if (error) throw new Error(error.message)
		return data
	})

export const getDraftResponseFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ questionnaire_id: z.string().uuid() }))
	.handler(async ({ data: { questionnaire_id } }) => {
		const {
			data: { user },
		} = await getAuthenticatedUser()
		if (!user) throw new Error("Não autenticado")

		const db = getFormsServerClient()
		const { data } = await db
			.from("questionnaire_response")
			.select("*, response(*)")
			.eq("questionnaire_id", questionnaire_id)
			.eq("respondent_id", user.id)
			.eq("status", "draft")
			.maybeSingle()

		return data
	})

export const getResponsesFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ questionnaire_id: z.string().uuid() }))
	.handler(async ({ data: { questionnaire_id } }) => {
		const {
			data: { user },
		} = await getAuthenticatedUser()
		if (!user) throw new Error("Não autenticado")

		const db = getFormsServerClient()

		const { data: q } = await db.from("questionnaire").select("created_by").eq("id", questionnaire_id).single()
		if (!q) throw new Error("Questionário não encontrado")

		if (q.created_by !== user.id) {
			const { data: viewerRow } = await db.from("response_viewer").select("id").eq("questionnaire_id", questionnaire_id).eq("viewer_id", user.id).maybeSingle()
			if (!viewerRow) throw new Error("Sem permissão para visualizar as respostas")
		}

		const { data, error } = await db
			.from("questionnaire_response")
			.select("*, response(*)")
			.eq("questionnaire_id", questionnaire_id)
			.eq("status", "sent")
			.order("submitted_at", { ascending: false })
		if (error) throw new Error(error.message)
		return data
	})

// ── Response Viewers ──────────────────────────────────────────────────────────

export const getViewersFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ questionnaire_id: z.string().uuid() }))
	.handler(async ({ data: { questionnaire_id } }) => {
		const {
			data: { user },
		} = await getAuthenticatedUser()
		if (!user) throw new Error("Não autenticado")

		const db = getFormsServerClient()

		const { data: q } = await db.from("questionnaire").select("created_by").eq("id", questionnaire_id).single()
		if (!q || q.created_by !== user.id) return null

		const { data, error } = await db.from("response_viewer").select("*").eq("questionnaire_id", questionnaire_id).order("created_at", { ascending: true })
		if (error) throw new Error(error.message)
		return data ?? []
	})

export const addViewerFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ questionnaire_id: z.string().uuid(), email: z.string().email() }))
	.handler(async ({ data: { questionnaire_id, email } }) => {
		const {
			data: { user },
		} = await getAuthenticatedUser()
		if (!user) throw new Error("Não autenticado")

		const db = getFormsServerClient()

		const { data: q } = await db.from("questionnaire").select("created_by").eq("id", questionnaire_id).single()
		if (!q || q.created_by !== user.id) throw new Error("Sem permissão")

		const normalizedEmail = email.toLowerCase().trim()
		const { data: viewerUserId, error: lookupError } = await db.rpc("lookup_user_id_by_email", { p_email: normalizedEmail })
		if (lookupError) throw new Error(lookupError.message)
		if (!viewerUserId) throw new Error("Usuário não encontrado com esse email")
		if (viewerUserId === user.id) throw new Error("Você já é o criador do questionário")

		const { data, error } = await db
			.from("response_viewer")
			.insert({ questionnaire_id, viewer_id: viewerUserId, viewer_email: normalizedEmail, added_by: user.id })
			.select()
			.single()
		if (error) {
			if (error.code === "23505") throw new Error("Este usuário já é um visualizador")
			throw new Error(error.message)
		}
		return data
	})

export const removeViewerFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string().uuid(), questionnaire_id: z.string().uuid() }))
	.handler(async ({ data: { id, questionnaire_id } }) => {
		const {
			data: { user },
		} = await getAuthenticatedUser()
		if (!user) throw new Error("Não autenticado")

		const db = getFormsServerClient()

		const { data: q } = await db.from("questionnaire").select("created_by").eq("id", questionnaire_id).single()
		if (!q || q.created_by !== user.id) throw new Error("Sem permissão")

		const { error } = await db.from("response_viewer").delete().eq("id", id)
		if (error) throw new Error(error.message)
	})

export const getSharedWithMeFn = createServerFn({ method: "GET" }).handler(async () => {
	const {
		data: { user },
	} = await getAuthenticatedUser()
	if (!user) throw new Error("Não autenticado")

	const db = getFormsServerClient()

	const { data: viewerRows, error: viewerError } = await db.from("response_viewer").select("questionnaire_id").eq("viewer_id", user.id)
	if (viewerError) throw new Error(viewerError.message)
	if (!viewerRows || viewerRows.length === 0) return []

	const ids = viewerRows.map((r) => r.questionnaire_id)
	const { data, error } = await db.from("questionnaire").select("*").in("id", ids).order("created_at", { ascending: false })
	if (error) throw new Error(error.message)
	return data ?? []
})
