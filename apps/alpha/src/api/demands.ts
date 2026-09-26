/**
 * Rotas da demanda do requisitante (change `alpha-requester-demand`).
 *
 * A demanda é o rascunho estruturado (problema, objetivos, alternativas, itens, cotações,
 * riscos) de onde o contrate gera as peças. Ela vive aqui, e não no navegador, porque é
 * trabalho de dias e de mais de uma pessoa da área requisitante.
 *
 * Quem lê: o autor e os papéis de leitura que cobrem a OM (a mesma regra da submissão).
 * Quem edita e envia: o autor e o requisitante que cobre a OM (`decideDemandEdit`).
 *
 * O envio à ACI gera o ETP e o TR com as MESMAS funções que o contrate usa na tela
 * (`@iefa/alpha-client/demand`) e os grava como submissões comuns, com `demand_id`: a partir
 * daí, extração, verificação, triagem e parecer seguem o caminho de qualquer documento.
 */

import { zValidator } from "@hono/zod-validator"
import { buildDocuments, checkDemand, DemandPayloadSchema, emptyDemand, formBlocks, pending } from "@iefa/alpha-client/demand"
import type { User } from "@supabase/supabase-js"
import { Hono } from "hono"
import { z } from "zod"
import { core, supabase } from "../db/supabase.ts"
import { buildDocx, DOCX_MIME } from "../demand/docx.ts"
import { type AlphaAccess, coversUnit, decideDemandEdit, decideSubmissionRead, READER_ROLES, unitsFor } from "../lib/alpha-access.ts"
import { SUBMISSION_BUCKET } from "./submission-bucket.ts"
import { buildSubmissionStoragePath, sanitizeSubmissionFilename } from "./submission-file.ts"

type Variables = { user: User; access: AlphaAccess }

const LIST_COLUMNS = "id, user_id, unit_id, title, status, submitted_at, created_at, updated_at"
const DETAIL_COLUMNS = `${LIST_COLUMNS}, payload, updated_by`

/** Teto da lista: a tela avisa quando encosta. */
export const DEMAND_LIST_LIMIT = 100

const ListQuerySchema = z.object({
	unit_id: z.coerce.number().int().nonnegative().optional(),
	mine: z.enum(["true", "false"]).optional(),
})

const CreateSchema = z.object({
	unit_id: z.number().int().nonnegative(),
	title: z.string().trim().min(1).max(200),
})

const UpdateSchema = z.object({
	title: z.string().trim().min(1).max(200).optional(),
	// Validado à parte, para a resposta dizer QUAL campo não passou.
	payload: z.unknown(),
	/** `updated_at` que a tela leu. Diferente do atual = alguém gravou no meio: 409. */
	expected_updated_at: z.string().optional(),
})

const SubmitSchema = z.object({
	/** A versão que a pessoa está vendo: o envio reserva a demanda por ela (ver a rota). */
	expected_updated_at: z.string().min(1),
})

type DemandRow = {
	id: string
	user_id: string
	unit_id: number
	title: string
	status: "rascunho" | "enviada"
	submitted_at: string | null
	created_at: string
	updated_at: string
	payload?: unknown
	updated_by?: string | null
}

/** Uma demanda, ou `null`; erro de leitura NEGA (fica no log). */
async function loadDemand(id: string): Promise<{ row: DemandRow | null; failed: boolean }> {
	const { data, error } = await supabase.from("demand").select(DETAIL_COLUMNS).eq("id", id).maybeSingle()
	if (error) {
		console.error(`[demands] demanda ${JSON.stringify(id)} não lida: ${error.message}`)
		return { row: null, failed: true }
	}
	return { row: (data as DemandRow | null) ?? null, failed: false }
}

/** OM válida para demanda: existe e não é a sentinela de treino do sisub. */
async function isRealUnit(unitId: number): Promise<boolean | null> {
	const { data, error } = await core.from("units").select("id, is_training").eq("id", unitId).maybeSingle()
	if (error) return null
	return Boolean(data && !data.is_training)
}

function withLinks<T extends { id: string }>(row: T) {
	return { ...row, _links: { self: { href: `/api/v1/demands/${row.id}` }, submissions: { href: `/api/v1/demands/${row.id}/submissions` } } }
}

export const demandRoutes = new Hono<{ Variables: Variables }>()
	// GET /api/v1/demands — as próprias MAIS as das OMs que o usuário cobre como leitor.
	.get("/api/v1/demands", zValidator("query", ListQuerySchema), async (c) => {
		const user = c.get("user")
		const coverage = unitsFor(c.get("access"), ...READER_ROLES)
		const { unit_id, mine } = c.req.valid("query")

		let query = supabase.from("demand").select(LIST_COLUMNS).order("updated_at", { ascending: false }).limit(DEMAND_LIST_LIMIT)

		if (mine === "true") {
			query = query.eq("user_id", user.id)
			if (unit_id !== undefined) query = query.eq("unit_id", unit_id)
		} else if (unit_id !== undefined) {
			query = query.eq("unit_id", unit_id)
			if (!coversUnit(coverage, unit_id)) query = query.eq("user_id", user.id)
		} else if (coverage !== "all") {
			query = coverage.length === 0 ? query.eq("user_id", user.id) : query.or(`user_id.eq.${user.id},unit_id.in.(${coverage.join(",")})`)
		}

		const { data, error } = await query
		if (error) return c.json({ error: "Internal Server Error", code: "DEMANDS_FAILED" }, 500)
		return c.json({ demands: data ?? [], _links: { self: { href: "/api/v1/demands" } } })
	})

	// POST /api/v1/demands — abre um rascunho vazio na OM escolhida.
	.post("/api/v1/demands", zValidator("json", CreateSchema), async (c) => {
		const user = c.get("user")
		if (!c.get("access").canSubmit) return c.json({ error: "Forbidden", code: "SUBMIT_DENIED", message: "o envio de documentos está bloqueado para você" }, 403)

		const { unit_id, title } = c.req.valid("json")
		const real = await isRealUnit(unit_id)
		if (real === null) return c.json({ error: "Internal Server Error", code: "UNIT_LOOKUP_FAILED" }, 500)
		if (!real) return c.json({ error: "Unprocessable Entity", code: "UNIT_NOT_FOUND", message: "OM inexistente" }, 422)

		const { data, error } = await supabase
			.from("demand")
			.insert({ user_id: user.id, unit_id, title, payload: emptyDemand(), updated_by: user.id })
			.select(DETAIL_COLUMNS)
			.single()
		if (error || !data) return c.json({ error: "Internal Server Error", code: "DEMAND_CREATE_FAILED" }, 500)

		return c.json({ ...withLinks(data as DemandRow), can_edit: true, submissions: [] }, 201)
	})

	// GET /api/v1/demands/:id — a demanda inteira, com as submissões geradas dela.
	.get("/api/v1/demands/:id", async (c) => {
		const user = c.get("user")
		const access = c.get("access")
		const { row, failed } = await loadDemand(c.req.param("id"))
		if (failed) return c.json({ error: "Internal Server Error", code: "DEMAND_LOOKUP_FAILED" }, 500)
		if (!row || !decideSubmissionRead(access, user.id, row)) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)

		const { data: submissions, error } = await supabase
			.from("submission")
			.select("id, doc_kind, filename, created_at")
			.eq("demand_id", row.id)
			.order("created_at", { ascending: false })
		if (error) return c.json({ error: "Internal Server Error", code: "SUBMISSIONS_FAILED" }, 500)

		// O payload volta NORMALIZADO: rascunho gravado por versão anterior do contrate ganha os
		// defaults dos campos novos, e a tela nunca lê `undefined` onde espera lista.
		const parsed = DemandPayloadSchema.safeParse(row.payload)
		return c.json({
			...withLinks(row),
			payload: parsed.success ? parsed.data : emptyDemand(),
			payload_invalid: !parsed.success,
			can_edit: decideDemandEdit(access, user.id, row),
			submissions: submissions ?? [],
		})
	})

	// PATCH /api/v1/demands/:id — grava o rascunho (a tela chama a cada pausa na digitação).
	.patch("/api/v1/demands/:id", zValidator("json", UpdateSchema), async (c) => {
		const user = c.get("user")
		const access = c.get("access")
		const { row, failed } = await loadDemand(c.req.param("id"))
		if (failed) return c.json({ error: "Internal Server Error", code: "DEMAND_LOOKUP_FAILED" }, 500)
		if (!row || !decideDemandEdit(access, user.id, row)) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)

		const body = c.req.valid("json")
		const parsed = DemandPayloadSchema.safeParse(body.payload)
		if (!parsed.success) {
			return c.json(
				{
					error: "Unprocessable Entity",
					code: "INVALID_PAYLOAD",
					issues: parsed.error.issues.slice(0, 20).map((issue) => ({ path: issue.path.join("."), message: issue.message })),
				},
				422
			)
		}

		// Concorrência otimista: o `updated_at` lido entra no filtro do UPDATE, então dois
		// colegas gravando ao mesmo tempo não se sobrescrevem em silêncio.
		let update = supabase
			.from("demand")
			.update({ payload: parsed.data, updated_by: user.id, ...(body.title ? { title: body.title } : {}) })
			.eq("id", row.id)
		if (body.expected_updated_at) update = update.eq("updated_at", body.expected_updated_at)

		const { data, error } = await update.select(LIST_COLUMNS).maybeSingle()
		if (error) return c.json({ error: "Internal Server Error", code: "DEMAND_UPDATE_FAILED" }, 500)
		if (!data)
			return c.json(
				{ error: "Conflict", code: "DEMAND_CHANGED", message: "outra pessoa gravou esta demanda depois que você a abriu", updated_at: row.updated_at },
				409
			)

		return c.json(withLinks(data as DemandRow))
	})

	// DELETE /api/v1/demands/:id — só o autor, e só rascunho que não gerou submissão.
	.delete("/api/v1/demands/:id", async (c) => {
		const user = c.get("user")
		const { row, failed } = await loadDemand(c.req.param("id"))
		if (failed) return c.json({ error: "Internal Server Error", code: "DEMAND_LOOKUP_FAILED" }, 500)
		if (!row || row.user_id !== user.id) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)
		if (row.status !== "rascunho") return c.json({ error: "Conflict", code: "DEMAND_SUBMITTED", message: "demanda já enviada à ACI não se apaga" }, 409)

		// Submissão com `demand_id` perderia a origem em silêncio (`on delete set null`): a
		// demanda que gerou documento não se apaga, mesmo que o status tenha ficado em rascunho.
		const { count, error: countError } = await supabase.from("submission").select("id", { count: "exact", head: true }).eq("demand_id", row.id)
		if (countError) return c.json({ error: "Internal Server Error", code: "SUBMISSIONS_FAILED" }, 500)
		if ((count ?? 0) > 0) return c.json({ error: "Conflict", code: "DEMAND_SUBMITTED", message: "demanda já enviada à ACI não se apaga" }, 409)

		const { error } = await supabase.from("demand").delete().eq("id", row.id).eq("status", "rascunho")
		if (error) return c.json({ error: "Internal Server Error", code: "DEMAND_DELETE_FAILED" }, 500)
		return c.body(null, 204)
	})

	// POST /api/v1/demands/:id/submissions — gera o ETP e o TR e os envia à ACI.
	.post("/api/v1/demands/:id/submissions", zValidator("json", SubmitSchema), async (c) => {
		const user = c.get("user")
		const access = c.get("access")
		if (!access.canSubmit) return c.json({ error: "Forbidden", code: "SUBMIT_DENIED", message: "o envio de documentos está bloqueado para você" }, 403)

		const { row, failed } = await loadDemand(c.req.param("id"))
		if (failed) return c.json({ error: "Internal Server Error", code: "DEMAND_LOOKUP_FAILED" }, 500)
		if (!row || !decideDemandEdit(access, user.id, row)) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)

		const parsed = DemandPayloadSchema.safeParse(row.payload)
		if (!parsed.success) return c.json({ error: "Unprocessable Entity", code: "INVALID_PAYLOAD" }, 422)
		const demand = parsed.data

		const blocking = checkDemand(demand).filter((check) => check.severity === "bloqueia")
		if (blocking.length > 0) {
			return c.json(
				{
					error: "Unprocessable Entity",
					code: "DEMAND_BLOCKED",
					message: "a demanda tem pendências que impedem o envio",
					checks: blocking.map(({ id, step, message }) => ({ id, step, message })),
				},
				422
			)
		}

		const real = await isRealUnit(row.unit_id)
		if (real === null) return c.json({ error: "Internal Server Error", code: "UNIT_LOOKUP_FAILED" }, 500)
		if (!real) return c.json({ error: "Unprocessable Entity", code: "UNIT_NOT_FOUND", message: "OM inexistente" }, 422)

		// Reserva: o UPDATE só casa com o `updated_at` que a pessoa viu, e ele muda (trigger). Dois
		// envios da mesma versão (clique duplo, dois colegas, retentativa) não geram dois pares de
		// peças: o segundo recebe 409. O status só volta se a geração falhar.
		const { expected_updated_at } = c.req.valid("json")
		const previous = { status: row.status, submitted_at: row.submitted_at }
		const { data: claimed, error: claimError } = await supabase
			.from("demand")
			.update({ status: "enviada", submitted_at: new Date().toISOString(), updated_by: user.id })
			.eq("id", row.id)
			.eq("updated_at", expected_updated_at)
			.select("updated_at")
			.maybeSingle()
		if (claimError) return c.json({ error: "Internal Server Error", code: "DEMAND_UPDATE_FAILED" }, 500)
		if (!claimed)
			return c.json({ error: "Conflict", code: "DEMAND_CHANGED", message: "a demanda mudou depois que você a abriu; recarregue antes de enviar" }, 409)

		const documents = buildDocuments(demand)
		const header = {
			object: demand.solution.object.trim() || row.title,
			area: demand.requestingArea.trim() || pending("área requisitante"),
			nup: demand.planning.nup.trim() || pending("NUP"),
		}

		const uploaded: string[] = []
		const created: Array<{ id: string; doc_kind: string; filename: string; created_at: string }> = []
		/**
		 * Desfaz o envio. Devolve o `updated_at` depois da reversão (o trigger o muda), que vai na
		 * resposta de erro: sem ele, a próxima gravação da tela daria um falso 409.
		 */
		const cleanup = async (): Promise<string | null> => {
			const { data: reverted, error: revertError } = await supabase.from("demand").update(previous).eq("id", row.id).select("updated_at").maybeSingle()
			if (revertError) console.error(`[demands] status da demanda ${row.id} não revertido: ${revertError.message}`)
			if (created.length) {
				const { error } = await supabase
					.from("submission")
					.delete()
					.in(
						"id",
						created.map((submission) => submission.id)
					)
				if (error) console.error(`[demands] submissões órfãs ${created.map((submission) => submission.id).join(", ")}: ${error.message}`)
			}
			if (uploaded.length) {
				const { error } = await supabase.storage.from(SUBMISSION_BUCKET).remove(uploaded)
				if (error) console.error(`[demands] arquivos órfãos ${uploaded.join(", ")}: ${error.message}`)
			}
			return (reverted?.updated_at as string | undefined) ?? null
		}

		for (const form of documents.forms) {
			if (!form.alphaKind) continue
			const storagePath = buildSubmissionStoragePath(user.id, DOCX_MIME)
			if (!storagePath) throw new Error("MIME do .docx fora da lista de submissão")

			const bytes = buildDocx(formBlocks(form, header))
			const { error: uploadError } = await supabase.storage.from(SUBMISSION_BUCKET).upload(storagePath, bytes, { contentType: DOCX_MIME, upsert: false })
			if (uploadError) {
				console.error(`[demands] upload de ${storagePath} falhou: ${uploadError.message}`)
				const updated_at = await cleanup()
				return c.json({ error: "Internal Server Error", code: "UPLOAD_FAILED", message: "falha ao gravar o documento gerado", updated_at }, 500)
			}
			uploaded.push(storagePath)

			const { data, error } = await supabase
				.from("submission")
				.insert({
					user_id: user.id,
					unit_id: row.unit_id,
					filename: sanitizeSubmissionFilename(`${form.alphaKind} - ${row.title}.docx`, DOCX_MIME),
					mime_type: DOCX_MIME,
					storage_path: storagePath,
					doc_kind: form.alphaKind,
					modalidade: documents.framing.route ? documents.framing.label : null,
					objeto: documents.framing.alphaObjeto,
					demand_id: row.id,
				})
				.select("id, doc_kind, filename, created_at")
				.single()
			if (error || !data) {
				const updated_at = await cleanup()
				return c.json({ error: "Internal Server Error", code: "SUBMISSION_FAILED", updated_at }, 500)
			}
			created.push(data as (typeof created)[number])
		}

		return c.json({ demand_id: row.id, updated_at: claimed.updated_at as string, submissions: created }, 201)
	})
