/**
 * @module notifications.fn
 * Caixa de entrada do sino do hub.
 *
 * O sino junta DUAS coisas que não têm a mesma natureza, e a diferença é o
 * desenho inteiro:
 *
 *   • **Armazenado** (`sucont.notification`) — o que NÃO é recomputável. Um aviso
 *     novo, um prazo que passou sem execução. Se a linha não existir, ninguém
 *     nunca saberá que aconteceu. É o que conta para a bolinha vermelha.
 *   • **Derivado** (`sucont.checklist_current`) — os prazos que estão por vencer.
 *     Uma consulta responde certo a qualquer momento, mesmo se ninguém abriu o app
 *     por uma semana e mesmo se o cron falhou ontem. Não gasta linha e NÃO entra no
 *     contador: prazo de sexta-feira não é novidade toda vez que a página carrega,
 *     e um contador que nunca zera é um contador que o usuário aprende a ignorar.
 *
 * O fan-out (uma linha por destinatário) e o `resolved_at` são gatilho no banco,
 * não código daqui — ver 20260910190600. Aqui só se LÊ e se marca como lida.
 */

import type { SucontNotification } from "@iefa/database/sucont"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireSucontAccess } from "#/lib/auth.server"
import { addDays, todayInBrasilia } from "#/lib/brasilia"
import { UPCOMING_WINDOW_DAYS } from "#/lib/checklist"
import { getSucontServerClient } from "#/lib/supabase.server"

/**
 * Teto de itens do painel. É da CONSULTA, não do storage: a purga do banco é por
 * tempo (30 dias resolvida, 180 dias no total), e o armazenamento não precisa
 * saber que a tela mostra 50.
 */
const INBOX_LIMIT = 50

export type NotificationItem = Pick<SucontNotification, "id" | "kind" | "title" | "body" | "href" | "created_at" | "read_at">

export type UpcomingDeadline = {
	itemId: string
	task: string
	deadline: string | null
	dueOn: string
	competencia: string
}

export type NotificationInbox = {
	items: NotificationItem[]
	/** Não lidas — o número da bolinha. Contado no banco, sem o teto da lista. */
	unread: number
	upcoming: UpcomingDeadline[]
}

/**
 * Caixa de entrada do usuário da sessão.
 *
 * `requireSucontAccess()` devolve o contexto e o `userId` sai DELE, nunca do
 * cliente — é a mesma trava que fechou o IDOR de `fetchUserPermissions` no sisub.
 * Um `userId` de parâmetro aqui entregaria a caixa de entrada de qualquer um.
 */
export const listNotificationsFn = createServerFn({ method: "GET" }).handler(async (): Promise<NotificationInbox> => {
	const ctx = await requireSucontAccess()
	const db = getSucontServerClient()
	const today = todayInBrasilia()
	const upcomingUntil = addDays(today, UPCOMING_WINDOW_DAYS)

	const [inbox, unread, deadlines] = await Promise.all([
		// Resolvida não aparece: o fato deixou de ser verdade (o aviso foi apagado,
		// a tarefa foi marcada como feita). Ela continua na tabela até a purga só
		// para que a purga possa contar os 30 dias a partir da resolução.
		db
			.from("notification")
			.select("id, kind, title, body, href, created_at, read_at")
			.eq("user_id", ctx.userId)
			.is("resolved_at", null)
			.order("created_at", { ascending: false })
			.limit(INBOX_LIMIT),
		db.from("notification").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).is("resolved_at", null).is("read_at", null),
		db
			.from("checklist_current")
			.select("id, task, deadline, due_on, competencia")
			.is("done_at", null)
			.gte("due_on", today)
			.lte("due_on", upcomingUntil)
			.order("due_on", { ascending: true }),
	])

	if (inbox.error) throw new Error(inbox.error.message)
	if (unread.error) throw new Error(unread.error.message)
	if (deadlines.error) throw new Error(deadlines.error.message)

	return {
		items: inbox.data ?? [],
		unread: unread.count ?? 0,
		upcoming: (deadlines.data ?? []).flatMap((row) =>
			// A view resolve `due_on` e `competencia` para todo item, mas o tipo
			// gerado da view é nullable em toda coluna. Descartar em vez de fingir
			// com `!`: item sem prazo não tem o que anunciar.
			row.id && row.due_on && row.competencia
				? [{ itemId: row.id, task: row.task ?? "", deadline: row.deadline, dueOn: row.due_on, competencia: row.competencia }]
				: []
		),
	}
})

/**
 * Marca notificações como lidas. Sem `ids`, marca todas as não lidas do usuário —
 * é o que o sino faz ao abrir.
 *
 * O `eq("user_id")` não é redundante com o `in("id")`: sem ele, um id de outra
 * pessoa vindo do cliente marcaria a notificação dela como lida.
 */
export const markNotificationsReadFn = createServerFn({ method: "POST" })
	.validator(z.object({ ids: z.array(z.uuid()).optional() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		const ctx = await requireSucontAccess()
		let query = getSucontServerClient().from("notification").update({ read_at: new Date().toISOString() }).eq("user_id", ctx.userId).is("read_at", null)
		if (data.ids && data.ids.length > 0) query = query.in("id", data.ids)

		const { error } = await query
		if (error) throw new Error(error.message)
		return { ok: true }
	})
