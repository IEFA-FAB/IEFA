/**
 * Chat sobre documento (change `alpha-chat-processo`) — as rotas que o contrate consome.
 *
 * Duas espécies de conversa, a mesma API:
 *   - de PROCESSO (`submission_id`): o documento enviado, os achados e o parecer. Quem pode
 *     ler o processo pode conversar sobre ele — e a leitura é conferida de novo a cada turno;
 *   - AVULSA: até 5 arquivos anexados pelo usuário, sem processo nenhum.
 *
 * A conversa é do dono, desde a criação: diferente da sessão do ChatRADA, que ficava aberta
 * a qualquer autenticado até o primeiro registro em `query_log`. De outra pessoa, ou
 * inexistente: 404, igual — o id alheio não se distingue do que não existe.
 */

import { zValidator } from "@hono/zod-validator"
import type { User } from "@supabase/supabase-js"
import { type Context, Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { z } from "zod"
import { runChatTurn } from "../chat/agent.ts"
import { CHAT_ATTACHMENT_BUCKET, MAX_ATTACHMENTS_PER_THREAD } from "../chat/attachment-bucket.ts"
import { resolveCitations } from "../chat/citations.ts"
import { buildHistory, type StoredMessage } from "../chat/history.ts"
import { loadAttachmentSources, loadProcessSources, rememberDocument, SourceLoadError, toSections } from "../chat/load-sources.ts"
import { chatModels } from "../chat/models.ts"
import { searchNorms } from "../chat/norm-search.ts"
import { buildSourcesBlock, CHAT_SYSTEM_RULES, conversationNonce } from "../chat/prompt.ts"
import { dailyLimitState } from "../chat/rate-limit.ts"
import { buildSourceBundle, type TurnSources } from "../chat/sources.ts"
import { loadThread, presentThread, removeThread, THREAD_COLUMNS, type ThreadRow, touchThread } from "../chat/threads.ts"
import { supabase } from "../db/supabase.ts"
import { env } from "../env.ts"
import { inspectSubmissionDocument, toSubmissionText } from "../extraction/to-text.ts"
import { type AlphaAccess, decideThreadAccess } from "../lib/alpha-access.ts"
import { DocumentLimitError } from "../lib/document-limits.ts"
import { isTransientModelFailure } from "../lib/transient.ts"
import { canReadSubmission } from "./authorize.ts"
import { buildSubmissionStoragePath, MAX_SUBMISSION_BYTES, sanitizeSubmissionFilename } from "./submission-file.ts"

type Variables = { user: User; access: AlphaAccess }

/** Pergunta por turno — o mesmo teto do ChatRADA. */
export const MAX_CHAT_MESSAGE_CHARS = 8_000

/** Teto de um turno inteiro, ferramentas incluídas. Abortar é o que para de pagar modelo. */
const TURN_TIMEOUT_MS = 180_000

/** Comentário SSE enquanto o agente está em ferramenta: o idle do ALB é de 60 s. */
const KEEPALIVE_MS = 15_000

const LIST_LIMIT = 100

const TITLE_MAX = 120

const CreateBodySchema = z.object({ submission_id: z.uuid().optional() })

const ListQuerySchema = z.object({
	submission_id: z.uuid().optional(),
	kind: z.enum(["processo", "avulso"]).optional(),
})

const PatchBodySchema = z
	.object({ saved: z.boolean().optional(), title: z.string().trim().min(1).max(TITLE_MAX).optional() })
	.refine((body) => body.saved !== undefined || body.title !== undefined, { message: "informe saved ou title" })

const MessageBodySchema = z.object({ message: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_CHARS) })

const AttachmentFormSchema = z.object({ file: z.instanceof(File) })

const failed = (c: Context, code: string, status: 500 | 502 = 500) => c.json({ error: status === 502 ? "Bad Gateway" : "Internal Server Error", code }, status)

const notFound = (c: Context) => c.json({ error: "Not Found", code: "CHAT_NOT_FOUND" }, 404)

/** A conversa, se for do usuário. `undefined` = não é dele (ou não existe) → 404. */
async function ownedThread(c: Context<{ Variables: Variables }>): Promise<ThreadRow | undefined> {
	const thread = await loadThread(c.req.param("id") ?? "")
	return decideThreadAccess(thread, c.get("user").id) && thread ? thread : undefined
}

function titleFrom(message: string): string {
	const oneLine = message.replace(/\s+/g, " ").trim()
	return oneLine.length > TITLE_MAX ? `${oneLine.slice(0, TITLE_MAX - 1)}…` : oneLine
}

export const chatRoutes = new Hono<{ Variables: Variables }>()
	// POST /api/v1/chats — abre uma conversa (de processo, ou avulsa)
	.post("/api/v1/chats", zValidator("json", CreateBodySchema), async (c) => {
		const user = c.get("user")
		const { submission_id } = c.req.valid("json")

		if (submission_id) {
			if (!(await canReadSubmission(submission_id, user, c.get("access")))) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)
		} else if (!c.get("access").canSubmit) {
			// O avulso guarda arquivo do usuário: o mesmo portão de enviar documento.
			return c.json({ error: "Forbidden", code: "SUBMIT_DENIED", message: "o envio de documentos está bloqueado para você" }, 403)
		}

		const { data, error } = await supabase
			.from("chat_thread")
			.insert({ user_id: user.id, submission_id: submission_id ?? null })
			.select(THREAD_COLUMNS)
			.single()
		// FK: o leitor global passa pelo `canReadSubmission` sem que o id exista.
		if (error?.code === "23503") return c.json({ error: "Not Found", code: "SUBMISSION_NOT_FOUND" }, 404)
		if (error || !data) return failed(c, "CHAT_CREATE_FAILED")

		return c.json(presentThread(data as ThreadRow), 201)
	})

	// GET /api/v1/chats — as conversas do usuário, da mais recente para a mais antiga
	.get("/api/v1/chats", zValidator("query", ListQuerySchema), async (c) => {
		const { submission_id, kind } = c.req.valid("query")
		let query = supabase.from("chat_thread").select(THREAD_COLUMNS).eq("user_id", c.get("user").id)
		if (submission_id) query = query.eq("submission_id", submission_id)
		else if (kind === "processo") query = query.not("submission_id", "is", null)
		else if (kind === "avulso") query = query.is("submission_id", null)

		const { data, error } = await query.order("last_activity_at", { ascending: false }).limit(LIST_LIMIT + 1)
		if (error) return failed(c, "CHATS_FAILED")

		const rows = (data ?? []) as ThreadRow[]
		return c.json({ items: rows.slice(0, LIST_LIMIT).map(presentThread), truncated: rows.length > LIST_LIMIT })
	})

	// GET /api/v1/chats/:id — a conversa com mensagens e anexos
	.get("/api/v1/chats/:id", async (c) => {
		const thread = await ownedThread(c)
		if (!thread) return notFound(c)

		const [messages, attachments] = await Promise.all([
			supabase
				.from("chat_message")
				.select("id, role, content, citations, status, created_at")
				.eq("thread_id", thread.id)
				.order("created_at", { ascending: true }),
			supabase
				.from("chat_attachment")
				.select("id, filename, mime_type, size_bytes, text_chars, created_at")
				.eq("thread_id", thread.id)
				.order("created_at", { ascending: true }),
		])
		if (messages.error) return failed(c, "MESSAGES_FAILED")
		if (attachments.error) return failed(c, "ATTACHMENTS_FAILED")

		// A conversa continua legível para o dono mesmo sem acesso ao processo — o que ele
		// perde é consultar o documento de novo. A tela usa isto para desabilitar o envio.
		const canContinue = thread.submission_id === null || (await canReadSubmission(thread.submission_id, c.get("user"), c.get("access")))

		return c.json({
			...presentThread(thread),
			can_continue: canContinue,
			messages: messages.data ?? [],
			attachments: (attachments.data ?? []).map((row, index) => ({ ...row, label: `D${index + 1}` })),
			max_attachments: MAX_ATTACHMENTS_PER_THREAD,
		})
	})

	// PATCH /api/v1/chats/:id — salvar, deixar de salvar, renomear
	.patch("/api/v1/chats/:id", zValidator("json", PatchBodySchema), async (c) => {
		const thread = await ownedThread(c)
		if (!thread) return notFound(c)

		const { saved, title } = c.req.valid("json")
		const patch: Record<string, string | null> = {}
		if (title !== undefined) patch.title = title
		if (saved === true && thread.saved_at === null) patch.saved_at = new Date().toISOString()
		if (saved === false && thread.saved_at !== null) {
			// Deixar de salvar reinicia o prazo: sem isto, desmarcar uma conversa antiga a
			// apagaria na rodada seguinte da rotina, sem aviso.
			patch.saved_at = null
			patch.last_activity_at = new Date().toISOString()
		}
		if (Object.keys(patch).length === 0) return c.json(presentThread(thread))

		const { data, error } = await supabase.from("chat_thread").update(patch).eq("id", thread.id).select(THREAD_COLUMNS).single()
		if (error || !data) return failed(c, "CHAT_UPDATE_FAILED")
		return c.json(presentThread(data as ThreadRow))
	})

	// DELETE /api/v1/chats/:id — apaga a conversa (arquivos antes da linha)
	.delete("/api/v1/chats/:id", async (c) => {
		const thread = await ownedThread(c)
		if (!thread) return notFound(c)

		const outcome = await removeThread(thread.id)
		if (!outcome.ok) {
			console.error(`[chat] conversa ${thread.id} não apagada (${outcome.reason}): ${outcome.message}`)
			return outcome.reason === "storage" ? failed(c, "STORAGE_DELETE_FAILED", 502) : failed(c, "CHAT_DELETE_FAILED")
		}
		return c.body(null, 204)
	})

	// POST /api/v1/chats/:id/attachments — anexa um PDF/DOCX à conversa avulsa
	.post("/api/v1/chats/:id/attachments", zValidator("form", AttachmentFormSchema), async (c) => {
		const thread = await ownedThread(c)
		if (!thread) return notFound(c)
		if (thread.submission_id) {
			return c.json(
				{
					error: "Conflict",
					code: "CHAT_ATTACHMENTS_NOT_ALLOWED",
					message: "a conversa do processo usa o documento do processo; anexe arquivos numa conversa avulsa",
				},
				409
			)
		}

		const { file } = c.req.valid("form")
		const storagePath = buildSubmissionStoragePath(`${thread.user_id}/${thread.id}`, file.type)
		if (!storagePath) return c.json({ error: "Unsupported Media Type", code: "UNSUPPORTED_FORMAT", message: "envie um PDF ou DOCX" }, 415)
		if (file.size > MAX_SUBMISSION_BYTES) return c.json({ error: "Payload Too Large", code: "FILE_TOO_LARGE", max_bytes: MAX_SUBMISSION_BYTES }, 413)

		const { count, error: countError } = await supabase.from("chat_attachment").select("id", { count: "exact", head: true }).eq("thread_id", thread.id)
		if (countError) return failed(c, "ATTACHMENTS_FAILED")
		if ((count ?? 0) >= MAX_ATTACHMENTS_PER_THREAD) return attachmentLimit(c)

		const bytes = new Uint8Array(await file.arrayBuffer())
		let sections: ReturnType<typeof toSections>
		try {
			// Teto de páginas ANTES da leitura inteira, como no envio de submissão.
			await inspectSubmissionDocument(bytes, file.type)
			sections = toSections(await toSubmissionText(bytes, file.type))
		} catch (readError) {
			if (readError instanceof DocumentLimitError) return c.json({ error: "Unprocessable Entity", code: "DOCUMENT_TOO_LARGE", message: readError.message }, 422)
			console.error("[chat] anexo não pôde ser lido:", readError)
			return c.json({ error: "Unprocessable Entity", code: "UNREADABLE_DOCUMENT", message: "não foi possível ler o arquivo" }, 422)
		}
		if (!sections.text.trim()) {
			// PDF escaneado sem camada de texto: aceitar seria prometer uma conversa sobre
			// um documento que o modelo nunca vai ver.
			return c.json({ error: "Unprocessable Entity", code: "NO_TEXT", message: "o arquivo não tem texto legível (PDF escaneado?)" }, 422)
		}

		const { error: uploadError } = await supabase.storage.from(CHAT_ATTACHMENT_BUCKET).upload(storagePath, bytes, { contentType: file.type, upsert: false })
		if (uploadError) return failed(c, "UPLOAD_FAILED", 502)

		const { data, error } = await supabase
			.from("chat_attachment")
			.insert({
				thread_id: thread.id,
				storage_path: storagePath,
				filename: sanitizeSubmissionFilename(file.name, file.type),
				mime_type: file.type,
				size_bytes: file.size,
				text_chars: sections.text.length,
			})
			.select("id, filename, mime_type, size_bytes, text_chars, created_at")
			.single()
		if (error || !data) {
			await supabase.storage.from(CHAT_ATTACHMENT_BUCKET).remove([storagePath])
			return failed(c, "ATTACHMENT_CREATE_FAILED")
		}

		// Dois envios simultâneos passam juntos pela contagem acima. Quem ficou além do teto
		// desfaz o próprio anexo — o arquivo primeiro, pela regra de `threads.ts`.
		const { data: siblings, error: siblingsError } = await supabase
			.from("chat_attachment")
			.select("id")
			.eq("thread_id", thread.id)
			.order("created_at", { ascending: true })
			.order("id")
		if (!siblingsError && (siblings ?? []).findIndex((row) => row.id === data.id) >= MAX_ATTACHMENTS_PER_THREAD) {
			const { error: removeError } = await supabase.storage.from(CHAT_ATTACHMENT_BUCKET).remove([storagePath])
			if (removeError) {
				// Arquivo que não saiu do Storage mantém a linha: sem ela, ninguém o acharia de novo.
				console.error(`[chat] anexo excedente ${data.id} não removido do Storage: ${removeError.message}`)
				return attachmentLimit(c)
			}
			const { error: rollbackError } = await supabase.from("chat_attachment").delete().eq("id", data.id)
			if (rollbackError) console.error(`[chat] linha do anexo excedente ${data.id} não removida: ${rollbackError.message}`)
			return attachmentLimit(c)
		}

		rememberDocument(CHAT_ATTACHMENT_BUCKET, storagePath, sections)
		await touchThread(thread.id, thread.title ? {} : { title: titleFrom(data.filename) })
		return c.json(data, 201)
	})

	// DELETE /api/v1/chats/:id/attachments/:attachmentId
	.delete("/api/v1/chats/:id/attachments/:attachmentId", async (c) => {
		const thread = await ownedThread(c)
		if (!thread) return notFound(c)

		const { data: attachment, error } = await supabase
			.from("chat_attachment")
			.select("id, storage_path")
			.eq("id", c.req.param("attachmentId"))
			.eq("thread_id", thread.id)
			.maybeSingle()
		if (error) return failed(c, "ATTACHMENTS_FAILED")
		if (!attachment) return c.json({ error: "Not Found", code: "ATTACHMENT_NOT_FOUND" }, 404)

		const { error: storageError } = await supabase.storage.from(CHAT_ATTACHMENT_BUCKET).remove([attachment.storage_path])
		if (storageError) return failed(c, "STORAGE_DELETE_FAILED", 502)
		const { error: deleteError } = await supabase.from("chat_attachment").delete().eq("id", attachment.id)
		if (deleteError) return failed(c, "ATTACHMENT_DELETE_FAILED")
		return c.body(null, 204)
	})

	// POST /api/v1/chats/:id/messages/stream — um turno, por SSE
	.post("/api/v1/chats/:id/messages/stream", zValidator("json", MessageBodySchema), async (c) => {
		const user = c.get("user")
		const thread = await ownedThread(c)
		if (!thread) return notFound(c)
		const { message } = c.req.valid("json")

		// Tudo o que pode recusar o turno vem ANTES do SSE: depois que o stream abre não há
		// mais status HTTP, e o erro vira conexão cortada sem mensagem.
		if (thread.submission_id && !(await canReadSubmission(thread.submission_id, user, c.get("access")))) {
			return c.json({ error: "Forbidden", code: "SUBMISSION_ACCESS_REVOKED", message: "você não tem mais acesso a este processo" }, 403)
		}

		const limit = await dailyLimitState(user.id, env.ALPHA_CHAT_MAX_TURNS_PER_DAY, new Date())
		if (limit === null) return failed(c, "RATE_LIMIT_CHECK_FAILED")
		if (limit.blocked) {
			return c.json(
				{
					error: "Too Many Requests",
					code: "CHAT_DAILY_LIMIT",
					message: `limite de ${env.ALPHA_CHAT_MAX_TURNS_PER_DAY} perguntas em 24 horas atingido`,
					retry_after: limit.retryAt.toISOString(),
				},
				429,
				{ "retry-after": String(Math.max(1, Math.ceil((limit.retryAt.getTime() - Date.now()) / 1000))) }
			)
		}

		let sources: TurnSources
		try {
			sources = thread.submission_id ? await loadProcessSources(thread.submission_id) : await loadAttachmentSources(thread.id)
		} catch (error) {
			console.error(`[chat] fontes da conversa ${thread.id} não carregadas:`, error)
			return failed(c, error instanceof SourceLoadError ? "SOURCES_UNAVAILABLE" : "INTERNAL_ERROR", 502)
		}

		const { data: stored, error: historyError } = await supabase
			.from("chat_message")
			.select("role, content, status")
			.eq("thread_id", thread.id)
			.order("created_at", { ascending: true })
		if (historyError) return failed(c, "MESSAGES_FAILED")

		// A pergunta é gravada ANTES do modelo: o teto diário a conta, e um turno que cai no
		// meio continua no histórico da tela, seguido de "resposta interrompida".
		const { error: insertError } = await supabase.from("chat_message").insert({ thread_id: thread.id, user_id: user.id, role: "user", content: message })
		if (insertError) return failed(c, "MESSAGE_CREATE_FAILED")
		await touchThread(thread.id, thread.title ? {} : { title: titleFrom(message) })

		const bundle = buildSourceBundle(sources.documents, env.ALPHA_CHAT_DOC_MAX_CHARS)
		const sourcesBlock = buildSourcesBlock(sources, bundle, conversationNonce(thread.id))
		const history = buildHistory((stored ?? []) as StoredMessage[])

		return streamSSE(c, async (stream) => {
			const run = new AbortController()
			let timedOut = false
			const startMs = Date.now()
			let streamed = ""

			// Os callbacks do agente são síncronos; a escrita no stream não. Uma fila garante a
			// ordem dos eventos e que nenhuma escrita fique para depois do `complete`.
			let queue: Promise<unknown> = Promise.resolve()
			const send = (event: string, data: unknown) => {
				queue = queue.then(() => stream.writeSSE({ event, data: JSON.stringify(data) })).catch(() => {})
			}

			c.req.raw.signal.addEventListener("abort", () => run.abort(), { once: true })
			const timeout = setTimeout(() => {
				timedOut = true
				run.abort()
			}, TURN_TIMEOUT_MS)
			const keepalive = setInterval(() => {
				queue = queue.then(() => stream.write(": keep-alive\n\n")).catch(() => {})
			}, KEEPALIVE_MS)

			const record = async (row: {
				content: string
				status: "complete" | "aborted" | "error"
				citations?: unknown
				model?: string
				usage?: { input_tokens: number; output_tokens: number }
			}) => {
				const { data, error } = await supabase
					.from("chat_message")
					.insert({
						thread_id: thread.id,
						user_id: user.id,
						role: "assistant",
						content: row.content,
						citations: row.citations ?? [],
						status: row.status,
						model: row.model ?? null,
						input_tokens: row.usage?.input_tokens ?? null,
						output_tokens: row.usage?.output_tokens ?? null,
						latency_ms: Date.now() - startMs,
					})
					.select("id")
					.single()
				if (error) console.error(`[chat] resposta da conversa ${thread.id} não gravada: ${error.message}`)
				return (data?.id as string | undefined) ?? null
			}

			send("status", { phase: "pensando" })
			try {
				const models = chatModels()
				const result = await runChatTurn(
					{
						rules: CHAT_SYSTEM_RULES,
						sources: sourcesBlock,
						history,
						question: message,
						documents: sources.documents,
						documentTools: bundle.summarized,
						signal: run.signal,
						onPhase: (phase) => send("status", { phase }),
						onDelta: (text) => {
							streamed += text
							send("delta", { text })
						},
					},
					{ ...models, isTransient: isTransientModelFailure, searchNorms }
				)

				const resolved = resolveCitations(result.text.trim(), {
					normas: result.normas,
					findings: sources.mode === "processo" ? sources.findings : [],
					documents: sources.documents,
				})
				if (!resolved.content.trim()) {
					await record({ content: "", status: "error", model: result.model, usage: result.usage })
					send("error", { code: "EMPTY_ANSWER" })
					return
				}

				const messageId = await record({
					content: resolved.content,
					status: "complete",
					citations: resolved.citations,
					model: result.model,
					usage: result.usage,
				})
				send("complete", { message_id: messageId, content: resolved.content, citations: resolved.citations, dropped_citations: resolved.dropped })
			} catch (error) {
				const aborted = run.signal.aborted
				if (!aborted) console.error(`[chat] turno da conversa ${thread.id} falhou:`, error)
				// O que já foi para a tela fica gravado como parcial — sem citação, porque a
				// validação precisa do texto inteiro.
				await record({ content: streamed, status: aborted ? "aborted" : "error" })
				if (timedOut) send("error", { code: "TURN_TIMEOUT" })
				else if (!aborted) send("error", { code: isTransientModelFailure(error) ? "MODEL_UNAVAILABLE" : "INTERNAL_ERROR" })
			} finally {
				clearTimeout(timeout)
				clearInterval(keepalive)
				await queue
			}
		})
	})

function attachmentLimit(c: Context) {
	return c.json({ error: "Conflict", code: "CHAT_ATTACHMENT_LIMIT", message: `no máximo ${MAX_ATTACHMENTS_PER_THREAD} arquivos por conversa` }, 409)
}
