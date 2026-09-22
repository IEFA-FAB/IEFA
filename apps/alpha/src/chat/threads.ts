/**
 * Leitura e remoção de conversas — o que a API e a rotina de expurgo compartilham.
 *
 * Remover é sempre na mesma ordem: arquivos do Storage PRIMEIRO, linhas depois. O inverso
 * deixaria, numa queda do Storage no meio, arquivo com dado pessoal sem registro nenhum que
 * permita achá-lo de novo. Assim, a pior falha é a conversa continuar listada — e a próxima
 * tentativa (do usuário ou da rotina) termina o serviço.
 */

import { supabase } from "../db/supabase.ts"
import { CHAT_ATTACHMENT_BUCKET } from "./attachment-bucket.ts"
import { purgeAt } from "./retention.ts"

export const THREAD_COLUMNS = "id, user_id, submission_id, title, saved_at, created_at, last_activity_at"

/** Código Postgres de `invalid_text_representation` — o id da rota não é UUID. */
const INVALID_TEXT_REPRESENTATION = "22P02"

export type ThreadRow = {
	id: string
	user_id: string
	submission_id: string | null
	title: string | null
	saved_at: string | null
	created_at: string
	last_activity_at: string
}

/** A conversa como a API a devolve: com o prazo de expurgo já calculado pela mesma regra da rotina. */
export function presentThread(thread: ThreadRow) {
	return {
		id: thread.id,
		submission_id: thread.submission_id,
		kind: thread.submission_id ? ("processo" as const) : ("avulso" as const),
		title: thread.title,
		saved_at: thread.saved_at,
		created_at: thread.created_at,
		last_activity_at: thread.last_activity_at,
		purge_at: purgeAt(thread)?.toISOString() ?? null,
	}
}

/** A conversa, ou `null` se não existe. Erro de leitura LANÇA — "não existe" não é fallback de "não consegui ler". */
export async function loadThread(threadId: string): Promise<ThreadRow | null> {
	const { data, error } = await supabase.from("chat_thread").select(THREAD_COLUMNS).eq("id", threadId).maybeSingle()
	// Id que nem é UUID: não existe conversa com ele, e a rota responde o mesmo 404.
	if (error?.code === INVALID_TEXT_REPRESENTATION) return null
	if (error) throw new Error(`conversa ${JSON.stringify(threadId)} não lida: ${error.message}`)
	return (data as ThreadRow | null) ?? null
}

export async function touchThread(threadId: string, patch: { title?: string } = {}): Promise<void> {
	const { error } = await supabase
		.from("chat_thread")
		.update({ last_activity_at: new Date().toISOString(), ...patch })
		.eq("id", threadId)
	if (error) console.error(`[chat] atividade da conversa ${JSON.stringify(threadId)} não registrada: ${error.message}`)
}

export type RemoveOutcome = { ok: true } | { ok: false; reason: "storage" | "database"; message: string }

/** Apaga a conversa inteira: arquivos, depois a linha (mensagens e anexos caem em cascata). */
export async function removeThread(threadId: string): Promise<RemoveOutcome> {
	const { data: attachments, error } = await supabase.from("chat_attachment").select("storage_path").eq("thread_id", threadId)
	if (error) return { ok: false, reason: "database", message: error.message }

	const paths = (attachments ?? []).map((row) => row.storage_path as string)
	if (paths.length > 0) {
		// Objeto que já não existe não é erro no Storage: remover de novo é idempotente, e é
		// o que deixa duas tasks da rotina rodarem ao mesmo tempo sem se atrapalhar.
		const { error: storageError } = await supabase.storage.from(CHAT_ATTACHMENT_BUCKET).remove(paths)
		if (storageError) return { ok: false, reason: "storage", message: storageError.message }
	}

	const { error: deleteError } = await supabase.from("chat_thread").delete().eq("id", threadId)
	if (deleteError) return { ok: false, reason: "database", message: deleteError.message }
	return { ok: true }
}
