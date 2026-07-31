/**
 * Rotas de submissão e extração (Etapa 1.4).
 *
 * O arquivo enviado vai para o Storage do Supabase e o texto extraído fica em
 * memória apenas durante a execução: o que se persiste é o JSON canônico com
 * seus spans, que é o insumo das etapas seguintes e o que o console exibe lado
 * a lado com o documento.
 */

import { zValidator } from "@hono/zod-validator"
import type { User } from "@supabase/supabase-js"
import { Hono } from "hono"
import { z } from "zod"
import { supabase } from "../db/supabase.ts"
import { extractContratacao } from "../extraction/extract.ts"
import { toSubmissionText } from "../extraction/to-text.ts"
import type { AppRole } from "../middleware/auth.ts"

export const SUBMISSION_BUCKET = "alpha-submissions"

const ACCEPTED_MIME = new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/pdf"])

const MAX_BYTES = 25 * 1024 * 1024

const SubmissionFormSchema = z.object({
	file: z.instanceof(File),
	doc_kind: z.enum(["ETP", "TR", "EDITAL"]),
	modalidade: z.string().optional(),
	objeto: z.enum(["COMPRAS", "SERVICOS", "OBRAS", "TIC"]).optional(),
})

type Variables = { user: User; role: AppRole }

/** Dono da submissão ou perfil com acesso amplo. */
async function assertCanRead(submissionId: string, user: User, role: AppRole): Promise<boolean> {
	if (role !== "app_requisitante") return true
	const { data } = await supabase.from("submission").select("user_id").eq("id", submissionId).maybeSingle()
	return !data || data.user_id === user.id
}

export const submissionRoutes = new Hono<{ Variables: Variables }>()
	// POST /api/v1/submissions — upload do ETP/TR
	.post("/api/v1/submissions", zValidator("form", SubmissionFormSchema), async (c) => {
		const user = c.get("user")
		const { file, doc_kind, modalidade, objeto } = c.req.valid("form")

		if (!ACCEPTED_MIME.has(file.type)) {
			return c.json({ error: "Unsupported Media Type", code: "UNSUPPORTED_FORMAT", accepted: [...ACCEPTED_MIME] }, 415)
		}
		if (file.size > MAX_BYTES) {
			return c.json({ error: "Payload Too Large", code: "FILE_TOO_LARGE", max_bytes: MAX_BYTES }, 413)
		}

		const bytes = new Uint8Array(await file.arrayBuffer())
		const storagePath = `${user.id}/${crypto.randomUUID()}-${file.name}`

		const { error: uploadError } = await supabase.storage.from(SUBMISSION_BUCKET).upload(storagePath, bytes, { contentType: file.type, upsert: false })
		if (uploadError) return c.json({ error: "Internal Server Error", code: "UPLOAD_FAILED", message: uploadError.message }, 500)

		const { data, error } = await supabase
			.from("submission")
			.insert({
				user_id: user.id,
				filename: file.name,
				mime_type: file.type,
				storage_path: storagePath,
				doc_kind,
				modalidade: modalidade ?? null,
				objeto: objeto ?? null,
			})
			.select("id, filename, doc_kind, modalidade, objeto, created_at")
			.single()

		if (error || !data) return c.json({ error: "Internal Server Error", code: "SUBMISSION_FAILED" }, 500)

		return c.json(
			{ ...data, _links: { self: { href: `/api/v1/submissions/${data.id}` }, extractions: { href: `/api/v1/submissions/${data.id}/extractions` } } },
			201
		)
	})

	// GET /api/v1/submissions — submissões do usuário
	.get("/api/v1/submissions", async (c) => {
		const user = c.get("user")
		const role = c.get("role")

		let query = supabase.from("submission").select("id, filename, doc_kind, modalidade, objeto, created_at").order("created_at", { ascending: false }).limit(50)
		if (role === "app_requisitante") query = query.eq("user_id", user.id)

		const { data, error } = await query
		if (error) return c.json({ error: "Internal Server Error", code: "SUBMISSIONS_FAILED" }, 500)

		return c.json({ submissions: data ?? [], _links: { self: { href: "/api/v1/submissions" } } })
	})

	// POST /api/v1/submissions/:id/extractions — dispara a extração
	.post("/api/v1/submissions/:id/extractions", async (c) => {
		const id = c.req.param("id")
		const user = c.get("user")
		const role = c.get("role")

		if (!(await assertCanRead(id, user, role))) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)

		const { data: submission, error } = await supabase.from("submission").select("id, storage_path, mime_type, doc_kind").eq("id", id).maybeSingle()
		if (error) return c.json({ error: "Internal Server Error", code: "SUBMISSION_LOOKUP_FAILED" }, 500)
		if (!submission) return c.json({ error: "Not Found", code: "SUBMISSION_NOT_FOUND" }, 404)

		const { data: download, error: downloadError } = await supabase.storage.from(SUBMISSION_BUCKET).download(submission.storage_path)
		if (downloadError || !download) return c.json({ error: "Internal Server Error", code: "DOWNLOAD_FAILED" }, 500)

		try {
			const { text } = await toSubmissionText(new Uint8Array(await download.arrayBuffer()), submission.mime_type)
			const result = await extractContratacao(text, submission.doc_kind)

			const { data: extraction, error: insertError } = await supabase
				.from("extraction")
				.insert({ submission_id: id, payload: result.payload, spans: result.spans, model: result.model })
				.select("id, created_at")
				.single()

			if (insertError || !extraction) return c.json({ error: "Internal Server Error", code: "EXTRACTION_PERSIST_FAILED" }, 500)

			return c.json(
				{
					id: extraction.id,
					submission_id: id,
					payload: result.payload,
					spans: result.spans,
					model: result.model,
					dropped: result.dropped,
					created_at: extraction.created_at,
				},
				201
			)
		} catch (extractionError) {
			const message = extractionError instanceof Error ? extractionError.message : String(extractionError)
			return c.json({ error: "Bad Gateway", code: "EXTRACTION_FAILED", message }, 502)
		}
	})

	// GET /api/v1/submissions/:id/extractions — histórico de extrações
	.get("/api/v1/submissions/:id/extractions", async (c) => {
		const id = c.req.param("id")
		const user = c.get("user")
		const role = c.get("role")

		if (!(await assertCanRead(id, user, role))) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)

		const { data, error } = await supabase
			.from("extraction")
			.select("id, payload, spans, model, created_at")
			.eq("submission_id", id)
			.order("created_at", { ascending: false })

		if (error) return c.json({ error: "Internal Server Error", code: "EXTRACTIONS_FAILED" }, 500)
		return c.json({ submission_id: id, extractions: data ?? [], _links: { self: { href: `/api/v1/submissions/${id}/extractions` } } })
	})

	// GET /api/v1/submissions/:id/text — texto do documento, para exibir o span
	.get("/api/v1/submissions/:id/text", async (c) => {
		const id = c.req.param("id")
		const user = c.get("user")
		const role = c.get("role")

		if (!(await assertCanRead(id, user, role))) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)

		const { data: submission } = await supabase.from("submission").select("storage_path, mime_type").eq("id", id).maybeSingle()
		if (!submission) return c.json({ error: "Not Found", code: "SUBMISSION_NOT_FOUND" }, 404)

		const { data: download } = await supabase.storage.from(SUBMISSION_BUCKET).download(submission.storage_path)
		if (!download) return c.json({ error: "Internal Server Error", code: "DOWNLOAD_FAILED" }, 500)

		const { text } = await toSubmissionText(new Uint8Array(await download.arrayBuffer()), submission.mime_type)
		return c.json({ submission_id: id, text })
	})
