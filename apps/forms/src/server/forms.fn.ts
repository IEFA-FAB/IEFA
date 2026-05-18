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

export const getOmOptionsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({}))
	.handler(async () => {
		const db = getFormsServerClient()
		const { data, error } = await db.from("om_option").select("id, name").eq("active", true).order("sort_order", { ascending: true })
		if (error) throw new Error(error.message)
		return data
	})

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

		// Always allow new responses — return not_started even if previously submitted
		return { status: "not_started" as const, session: null }
	})

export const getOrCreateResponseSessionFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			questionnaire_id: z.string().uuid(),
			evaluation_type: z.string(),
			om: z.string(),
			secao: z.string(),
		})
	)
	.handler(async ({ data: { questionnaire_id, evaluation_type, om, secao } }) => {
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

		const { data: created, error } = await db
			.from("questionnaire_response")
			.insert({ questionnaire_id, respondent_id: user.id, evaluation_type, om, secao })
			.select()
			.single()
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
		const { data: session, error: sessionError } = await db
			.from("questionnaire_response")
			.select("respondent_id, status, evaluation_type, om, secao")
			.eq("id", id)
			.single()
		if (sessionError) throw new Error(sessionError.message)
		if (session.respondent_id !== user.id || session.status !== "draft") {
			throw new Error("Sem permissão para enviar esta resposta")
		}

		const { data: responses, error: respError } = await db.from("response").select("question_id, value, observation").eq("questionnaire_response_id", id)
		if (respError) throw new Error(respError.message)

		const { data: maxVersion } = await db
			.from("response_version")
			.select("version_number")
			.eq("questionnaire_response_id", id)
			.order("version_number", { ascending: false })
			.limit(1)
			.maybeSingle()

		const versionNumber = (maxVersion?.version_number ?? 0) + 1
		const submittedAt = new Date().toISOString()

		const { error: versionError } = await db.from("response_version").insert({
			questionnaire_response_id: id,
			version_number: versionNumber,
			answers: responses ?? [],
			evaluation_type: session.evaluation_type,
			om: session.om,
			secao: session.secao,
			submitted_at: submittedAt,
		})
		if (versionError) throw new Error(versionError.message)

		const { data, error } = await db
			.from("questionnaire_response")
			.update({ status: "sent", submitted_at: submittedAt, current_version: versionNumber })
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

// ── Response Versioning ─────────────────────────────────────────────────────

export const reopenResponseFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ questionnaire_response_id: z.string().uuid() }))
	.handler(async ({ data: { questionnaire_response_id } }) => {
		const {
			data: { user },
		} = await getAuthenticatedUser()
		if (!user) throw new Error("Não autenticado")

		const db = getFormsServerClient()
		const { data: session, error: sessionError } = await db.from("questionnaire_response").select("*, response(*)").eq("id", questionnaire_response_id).single()
		if (sessionError) throw new Error(sessionError.message)
		if (session.respondent_id !== user.id) throw new Error("Sem permissão")
		if (session.status !== "sent") throw new Error("Resposta não está enviada")

		const { data: existingDraft } = await db
			.from("questionnaire_response")
			.select("id")
			.eq("questionnaire_id", session.questionnaire_id)
			.eq("respondent_id", user.id)
			.eq("status", "draft")
			.maybeSingle()
		if (existingDraft) throw new Error("Você já tem um rascunho em andamento para este questionário")

		const { data, error } = await db
			.from("questionnaire_response")
			.update({ status: "draft", submitted_at: null })
			.eq("id", questionnaire_response_id)
			.select("*, response(*)")
			.single()
		if (error) throw new Error(error.message)
		return data
	})

export const getResponseVersionsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ questionnaire_response_id: z.string().uuid() }))
	.handler(async ({ data: { questionnaire_response_id } }) => {
		const {
			data: { user },
		} = await getAuthenticatedUser()
		if (!user) throw new Error("Não autenticado")

		const db = getFormsServerClient()
		const { data: session, error: sessionError } = await db
			.from("questionnaire_response")
			.select("respondent_id, questionnaire_id")
			.eq("id", questionnaire_response_id)
			.single()
		if (sessionError) throw new Error(sessionError.message)

		const isRespondent = session.respondent_id === user.id
		if (!isRespondent) {
			const { data: q } = await db.from("questionnaire").select("created_by").eq("id", session.questionnaire_id).single()
			const isCreator = q?.created_by === user.id
			if (!isCreator) {
				const { data: viewerRow } = await db
					.from("response_viewer")
					.select("id")
					.eq("questionnaire_id", session.questionnaire_id)
					.eq("viewer_id", user.id)
					.maybeSingle()
				if (!viewerRow) throw new Error("Sem permissão para ver versões")
			}
		}

		const { data, error } = await db
			.from("response_version")
			.select("id, version_number, evaluation_type, om, secao, submitted_at, created_at")
			.eq("questionnaire_response_id", questionnaire_response_id)
			.order("version_number", { ascending: false })
		if (error) throw new Error(error.message)
		return data
	})

export const getResponseVersionFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ version_id: z.string().uuid() }))
	.handler(async ({ data: { version_id } }) => {
		const {
			data: { user },
		} = await getAuthenticatedUser()
		if (!user) throw new Error("Não autenticado")

		const db = getFormsServerClient()
		const { data: version, error } = await db.from("response_version").select("*").eq("id", version_id).single()
		if (error) throw new Error(error.message)

		const { data: session } = await db
			.from("questionnaire_response")
			.select("respondent_id, questionnaire_id")
			.eq("id", version.questionnaire_response_id)
			.single()
		if (!session) throw new Error("Sessão não encontrada")

		const isRespondent = session.respondent_id === user.id
		if (!isRespondent) {
			const { data: q } = await db.from("questionnaire").select("created_by").eq("id", session.questionnaire_id).single()
			const isCreator = q?.created_by === user.id
			if (!isCreator) {
				const { data: viewerRow } = await db
					.from("response_viewer")
					.select("id")
					.eq("questionnaire_id", session.questionnaire_id)
					.eq("viewer_id", user.id)
					.maybeSingle()
				if (!viewerRow) throw new Error("Sem permissão para ver esta versão")
			}
		}

		return version
	})

export const revertToVersionFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ questionnaire_response_id: z.string().uuid(), version_id: z.string().uuid() }))
	.handler(async ({ data: { questionnaire_response_id, version_id } }) => {
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
		if (session.respondent_id !== user.id) throw new Error("Sem permissão")
		if (session.status !== "draft") throw new Error("Resposta precisa estar reaberta para restaurar")

		const { data: version, error: versionError } = await db.from("response_version").select("*").eq("id", version_id).single()
		if (versionError) throw new Error(versionError.message)
		if (version.questionnaire_response_id !== questionnaire_response_id) throw new Error("Versão não pertence a esta sessão")

		const answers = version.answers as Array<{ question_id: string; value: unknown; observation: string | null }>

		const { error: deleteError } = await db.from("response").delete().eq("questionnaire_response_id", questionnaire_response_id)
		if (deleteError) throw new Error(deleteError.message)

		if (answers.length > 0) {
			const rows = answers.map((a) => ({
				questionnaire_response_id,
				question_id: a.question_id,
				value: a.value,
				observation: a.observation,
			}))
			const { error: insertError } = await db.from("response").insert(rows)
			if (insertError) throw new Error(insertError.message)
		}

		return { success: true }
	})

export const getSharedWithMeFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({}))
	.handler(async () => {
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
