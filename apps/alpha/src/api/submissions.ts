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
import { core, supabase } from "../db/supabase.ts"
import { extractContratacao } from "../extraction/extract.ts"
import { toSubmissionText } from "../extraction/to-text.ts"
import { type AlphaAccess, coversUnit, READER_ROLES, unitsFor } from "../lib/alpha-access.ts"
import { TextCache } from "../lib/text-cache.ts"
import { canReadSubmission } from "./authorize.ts"
import { SUBMISSION_BUCKET } from "./submission-bucket.ts"
import { buildSubmissionStoragePath, MAX_SUBMISSION_BYTES, SUBMISSION_EXTENSIONS, sanitizeSubmissionFilename } from "./submission-file.ts"

const ACCEPTED_MIME = [...SUBMISSION_EXTENSIONS.keys()]

const MAX_BYTES = MAX_SUBMISSION_BYTES

/** Texto já extraído, por `storage_path` — ver `lib/text-cache.ts`. ~16 MB de texto no pior caso. */
const submissionTexts = new TextCache(32, 8 * 1024 * 1024)

/**
 * Texto do documento: do cache, ou baixado e extraído. `null` = o download falhou.
 * Erro de extração (arquivo corrompido, PDF acima do teto de páginas) propaga.
 */
async function loadSubmissionText(storagePath: string, mimeType: string): Promise<string | null> {
	const cached = submissionTexts.get(storagePath)
	if (cached !== undefined) return cached

	const { data: download, error } = await supabase.storage.from(SUBMISSION_BUCKET).download(storagePath)
	if (error || !download) {
		if (error) console.error(`[submissions] download de ${JSON.stringify(storagePath)} falhou: ${error.message}`)
		return null
	}

	const { text } = await toSubmissionText(new Uint8Array(await download.arrayBuffer()), mimeType)
	submissionTexts.set(storagePath, text)
	return text
}

const SubmissionFormSchema = z.object({
	file: z.instanceof(File),
	doc_kind: z.enum(["ETP", "TR", "EDITAL"]),
	modalidade: z.string().optional(),
	objeto: z.enum(["COMPRAS", "SERVICOS", "OBRAS", "TIC"]).optional(),
	/**
	 * OM a que a submissão é atribuída — escolhida por quem envia, entre as de
	 * `GET /api/v1/units`. Obrigatória: é ela que decide quem mais enxerga o documento.
	 * Chega como texto (multipart) e é convertida aqui.
	 */
	unit_id: z.coerce.number().int().nonnegative(),
})

const SubmissionListQuerySchema = z.object({
	unit_id: z.coerce.number().int().nonnegative().optional(),
	// Só as que a própria pessoa enviou — o escopo "minhas" do contrate. Sem isto, quem cobre
	// uma OM veria ali os documentos dos colegas rotulados como seus.
	mine: z.enum(["true", "false"]).optional(),
})

const SUBMISSION_COLUMNS = "id, unit_id, filename, doc_kind, modalidade, objeto, created_at"

/** Código Postgres de `foreign_key_violation`: a OM sumiu entre a conferência e o insert. */
const FOREIGN_KEY_VIOLATION = "23503"

type Variables = { user: User; access: AlphaAccess }

export const submissionRoutes = new Hono<{ Variables: Variables }>()
	// POST /api/v1/submissions — upload do ETP/TR
	//
	// Qualquer autenticado envia; não há papel exigido. O único bloqueio é o deny sem
	// escopo em `alpha-requester`.
	.post("/api/v1/submissions", zValidator("form", SubmissionFormSchema), async (c) => {
		const user = c.get("user")
		if (!c.get("access").canSubmit) return c.json({ error: "Forbidden", code: "SUBMIT_DENIED", message: "o envio de documentos está bloqueado para você" }, 403)

		const { file, doc_kind, modalidade, objeto, unit_id } = c.req.valid("form")

		// O caminho sai do MIME validado — nunca do nome enviado (ver `submission-file.ts`).
		const storagePath = buildSubmissionStoragePath(user.id, file.type)
		if (!storagePath) {
			return c.json({ error: "Unsupported Media Type", code: "UNSUPPORTED_FORMAT", accepted: ACCEPTED_MIME }, 415)
		}
		if (file.size > MAX_BYTES) {
			return c.json({ error: "Payload Too Large", code: "FILE_TOO_LARGE", max_bytes: MAX_BYTES }, 413)
		}

		// A OM é conferida ANTES do upload: sem isto, OM inválida deixava o arquivo órfão no
		// Storage. A sentinela de treino do sisub não é OM de processo real. O insert ainda
		// pode falhar por FK (a OM apagada no meio) — ver o 23503 abaixo.
		const { data: unit, error: unitError } = await core.from("units").select("id, is_training").eq("id", unit_id).maybeSingle()
		if (unitError) return c.json({ error: "Internal Server Error", code: "UNIT_LOOKUP_FAILED" }, 500)
		if (!unit || unit.is_training) return c.json({ error: "Unprocessable Entity", code: "UNIT_NOT_FOUND", message: "OM inexistente" }, 422)

		const bytes = new Uint8Array(await file.arrayBuffer())

		const { error: uploadError } = await supabase.storage.from(SUBMISSION_BUCKET).upload(storagePath, bytes, { contentType: file.type, upsert: false })
		if (uploadError) {
			// O detalhe do Storage (bucket, caminho, política) fica no log — o cliente recebe só o código.
			console.error(`[submissions] upload de ${storagePath} falhou: ${uploadError.message}`)
			return c.json({ error: "Internal Server Error", code: "UPLOAD_FAILED", message: "falha ao gravar o arquivo" }, 500)
		}

		const { data, error } = await supabase
			.from("submission")
			.insert({
				user_id: user.id,
				unit_id,
				filename: sanitizeSubmissionFilename(file.name, file.type),
				mime_type: file.type,
				storage_path: storagePath,
				doc_kind,
				modalidade: modalidade ?? null,
				objeto: objeto ?? null,
			})
			.select(SUBMISSION_COLUMNS)
			.single()

		if (error || !data) {
			// Sem a linha, o arquivo não pertence a nada: some com ele (melhor esforço — a
			// resposta de erro é a mesma se a remoção também falhar).
			const { error: removeError } = await supabase.storage.from(SUBMISSION_BUCKET).remove([storagePath])
			if (removeError) console.error(`[submissions] arquivo órfão ${storagePath}: ${removeError.message}`)

			if (error?.code === FOREIGN_KEY_VIOLATION) return c.json({ error: "Unprocessable Entity", code: "UNIT_NOT_FOUND", message: "OM inexistente" }, 422)
			return c.json({ error: "Internal Server Error", code: "SUBMISSION_FAILED" }, 500)
		}

		return c.json(
			{ ...data, _links: { self: { href: `/api/v1/submissions/${data.id}` }, extractions: { href: `/api/v1/submissions/${data.id}/extractions` } } },
			201
		)
	})

	// GET /api/v1/submissions — as próprias MAIS as das OMs que o usuário cobre como
	// requisitante, licitações ou ACI. `?unit_id=` filtra; fora da cobertura, o filtro vale
	// só sobre as próprias (quem enviou para uma OM que não cobre continua vendo o que
	// enviou, e nada mais dela).
	.get("/api/v1/submissions", zValidator("query", SubmissionListQuerySchema), async (c) => {
		const user = c.get("user")
		const coverage = unitsFor(c.get("access"), ...READER_ROLES)
		const { unit_id, mine } = c.req.valid("query")

		let query = supabase.from("submission").select(SUBMISSION_COLUMNS).order("created_at", { ascending: false }).limit(50)

		if (mine === "true") {
			query = query.eq("user_id", user.id)
			if (unit_id !== undefined) query = query.eq("unit_id", unit_id)
		} else if (unit_id !== undefined) {
			query = query.eq("unit_id", unit_id)
			if (!coversUnit(coverage, unit_id)) query = query.eq("user_id", user.id)
		} else if (coverage !== "all") {
			// Os ids vêm da cobertura resolvida no servidor (inteiros), nunca do cliente.
			query = coverage.length === 0 ? query.eq("user_id", user.id) : query.or(`user_id.eq.${user.id},unit_id.in.(${coverage.join(",")})`)
		}

		const { data, error } = await query
		if (error) return c.json({ error: "Internal Server Error", code: "SUBMISSIONS_FAILED" }, 500)

		return c.json({ submissions: data ?? [], _links: { self: { href: "/api/v1/submissions" } } })
	})

	// POST /api/v1/submissions/:id/extractions — dispara a extração
	.post("/api/v1/submissions/:id/extractions", async (c) => {
		const id = c.req.param("id")
		const user = c.get("user")
		const access = c.get("access")

		if (!(await canReadSubmission(id, user, access))) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)

		const { data: submission, error } = await supabase.from("submission").select("id, storage_path, mime_type, doc_kind").eq("id", id).maybeSingle()
		if (error) return c.json({ error: "Internal Server Error", code: "SUBMISSION_LOOKUP_FAILED" }, 500)
		if (!submission) return c.json({ error: "Not Found", code: "SUBMISSION_NOT_FOUND" }, 404)

		try {
			const text = await loadSubmissionText(submission.storage_path, submission.mime_type)
			if (text === null) return c.json({ error: "Internal Server Error", code: "DOWNLOAD_FAILED" }, 500)
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
					truncated: result.truncated,
					dropped: result.dropped,
					created_at: extraction.created_at,
				},
				201
			)
		} catch (extractionError) {
			// A mensagem do provider pode trazer ARN de role, região e id de modelo — fica no log.
			console.error(`[submissions] extração da submissão ${id} falhou:`, extractionError)
			return c.json({ error: "Bad Gateway", code: "EXTRACTION_FAILED", message: "falha na extração do documento" }, 502)
		}
	})

	// GET /api/v1/submissions/:id/extractions — histórico de extrações
	.get("/api/v1/submissions/:id/extractions", async (c) => {
		const id = c.req.param("id")
		const user = c.get("user")
		const access = c.get("access")

		if (!(await canReadSubmission(id, user, access))) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)

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
		const access = c.get("access")

		if (!(await canReadSubmission(id, user, access))) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)

		const { data: submission } = await supabase.from("submission").select("storage_path, mime_type").eq("id", id).maybeSingle()
		if (!submission) return c.json({ error: "Not Found", code: "SUBMISSION_NOT_FOUND" }, 404)

		try {
			const text = await loadSubmissionText(submission.storage_path, submission.mime_type)
			if (text === null) return c.json({ error: "Internal Server Error", code: "DOWNLOAD_FAILED" }, 500)
			return c.json({ submission_id: id, text })
		} catch (extractionError) {
			console.error(`[submissions] texto da submissão ${id} não extraído:`, extractionError)
			return c.json({ error: "Unprocessable Entity", code: "TEXT_EXTRACTION_FAILED", message: "não foi possível ler o documento" }, 422)
		}
	})
