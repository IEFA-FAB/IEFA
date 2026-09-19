import type { Database, Json } from "@iefa/database"
import { notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { SELF_VIEWER_MESSAGES, selfViewerGrantRefusal, toFormsAccessError } from "@/lib/access-change"
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

/** Linhas devolvidas pelas funções auditadas (`to_jsonb(row)`, mais o `log_id`). */
type ResponseViewerRow = Database["forms"]["Tables"]["response_viewer"]["Row"] & { log_id: string }
type QuestionnaireEditorRow = Database["forms"]["Tables"]["questionnaire_editor"]["Row"] & { log_id: string }

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
	const { data: questionnaire, error } = await db.from("questionnaire").select("id, created_by").eq("id", questionnaireId).maybeSingle()
	if (error) throw new Error(error.message)
	if (!questionnaire) throw notFound()
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
	const { data: questionnaire, error } = await db
		.from("questionnaire")
		.select("id, created_by, response_metadata_config")
		.eq("id", questionnaireId)
		.maybeSingle()
	if (error) throw new Error(error.message)
	if (!questionnaire) throw notFound()

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

/** Mesma resposta para e-mail sem conta e para falha de inclusão — não revela quem existe. */
const ADD_BY_EMAIL_FAILED = "Não foi possível adicionar esse email. Confira o endereço e se a pessoa já acessou o sistema."

async function lookupUserIdByEmail(db: FormsDbClient, email: string) {
	const normalizedEmail = email.toLowerCase().trim()
	const { data: userId, error } = await db.rpc("lookup_user_id_by_email", { p_email: normalizedEmail })
	if (error) throw new Error(error.message)
	return { normalizedEmail, userId }
}

/**
 * Resposta só vale para questionário publicado. Sem isto qualquer usuário logado que
 * soubesse o id abria sessão, gravava e enviava resposta ao rascunho de outra pessoa —
 * a tela `/respond/$id` recusava, mas as server functions não.
 */
async function requirePublishedQuestionnaire(db: FormsDbClient, questionnaireId: string) {
	const { data, error } = await db.from("questionnaire").select("status").eq("id", questionnaireId).maybeSingle()
	if (error) throw new Error(error.message)
	if (!data) throw notFound()
	if (data.status !== "sent") forbidden("Este questionário não está publicado")
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
		// O client roda com service key (bypassa RLS) — sem este guard o endpoint
		// expõe todos os questionários da instância a qualquer requisição anônima.
		const userId = await requireUserId()
		const db = getFormsServerClient()
		// Só os próprios (rascunhos inclusive) e os publicados. Antes a lista trazia os
		// rascunhos de todo mundo e o filtro "meus" era feito no navegador — o payload
		// entregava o rascunho alheio a qualquer usuário logado. Os compartilhados para
		// edição vêm de `getEditableSharedWithMeFn`, que checa `questionnaire_editor`.
		let query = db.from("questionnaire").select("*").or(`created_by.eq.${userId},status.eq.sent`).order("created_at", { ascending: false })
		if (tags?.length) {
			query = query.contains("tags", tags)
		}
		const { data, error } = await query
		if (error) throw new Error(error.message)
		return data
	})

export const getQuestionnaireFn = createServerFn({ method: "GET" })
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ data: { id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const { data, error } = await db
			.from("questionnaire")
			.select("*, section(*, question(*))")
			.eq("id", id)
			.order("sort_order", { referencedTable: "section", ascending: true })
			.maybeSingle()
		if (error) throw new Error(error.message)
		// maybeSingle + notFound: com .single() o PostgREST devolve PGRST116 e o usuário
		// via a mensagem crua "JSON object requested, multiple (or no) rows returned".
		if (!data) throw notFound()

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
			id: z.uuid(),
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
	.validator(z.object({ id: z.uuid() }))
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
	.validator(z.object({ questionnaire_id: z.uuid(), title: z.string().min(1), description: z.string().optional(), sort_order: z.number().int().optional() }))
	.handler(async ({ data }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		await requireQuestionnaireEditAccess(db, data.questionnaire_id, user.id)
		const { data: section, error } = await db.from("section").insert(data).select().single()
		if (error) throw new Error(error.message)
		return section
	})

export const updateSectionFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.uuid(), title: z.string().min(1).optional(), description: z.string().optional() }))
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
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ data: { id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const questionnaireId = await getQuestionnaireIdBySectionId(db, id)
		await requireQuestionnaireEditAccess(db, questionnaireId, user.id)
		const { error } = await db.from("section").delete().eq("id", id)
		if (error) throw new Error(error.message)
	})

export const reorderSectionsFn = createServerFn({ method: "POST" })
	.validator(z.object({ items: z.array(z.object({ id: z.uuid(), sort_order: z.number().int() })) }))
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
			section_id: z.uuid(),
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
			id: z.uuid(),
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
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ data: { id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const questionnaireId = await getQuestionnaireIdByQuestionId(db, id)
		await requireQuestionnaireEditAccess(db, questionnaireId, user.id)
		const { error } = await db.from("question").delete().eq("id", id)
		if (error) throw new Error(error.message)
	})

export const reorderQuestionsFn = createServerFn({ method: "POST" })
	.validator(z.object({ items: z.array(z.object({ id: z.uuid(), sort_order: z.number().int() })) }))
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
		// não fica aberta a anônimo.
		await requireUserId()
		const db = getFormsServerClient()
		const { data, error } = await db.from("om_option").select("id, name").eq("active", true).order("sort_order", { ascending: true })
		if (error) throw new Error(error.message)
		return data
	})

export const getMyResponseStateFn = createServerFn({ method: "GET" })
	.validator(z.object({ questionnaire_id: z.uuid() }))
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
			questionnaire_id: z.uuid(),
			// Casa com o enum `forms.evaluation_type` do banco. Como `z.string()` o
			// valor inválido só era recusado no INSERT, virando erro de driver em vez
			// de erro de validação na borda.
			evaluation_type: z.enum(["auditoria_interna", "auditoria_externa", "preparatoria"]),
			om: z.string(),
			secao: z.string(),
		})
	)
	.handler(async ({ data: { questionnaire_id, evaluation_type, om, secao } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		await requirePublishedQuestionnaire(db, questionnaire_id)

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
			questionnaire_response_id: z.uuid(),
			question_id: z.uuid(),
			value: z.any(),
			observation: z.string().nullable().optional(),
		})
	)
	.handler(async ({ data: { questionnaire_response_id, question_id, value, observation } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const { data: session, error: sessionError } = await db
			.from("questionnaire_response")
			.select("respondent_id, status, questionnaire_id")
			.eq("id", questionnaire_response_id)
			.single()
		if (sessionError) throw new Error(sessionError.message)
		if (session.respondent_id !== user.id || session.status !== "draft") {
			throw new Error("Sem permissão para alterar esta resposta")
		}
		await requirePublishedQuestionnaire(db, session.questionnaire_id)

		// A pergunta tem de ser do questionário desta sessão. Sem isto a resposta de
		// um questionário carregava linhas de perguntas de outro — que apareciam na
		// versão enviada e em qualquer leitura que junte `response` por pergunta.
		const { data: question, error: questionError } = await db.from("question").select("section_id").eq("id", question_id).maybeSingle()
		if (questionError) throw new Error(questionError.message)
		const questionQuestionnaireId = question ? await getQuestionnaireIdBySectionId(db, question.section_id) : null
		if (questionQuestionnaireId !== session.questionnaire_id) {
			throw new Error("Pergunta não pertence a este questionário")
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
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ data: { id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const { data: session, error: sessionError } = await db
			.from("questionnaire_response")
			.select("respondent_id, status, questionnaire_id, evaluation_type, om, secao")
			.eq("id", id)
			.single()
		if (sessionError) throw new Error(sessionError.message)
		if (session.respondent_id !== user.id || session.status !== "draft") {
			throw new Error("Sem permissão para enviar esta resposta")
		}
		await requirePublishedQuestionnaire(db, session.questionnaire_id)

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
	.validator(z.object({ questionnaire_id: z.uuid() }))
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
	.validator(z.object({ questionnaire_id: z.uuid() }))
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
	.validator(z.object({ questionnaire_id: z.uuid() }))
	.handler(async ({ data: { questionnaire_id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const access = await getQuestionnaireAccess(db, questionnaire_id, user.id)
		if (!access.canEdit) return []
		return getViewerPolicyListForQuestionnaire(db, questionnaire_id)
	})

/*
 * Conceder, alterar e retirar acesso às respostas passa pelas funções SQL auditadas
 * (`forms.*_response_viewer*`, migration 20260921130000): o visualizador, as regras de escopo
 * dele e a linha de `access_control.sensitive_operation_log` entram na MESMA transação, com o
 * ator da sessão (`user.id`). Ver `lib/access-change.ts`.
 */

/** Recusa a concessão de acesso às respostas sobre si mesmo — ver `lib/access-change.ts`. */
function refuseSelfViewerGrant(actorId: string, viewerUserId: string, actorIsCreator: boolean): void {
	const refusal = selfViewerGrantRefusal(actorId, viewerUserId, actorIsCreator)
	if (refusal === "CREATOR_ALREADY_SEES") throw new Error(SELF_VIEWER_MESSAGES[refusal])
	if (refusal) forbidden(SELF_VIEWER_MESSAGES[refusal])
}

export const addViewerFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			questionnaire_id: z.uuid(),
			email: z.email(),
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
		// Mensagem genérica de propósito: "usuário não encontrado" transformava o
		// formulário num oráculo de quais e-mails têm conta na instância.
		if (!viewerUserId) throw new Error(ADD_BY_EMAIL_FAILED)
		refuseSelfViewerGrant(user.id, viewerUserId, questionnaireAccess.isCreator)

		const { data, error } = await db.rpc("add_response_viewer", {
			p_actor: user.id,
			p_questionnaire_id: questionnaire_id,
			p_viewer_id: viewerUserId,
			p_viewer_email: normalizedEmail,
			p_scope_mode: scope_mode,
			p_bindings: buildBindingsFromPolicyInput(policy),
		})
		if (error) throw toFormsAccessError(error)
		return data as ResponseViewerRow
	})

export const updateViewerPolicyFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			questionnaire_id: z.uuid(),
			viewer_id: z.uuid(),
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

		// O alvo sai da LINHA (o `viewer_id` do payload é o id da linha, não da pessoa): é o que
		// permite recusar a alteração do próprio escopo por quem não é o criador.
		const { data: current, error: currentError } = await db
			.from("response_viewer")
			.select("viewer_id")
			.eq("id", viewer_id)
			.eq("questionnaire_id", questionnaire_id)
			.maybeSingle()
		if (currentError) throw new Error(currentError.message)
		if (!current) throw new Error("Visualizador não encontrado neste questionário — a lista pode estar desatualizada")
		refuseSelfViewerGrant(user.id, current.viewer_id, visibilityAccess.questionnaireAccess.isCreator)

		const { data, error } = await db.rpc("update_response_viewer_policy", {
			p_actor: user.id,
			p_questionnaire_id: questionnaire_id,
			p_viewer_row_id: viewer_id,
			p_scope_mode: scope_mode,
			p_bindings: buildBindingsFromPolicyInput(policy),
		})
		if (error) throw toFormsAccessError(error)
		return data as ResponseViewerRow
	})

export const removeViewerFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.uuid(), questionnaire_id: z.uuid() }))
	.handler(async ({ data: { id, questionnaire_id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		await requireQuestionnaireViewerManagementAccess(db, questionnaire_id, user.id)

		const { error } = await db.rpc("remove_response_viewer", { p_actor: user.id, p_questionnaire_id: questionnaire_id, p_viewer_row_id: id })
		if (error) throw toFormsAccessError(error)
	})

// ── Questionnaire Editors ────────────────────────────────────────────────────

export const getEditorsFn = createServerFn({ method: "GET" })
	.validator(z.object({ questionnaire_id: z.uuid() }))
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
	.validator(z.object({ questionnaire_id: z.uuid(), email: z.email() }))
	.handler(async ({ data: { questionnaire_id, email } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		const access = await requireQuestionnaireCreatorAccess(db, questionnaire_id, user.id)
		if (!access.createdBy) throw new Error("Este questionário não pode ter editores")

		const { normalizedEmail, userId: editorUserId } = await lookupUserIdByEmail(db, email)
		if (!editorUserId) throw new Error(ADD_BY_EMAIL_FAILED)
		if (editorUserId === user.id) throw new Error("Você já é o dono do questionário")

		// Editor + linha de auditoria na mesma transação (`forms.add_questionnaire_editor`).
		const { data, error } = await db.rpc("add_questionnaire_editor", {
			p_actor: user.id,
			p_questionnaire_id: questionnaire_id,
			p_editor_id: editorUserId,
			p_editor_email: normalizedEmail,
		})
		if (error) throw toFormsAccessError(error)
		return data as QuestionnaireEditorRow
	})

export const removeEditorFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.uuid(), questionnaire_id: z.uuid() }))
	.handler(async ({ data: { id, questionnaire_id } }) => {
		const user = await requireUser()

		const db = getFormsServerClient()
		await requireQuestionnaireCreatorAccess(db, questionnaire_id, user.id)

		const { error } = await db.rpc("remove_questionnaire_editor", { p_actor: user.id, p_questionnaire_id: questionnaire_id, p_editor_row_id: id })
		if (error) throw toFormsAccessError(error)
	})

// ── Response Versioning ─────────────────────────────────────────────────────

export const reopenResponseFn = createServerFn({ method: "POST" })
	.validator(z.object({ questionnaire_response_id: z.uuid() }))
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
	.validator(z.object({ questionnaire_response_id: z.uuid() }))
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
	.validator(z.object({ version_id: z.uuid() }))
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
	.validator(z.object({ questionnaire_response_id: z.uuid(), version_id: z.uuid() }))
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

		// `response_version.answers` é uma coluna jsonb: o conteúdo é opaco para o
		// banco, mas cada item volta para `response`, cuja coluna `value` é Json.
		// Tipar como `unknown` quebrava o insert de volta.
		const answers = version.answers as Array<{ question_id: string; value: Json; observation: string | null }>

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
