/**
 * Stub do `#/server/notifications.fn` para o harness — mesmo motivo dos demais: o
 * módulo real declara server functions do TanStack Start e importa
 * `lib/supabase.server`, que lê credencial na carga.
 *
 * A caixa de entrada é devolvida AQUI, e não semeada no cache do `hub.tsx`: as
 * options do sino têm `staleTime`, e dado semeado nasce sem `dataUpdatedAt` — o
 * react-query o considera velho na primeira renderização e refaz a busca, que
 * sobrescrevia a semente pelo retorno do stub. Um caso de cada natureza: pendência
 * não lida, pendência já lida e prazo derivado (que NÃO conta para a bolinha).
 */

export type NotificationItem = {
	id: string
	kind: string
	title: string
	body: string | null
	href: string | null
	created_at: string
	read_at: string | null
}

export type UpcomingDeadline = {
	itemId: string
	task: string
	deadline: string | null
	dueOn: string
	competencia: string
}

export type NotificationInbox = { items: NotificationItem[]; unread: number; upcoming: UpcomingDeadline[] }

export async function listNotificationsFn(): Promise<NotificationInbox> {
	return {
		unread: 2,
		items: [
			{
				id: "n1",
				kind: "prazo_perdido",
				title: "Relatório Depreciação > Bem",
				body: "Prazo 4º dia útil do mês venceu em 04/09/2026 sem registro de execução.",
				href: "/workspace",
				created_at: "2026-09-05T11:00:00Z",
				read_at: null,
			},
			{
				id: "n2",
				kind: "aviso",
				title: "Novo alerta da seção",
				body: "Lembrete: prazo final para carga de XML de depreciação se aproxima.",
				href: "/workspace",
				created_at: "2026-09-04T13:20:00Z",
				read_at: null,
			},
			{
				id: "n3",
				kind: "aviso",
				title: "Novo aviso da seção",
				body: "Reunião de alinhamento mensal agendada para o 1º dia útil.",
				href: "/workspace",
				created_at: "2026-09-01T12:00:00Z",
				read_at: "2026-09-01T18:00:00Z",
			},
		],
		upcoming: [
			{ itemId: "c1", task: "Acompanhamento Pós-Prestação de Contas", deadline: "1x por semana", dueOn: "2026-09-11", competencia: "2026-09-07" },
			{ itemId: "c2", task: "Conciliação Mensal de Contas de Trânsito", deadline: "Mensal", dueOn: "2026-09-30", competencia: "2026-09-01" },
		],
	}
}

export async function markNotificationsReadFn(): Promise<{ ok: true }> {
	return { ok: true }
}
