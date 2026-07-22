import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { forbidden, requireUser, requireUserId } from "@/lib/auth.server"
import {
	buildBindingsFromPolicyInput,
	filterResponsesByViewerPolicy,
	isOmScopeable,
	matchesViewerPolicy,
	normalizeScopeValue,
	parseResponseMetadataConfig,
	type ResponseMetadataConfig,
	type ViewerPolicy,
	type ViewerScopeBinding,
	type ViewerScopeMode,
	validateViewerPolicyInput,
} from "@/lib/response-visibility-policy"
import { getFormsServerClient } from "@/lib/supabase.server"

type FormsDbClient = ReturnType<typeof getFormsServerClient>

type QuestionnaireAccess = {
	questionnaireId: string
	createdBy: string | null
	isCreator: boolean
	isEditor: boolean
	canEdit: boolean
}

type ResponseVisibilityAccess = {
	questionnaireAccess: QuestionnaireAccess
	metadataConfig: ResponseMetadataConfig
	viewerPolicy: ViewerPolicy | null
	canViewResponses: boolean
	canViewAllResponses: boolean
	canManageViewers: boolean
}

const responseMetadataConfigSchema = z
	.object({
		om: z
			.object({
				scopeable: z.boolean().optional(),
			})
			.optional(),
	})
	.optional()

const viewerPolicySchema = z
	.object({
		om: z
			.object({
				allow: z.array(z.string()).optional(),
				deny: z.array(z.string()).optional(),
			})
			.optional(),
	})
	.optional()

async function getQuestionnaireAccessFromRow(
	db: FormsDbClient,
	questionnaireId: string,
	createdBy: string | null,
	userId: string
): Promise<QuestionnaireAccess> {
	const isCreator = createdBy != null && createdBy === userId
	if (isCreator) {
		return { questionnaireId, createdBy, isCreator: true, isEditor: false, canEdit: true }
	}

	if (!createdBy) {
		return { questionnaireId, createdBy, isCreator: false, isEditor: false, canEdit: false }
	}

	const { data: editorRow, error } = await db
		.from("questionnaire_editor")
		.select("id")
		.eq("questionnaire_id", questionnaireId)
		.eq("editor_id", userId)
		.maybeSingle()
	if (error) throw new Error(error.message)

	const isEditor = Boolean(editorRow)
	return { questionnaireId, createdBy, isCreator: false, isEditor, canEdit: isEditor }
}

async function getQuestionnaireAccess(db: FormsDbClient, questionnaireId: string, userId: string) {
	const { data: questionnaire, error } = await db.from("questionnaire").select("id, created_by").eq("id", questionnaireId).single()
	if (error) throw new Error(error.message)
	return getQuestionnaireAccessFromRow(db, questionnaire.id, questionnaire.created_by, userId)
}

async function requireQuestionnaireCreatorAccess(db: FormsDbClient, questionnaireId: string, userId: string) {
	const access = await getQuestionnaireAccess(db, questionnaireId, userId)
	if (!access.isCreator) forbidden()
	return access
}

async function requireQuestionnaireEditAccess(db: FormsDbClient, questionnaireId: string, userId: string) {
	const access = await getQuestionnaireAccess(db, questionnaireId, userId)
	if (!access.canEdit) forbidden()
	return access
}

async function requireQuestionnaireViewerManagementAccess(db: FormsDbClient, questionnaireId: string, userId: string) {
	const access = await getQuestionnaireAccess(db, questionnaireId, userId)
	if (!access.canEdit) forbidden()
	return access
}

async function getQuestionnaireIdBySectionId(db: FormsDbClient, sectionId: string) {
	const { data, error } = await db.from("section").select("questionnaire_id").eq("id", sectionId).single()
	if (error) throw new Error(error.message)
	return data.questionnaire_id
}

async function getQuestionnaireIdByQuestionId(db: FormsDbClient, questionId: string) {
	const { data, error } = await db.from("question").select("section_id").eq("id", questionId).single()
	if (error) throw new Error(error.message)
	return getQuestionnaireIdBySectionId(db, data.section_id)
}

async function getViewerBindings(db: FormsDbClient, responseViewerId: string): Promise<ViewerScopeBinding[]> {
	const { data, error } = await db
		.from("response_viewer_scope_binding")
		.select("id, attribute_key, effect, value")
		.eq("response_viewer_id", responseViewerId)
		.order("created_at", { ascending: true })
	if (error) throw new Error(error.message)
	return (data ?? []) as ViewerScopeBinding[]
}

async function resolveResponseVisibilityAccess(db: FormsDbClient, questionnaireId: string, userId: string): Promise<ResponseVisibilityAccess> {
	const { data: questionnaire, error } = await db.from("questionnaire").select("id, created_by, response_metadata_config").eq("id", questionnaireId).single()
	if (error) throw new Error(error.message)

	const questionnaireAccess = await getQuestionnaireAccessFromRow(db, questionnaire.id, questionnaire.created_by, userId)
	const metadataConfig = parseResponseMetadataConfig(questionnaire.response_metadata_config)
	if (questionnaireAccess.isCreator) {
		return {
			questionnaireAccess,
			metadataConfig,
			viewerPolicy: null,
			canViewResponses: true,
			canViewAllResponses: true,
			canManageViewers: true,
		}
	}

	const { data: viewerRow, error: viewerError } = await db
		.from("response_viewer")
		.select("id, scope_mode")
		.eq("questionnaire_id", questionnaireId)
		.eq("viewer_id", userId)
		.maybeSingle()
	if (viewerError) throw new Error(viewerError.message)

	if (!viewerRow) {
		return {
			questionnaireAccess,
			metadataConfig,
			viewerPolicy: null,
			canViewResponses: false,
			canViewAllResponses: false,
			canManageViewers: questionnaireAccess.canEdit,
		}
	}

	const bindings = await getViewerBindings(db, viewerRow.id)
	const viewerPolicy: ViewerPolicy = {
		scope_mode: viewerRow.scope_mode as ViewerScopeMode,
		bindings,
	}

	return {
		questionnaireAccess,
		metadataConfig,
		viewerPolicy,
		canViewResponses: true,
		canViewAllResponses: viewerPolicy.scope_mode === "global",
		canManageViewers: questionnaireAccess.canEdit,
	}
}

function buildDefaultResponseMetadataConfig(tags: string[], requested?: ResponseMetadataConfig) {
	if (requested) return requested
	if (tags.includes("5s")) {
		return { om: { scopeable: true } }
	}
	return {}
}

async function assertQuestionnaireCanDisableOmScope(db: FormsDbClient, questionnaireId: string) {
	const { data: scopedViewer, error } = await db
		.from("response_viewer")
		.select("id")
		.eq("questionnaire_id", questionnaireId)
		.eq("scope_mode", "scoped")
		.limit(1)
		.maybeSingle()
	if (error) throw new Error(error.message)
	if (scopedViewer) {
		throw new Error("Converta ou remova os visualizadores escopados antes de desativar a segmentação por OM")
	}
}

async function replaceViewerPolicyBindings(db: FormsDbClient, responseViewerId: string, bindings: ViewerScopeBinding[]) {
	const { error: deleteError } = await db.from("response_viewer_scope_binding").delete().eq("response_viewer_id", responseViewerId)
	if (deleteError) throw new Error(deleteError.message)

	if (bindings.length === 0) return

	const { error: insertError } = await db.from("response_viewer_scope_binding").insert(
		bindings.map((binding) => ({
			response_viewer_id: responseViewerId,
			attribute_key: binding.attribute_key,
			effect: binding.effect,
			value: binding.value,
		}))
	)
	if (insertError) throw new Error(insertError.message)
}

async function getViewerPolicyListForQuestionnaire(db: FormsDbClient, questionnaireId: string) {
	const { data: viewers, error } = await db.from("response_viewer").select("*").eq("questionnaire_id", questionnaireId).order("created_at", { ascending: true })
	if (error) throw new Error(error.message)

	const viewerIds = (viewers ?? []).map((viewer) => viewer.id)
	const bindingMap = new Map<string, ViewerScopeBinding[]>()
	if (viewerIds.length > 0) {
		const { data: bindings, error: bindingsError } = await db
			.from("response_viewer_scope_binding")
			.select("id, response_viewer_id, attribute_key, effect, value")
			.in("response_viewer_id", viewerIds)
			.order("created_at", { ascending: true })
		if (bindingsError) throw new Error(bindingsError.message)

		for (const binding of bindings ?? []) {
			const existing = bindingMap.get(binding.response_viewer_id) ?? []
			existing.push({
				id: binding.id,
				attribute_key: binding.attribute_key as "om",
				effect: binding.effect as "allow" | "deny",
				value: binding.value,
			})
			bindingMap.set(binding.response_viewer_id, existing)
		}
	}

	return (viewers ?? []).map((viewer) => ({
		...viewer,
		bindings: bindingMap.get(viewer.id) ?? [],
	}))
}

async function lookupUserIdByEmail(db: FormsDbClient, email: string) {
	const normalizedEmail = email.toLowerCase().trim()
	const { data: userId, error } = await db.rpc("lookup_user_id_by_email", { p_email: normalizedEmail })
	if (error) throw new Error(error.message)
	return { normalizedEmail, userId }
}

async function getQuestionnairesByIds(db: FormsDbClient, ids: string[], tags?: string[]) {
	if (ids.length === 0) return []

	let query = db.from("questionnaire").select("*").in("id", ids).order("created_at", { ascending: false })
	if (tags?.length) {
		query = query.contains("tags", tags)
	}

	const { data, error } = await query
	if (error) throw new Error(error.message)
	return data ?? []
}

// ── Questionnaire CRUD ───────────────────────────────────────────────────────

export const getQuestionnairesFn = createServerFn({ method: "GET" })
	.validator(z.object({ tags: z.array(z.string()).optional() }))
	.handler(async ({ data: { tags } }) => {
		// Lista todos os questionários da instância (títulos, tags, quem criou). Era o
		// único endpoint do app sem checagem de sessão.
		await requireUserId()
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
	.validator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data: { id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const { data, error } = await db
			.from("questionnaire")
			.select("*, section(*, question(*))")
			.eq("id", id)
			.order("sort_order", { referencedTable: "section", ascending: true })
			.single()
		if (error) throw new Error(error.message)

		const access = await getQuestionnaireAccessFromRow(db, data.id, data.created_by, user.id)
		if (data.status !== "sent" && !access.canEdit) {
			forbidden("Sem permissão para acessar este questionário")
		}
		if (data?.section) {
			for (const section of data.section) {
				if (section.question) {
					section.question.sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
				}
			}
		}
		return { ...data, access }
	})

export const createQuestionnaireFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			title: z.string().min(1),
			description: z.string().optional(),
			tags: z
				.array(z.enum(["5s"]))
				.optional()
				.default([]),
			response_metadata_config: responseMetadataConfigSchema,
		})
	)
	.handler(async ({ data: { title, description, tags, response_metadata_config } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const metadataConfig = buildDefaultResponseMetadataConfig(tags, response_metadata_config)
		const { data, error } = await db
			.from("questionnaire")
			.insert({ title, description: description ?? null, created_by: user.id, tags, response_metadata_config: metadataConfig })
			.select()
			.single()
		if (error) throw new Error(error.message)
		return data
	})

export const updateQuestionnaireFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			id: z.string().uuid(),
			title: z.string().min(1).optional(),
			description: z.string().optional(),
			response_metadata_config: responseMetadataConfigSchema,
		})
	)
	.handler(async ({ data: { id, ...updates } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		await requireQuestionnaireEditAccess(db, id, user.id)
		if (updates.response_metadata_config && !isOmScopeable(updates.response_metadata_config)) {
			await assertQuestionnaireCanDisableOmScope(db, id)
		}
		const { data, error } = await db.from("questionnaire").update(updates).eq("id", id).select().single()
		if (error) throw new Error(error.message)
		return data
	})

export const publishQuestionnaireFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data: { id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		await requireQuestionnaireEditAccess(db, id, user.id)
		const { data, error } = await db.from("questionnaire").update({ status: "sent" }).eq("id", id).select().single()
		if (error) throw new Error(error.message)
		return data
	})

// ── Section CRUD ──────────────────────────────────────────────────────────────

export const createSectionFn = createServerFn({ method: "POST" })
	.validator(
		z.object({ questionnaire_id: z.string().uuid(), title: z.string().min(1), description: z.string().optional(), sort_order: z.number().int().optional() })
	)
	.handler(async ({ data }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		await requireQuestionnaireEditAccess(db, data.questionnaire_id, user.id)
		const { data: section, error } = await db.from("section").insert(data).select().single()
		if (error) throw new Error(error.message)
		return section
	})

export const updateSectionFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().uuid(), title: z.string().min(1).optional(), description: z.string().optional() }))
	.handler(async ({ data: { id, ...updates } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const questionnaireId = await getQuestionnaireIdBySectionId(db, id)
		await requireQuestionnaireEditAccess(db, questionnaireId, user.id)
		const { data, error } = await db.from("section").update(updates).eq("id", id).select().single()
		if (error) throw new Error(error.message)
		return data
	})

export const deleteSectionFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data: { id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const questionnaireId = await getQuestionnaireIdBySectionId(db, id)
		await requireQuestionnaireEditAccess(db, questionnaireId, user.id)
		const { error } = await db.from("section").delete().eq("id", id)
		if (error) throw new Error(error.message)
	})

export const reorderSectionsFn = createServerFn({ method: "POST" })
	.validator(z.object({ items: z.array(z.object({ id: z.string().uuid(), sort_order: z.number().int() })) }))
	.handler(async ({ data: { items } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const validatedQuestionnaires = new Set<string>()
		for (const item of items) {
			const questionnaireId = await getQuestionnaireIdBySectionId(db, item.id)
			if (!validatedQuestionnaires.has(questionnaireId)) {
				await requireQuestionnaireEditAccess(db, questionnaireId, user.id)
				validatedQuestionnaires.add(questionnaireId)
			}
			const { error } = await db.from("section").update({ sort_order: item.sort_order }).eq("id", item.id)
			if (error) throw new Error(error.message)
		}
	})

// ── Question CRUD ─────────────────────────────────────────────────────────────

export const createQuestionFn = createServerFn({ method: "POST" })
	.validator(
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
		const user = await requireUser()

		const db = getFormsServerClient()
		const questionnaireId = await getQuestionnaireIdBySectionId(db, data.section_id)
		await requireQuestionnaireEditAccess(db, questionnaireId, user.id)
		const { data: question, error } = await db.from("question").insert(data).select().single()
		if (error) throw new Error(error.message)
		return question
	})

export const updateQuestionFn = createServerFn({ method: "POST" })
	.validator(
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
		const user = await requireUser()

		const db = getFormsServerClient()
		const questionnaireId = await getQuestionnaireIdByQuestionId(db, id)
		await requireQuestionnaireEditAccess(db, questionnaireId, user.id)
		const { data, error } = await db.from("question").update(updates).eq("id", id).select().single()
		if (error) throw new Error(error.message)
		return data
	})

export const deleteQuestionFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data: { id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const questionnaireId = await getQuestionnaireIdByQuestionId(db, id)
		await requireQuestionnaireEditAccess(db, questionnaireId, user.id)
		const { error } = await db.from("question").delete().eq("id", id)
		if (error) throw new Error(error.message)
	})

export const reorderQuestionsFn = createServerFn({ method: "POST" })
	.validator(z.object({ items: z.array(z.object({ id: z.string().uuid(), sort_order: z.number().int() })) }))
	.handler(async ({ data: { items } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const validatedQuestionnaires = new Set<string>()
		for (const item of items) {
			const questionnaireId = await getQuestionnaireIdByQuestionId(db, item.id)
			if (!validatedQuestionnaires.has(questionnaireId)) {
				await requireQuestionnaireEditAccess(db, questionnaireId, user.id)
				validatedQuestionnaires.add(questionnaireId)
			}
			const { error } = await db.from("question").update({ sort_order: item.sort_order }).eq("id", item.id)
			if (error) throw new Error(error.message)
		}
	})

// ── Response Flow ─────────────────────────────────────────────────────────────

export const getOmOptionsFn = createServerFn({ method: "GET" })
	.validator(z.object({}))
	.handler(async () => {
		// Lista de OMs: dado de referência, mas é a estrutura organizacional da força —
		// não precisa estar aberta a anônimo.
		await requireUserId()
		const db = getFormsServerClient()
		const { data, error } = await db.from("om_option").select("id, name").eq("active", true).order("sort_order", { ascending: true })
		if (error) throw new Error(error.message)
		return data
	})

export const getMyResponseStateFn = createServerFn({ method: "GET" })
	.validator(z.object({ questionnaire_id: z.string().uuid() }))
	.handler(async ({ data: { questionnaire_id } }) => {
		const user = await requireUser()

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
	.validator(
		z.object({
			questionnaire_id: z.string().uuid(),
			evaluation_type: z.string(),
			om: z.string(),
			secao: z.string(),
		})
	)
	.handler(async ({ data: { questionnaire_id, evaluation_type, om, secao } }) => {
		const user = await requireUser()

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
			.insert({ questionnaire_id, respondent_id: user.id, evaluation_type, om: normalizeScopeValue(om), secao })
			.select()
			.single()
		if (error) throw new Error(error.message)
		return created
	})

export const saveAnswerFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			questionnaire_response_id: z.string().uuid(),
			question_id: z.string().uuid(),
			value: z.any(),
			observation: z.string().nullable().optional(),
		})
	)
	.handler(async ({ data: { questionnaire_response_id, question_id, value, observation } }) => {
		const user = await requireUser()

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
	.validator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data: { id } }) => {
		const user = await requireUser()

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
	.validator(z.object({ questionnaire_id: z.string().uuid() }))
	.handler(async ({ data: { questionnaire_id } }) => {
		const user = await requireUser()

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
	.validator(z.object({ questionnaire_id: z.string().uuid() }))
	.handler(async ({ data: { questionnaire_id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const visibilityAccess = await resolveResponseVisibilityAccess(db, questionnaire_id, user.id)
		if (!visibilityAccess.canViewResponses) throw new Error("Sem permissão para visualizar as respostas")

		let query = db.from("questionnaire_response").select("*, response(*)").eq("questionnaire_id", questionnaire_id).eq("status", "sent")
		if (visibilityAccess.viewerPolicy?.scope_mode === "scoped") {
			const allowedOms = visibilityAccess.viewerPolicy.bindings
				.filter((binding) => binding.attribute_key === "om" && binding.effect === "allow")
				.map((binding) => binding.value)
			if (allowedOms.length > 0) {
				query = query.in("om", allowedOms)
			}
		}

		const { data, error } = await query.order("submitted_at", { ascending: false })
		if (error) throw new Error(error.message)
		if (!visibilityAccess.viewerPolicy) return data
		return filterResponsesByViewerPolicy(data ?? [], visibilityAccess.viewerPolicy, visibilityAccess.metadataConfig)
	})

// ── Response Viewers ──────────────────────────────────────────────────────────

export const getViewersFn = createServerFn({ method: "GET" })
	.validator(z.object({ questionnaire_id: z.string().uuid() }))
	.handler(async ({ data: { questionnaire_id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const access = await getQuestionnaireAccess(db, questionnaire_id, user.id)
		if (!access.canEdit) return []
		return getViewerPolicyListForQuestionnaire(db, questionnaire_id)
	})

export const addViewerFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			questionnaire_id: z.string().uuid(),
			email: z.string().email(),
			scope_mode: z.enum(["global", "scoped"]).optional(),
			policy: viewerPolicySchema,
		})
	)
	.handler(async ({ data: { questionnaire_id, email, scope_mode = "global", policy } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const questionnaireAccess = await requireQuestionnaireViewerManagementAccess(db, questionnaire_id, user.id)
		const visibilityAccess = await resolveResponseVisibilityAccess(db, questionnaire_id, user.id)
		validateViewerPolicyInput(scope_mode, visibilityAccess.metadataConfig, policy)

		const { normalizedEmail, userId: viewerUserId } = await lookupUserIdByEmail(db, email)
		if (!viewerUserId) throw new Error("Usuário não encontrado com esse email")
		if (viewerUserId === user.id && questionnaireAccess.isCreator) throw new Error("Você já é o criador do questionário")

		const { data, error } = await db
			.from("response_viewer")
			.insert({ questionnaire_id, viewer_id: viewerUserId, viewer_email: normalizedEmail, added_by: user.id, scope_mode })
			.select()
			.single()
		if (error) {
			if (error.code === "23505") throw new Error("Este usuário já é um visualizador")
			throw new Error(error.message)
		}
		await replaceViewerPolicyBindings(db, data.id, buildBindingsFromPolicyInput(policy))
		return data
	})

export const updateViewerPolicyFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			questionnaire_id: z.string().uuid(),
			viewer_id: z.string().uuid(),
			scope_mode: z.enum(["global", "scoped"]),
			policy: viewerPolicySchema,
		})
	)
	.handler(async ({ data: { questionnaire_id, viewer_id, scope_mode, policy } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const visibilityAccess = await resolveResponseVisibilityAccess(db, questionnaire_id, user.id)
		if (!visibilityAccess.canManageViewers) forbidden()
		validateViewerPolicyInput(scope_mode, visibilityAccess.metadataConfig, policy)

		const { data: viewer, error } = await db
			.from("response_viewer")
			.update({ scope_mode })
			.eq("id", viewer_id)
			.eq("questionnaire_id", questionnaire_id)
			.select()
			.single()
		if (error) throw new Error(error.message)

		await replaceViewerPolicyBindings(db, viewer.id, buildBindingsFromPolicyInput(policy))
		return viewer
	})

export const removeViewerFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().uuid(), questionnaire_id: z.string().uuid() }))
	.handler(async ({ data: { id, questionnaire_id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		await requireQuestionnaireViewerManagementAccess(db, questionnaire_id, user.id)

		const { error } = await db.from("response_viewer").delete().eq("id", id).eq("questionnaire_id", questionnaire_id)
		if (error) throw new Error(error.message)
	})

// ── Questionnaire Editors ────────────────────────────────────────────────────

export const getEditorsFn = createServerFn({ method: "GET" })
	.validator(z.object({ questionnaire_id: z.string().uuid() }))
	.handler(async ({ data: { questionnaire_id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const access = await getQuestionnaireAccess(db, questionnaire_id, user.id)
		if (!access.isCreator) return []

		const { data, error } = await db.from("questionnaire_editor").select("*").eq("questionnaire_id", questionnaire_id).order("created_at", { ascending: true })
		if (error) throw new Error(error.message)
		return data ?? []
	})

export const addEditorFn = createServerFn({ method: "POST" })
	.validator(z.object({ questionnaire_id: z.string().uuid(), email: z.string().email() }))
	.handler(async ({ data: { questionnaire_id, email } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const access = await requireQuestionnaireCreatorAccess(db, questionnaire_id, user.id)
		if (!access.createdBy) throw new Error("Este questionário não pode ter editores")

		const { normalizedEmail, userId: editorUserId } = await lookupUserIdByEmail(db, email)
		if (!editorUserId) throw new Error("Usuário não encontrado com esse email")
		if (editorUserId === user.id) throw new Error("Você já é o dono do questionário")

		const { data, error } = await db
			.from("questionnaire_editor")
			.insert({ questionnaire_id, editor_id: editorUserId, editor_email: normalizedEmail, added_by: user.id })
			.select()
			.single()
		if (error) {
			if (error.code === "23505") throw new Error("Este usuário já é um editor")
			throw new Error(error.message)
		}
		return data
	})

export const removeEditorFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.string().uuid(), questionnaire_id: z.string().uuid() }))
	.handler(async ({ data: { id, questionnaire_id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		await requireQuestionnaireCreatorAccess(db, questionnaire_id, user.id)

		const { error } = await db.from("questionnaire_editor").delete().eq("id", id).eq("questionnaire_id", questionnaire_id)
		if (error) throw new Error(error.message)
	})

// ── Response Versioning ─────────────────────────────────────────────────────

export const reopenResponseFn = createServerFn({ method: "POST" })
	.validator(z.object({ questionnaire_response_id: z.string().uuid() }))
	.handler(async ({ data: { questionnaire_response_id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const { data: session, error: sessionError } = await db.from("questionnaire_response").select("*, response(*)").eq("id", questionnaire_response_id).single()
		if (sessionError) throw new Error(sessionError.message)
		if (session.respondent_id !== user.id) forbidden()
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
	.validator(z.object({ questionnaire_response_id: z.string().uuid() }))
	.handler(async ({ data: { questionnaire_response_id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const { data: session, error: sessionError } = await db
			.from("questionnaire_response")
			.select("respondent_id, questionnaire_id, om")
			.eq("id", questionnaire_response_id)
			.single()
		if (sessionError) throw new Error(sessionError.message)

		const isRespondent = session.respondent_id === user.id
		if (!isRespondent) {
			const visibilityAccess = await resolveResponseVisibilityAccess(db, session.questionnaire_id, user.id)
			if (!visibilityAccess.canViewResponses) throw new Error("Sem permissão para ver versões")
			if (
				!visibilityAccess.canViewAllResponses &&
				visibilityAccess.viewerPolicy &&
				!matchesViewerPolicy(visibilityAccess.viewerPolicy, { om: session.om }, visibilityAccess.metadataConfig)
			) {
				throw new Error("Sem permissão para ver versões")
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
	.validator(z.object({ version_id: z.string().uuid() }))
	.handler(async ({ data: { version_id } }) => {
		const user = await requireUser()

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
			const visibilityAccess = await resolveResponseVisibilityAccess(db, session.questionnaire_id, user.id)
			if (!visibilityAccess.canViewResponses) throw new Error("Sem permissão para ver esta versão")
			if (
				!visibilityAccess.canViewAllResponses &&
				visibilityAccess.viewerPolicy &&
				!matchesViewerPolicy(visibilityAccess.viewerPolicy, { om: version.om }, visibilityAccess.metadataConfig)
			) {
				throw new Error("Sem permissão para ver esta versão")
			}
		}

		return version
	})

export const revertToVersionFn = createServerFn({ method: "POST" })
	.validator(z.object({ questionnaire_response_id: z.string().uuid(), version_id: z.string().uuid() }))
	.handler(async ({ data: { questionnaire_response_id, version_id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const { data: session, error: sessionError } = await db
			.from("questionnaire_response")
			.select("respondent_id, status")
			.eq("id", questionnaire_response_id)
			.single()
		if (sessionError) throw new Error(sessionError.message)
		if (session.respondent_id !== user.id) forbidden()
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
	.validator(z.object({}))
	.handler(async () => {
		const user = await requireUser()

		const db = getFormsServerClient()

		const { data: viewerRows, error: viewerError } = await db.from("response_viewer").select("questionnaire_id").eq("viewer_id", user.id)
		if (viewerError) throw new Error(viewerError.message)
		if (!viewerRows || viewerRows.length === 0) return []

		const ids = viewerRows.map((r) => r.questionnaire_id)
		return getQuestionnairesByIds(db, ids)
	})

export const getEditableSharedWithMeFn = createServerFn({ method: "GET" })
	.validator(z.object({ tags: z.array(z.string()).optional() }))
	.handler(async ({ data: { tags } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const { data: editorRows, error: editorError } = await db.from("questionnaire_editor").select("questionnaire_id").eq("editor_id", user.id)
		if (editorError) throw new Error(editorError.message)
		if (!editorRows || editorRows.length === 0) return []

		const ids = editorRows.map((row) => row.questionnaire_id)
		const questionnaires = await getQuestionnairesByIds(db, ids, tags)
		return questionnaires.filter((questionnaire) => questionnaire.created_by != null && questionnaire.created_by !== user.id)
	})
