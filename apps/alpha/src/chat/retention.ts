/**
 * Guarda das conversas (Política de Privacidade do contrate).
 *
 * - avulsa não salva: apagada depois de {@link RETENTION_DAYS} dias sem atividade;
 * - salva: fica até o dono apagar;
 * - de processo: vive com o processo (`on delete cascade`), fora desta regra.
 *
 * "Deixar de salvar" toca `last_activity_at` (rota `PATCH /chats/:id`), então desmarcar uma
 * conversa antiga reinicia o prazo em vez de apagá-la na rodada seguinte, sem aviso.
 *
 * Puro: a rotina (`jobs/purge-chats.ts`) e a API (`purge_at` da resposta) usam as mesmas
 * duas funções, e a tela mostra a data que a rotina vai de fato respeitar.
 */

export const RETENTION_DAYS = 180

const DAY_MS = 24 * 60 * 60 * 1000

export interface RetentionFields {
	submission_id: string | null
	saved_at: string | null
	last_activity_at: string
}

/** Quando a conversa será apagada, ou `null` se ela não expira. */
export function purgeAt(thread: RetentionFields): Date | null {
	if (thread.submission_id !== null || thread.saved_at !== null) return null
	return new Date(new Date(thread.last_activity_at).getTime() + RETENTION_DAYS * DAY_MS)
}

/** A rotina pode apagar esta conversa agora? */
export function isPurgeable(thread: RetentionFields, now: Date): boolean {
	const at = purgeAt(thread)
	return at !== null && at.getTime() <= now.getTime()
}

/** Corte da consulta da rotina: `last_activity_at` igual ou anterior a isto é elegível. */
export function purgeCutoff(now: Date): Date {
	return new Date(now.getTime() - RETENTION_DAYS * DAY_MS)
}
