import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { AlertTriangle, Bell, CalendarClock, Loader2, Megaphone, UserRoundCheck } from "lucide-react"
import type React from "react"
import { useState } from "react"
import { useSucontAccess } from "#/auth/pbac"
import { Button } from "#/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover"
import { formatBrDate, todayInBrasilia } from "#/lib/brasilia"
import { notificationsQueryOptions } from "#/lib/notifications"
import { cn } from "#/lib/utils"
import { markNotificationsReadFn, type NotificationItem, type UpcomingDeadline } from "#/server/notifications.fn"

/**
 * Sino do cabeçalho do hub.
 *
 * O painel tem DUAS listas porque as duas coisas têm naturezas diferentes, e
 * misturá-las quebraria o significado da bolinha:
 *
 *   • **Pendências** — linhas de `sucont.notification`. Aconteceram uma vez e
 *     ninguém as recalcula: um aviso publicado, um prazo que passou sem execução.
 *     São elas, e só elas, que contam para o número.
 *   • **Próximos prazos** — derivados do cronograma. Estão sempre certos e nunca
 *     "chegam": o prazo de sexta é o mesmo prazo em toda carga de página. Se
 *     contassem, a bolinha nunca zeraria, e uma bolinha que nunca zera é uma
 *     bolinha que o usuário aprende a ignorar em três semanas.
 *
 * Abrir o painel marca as pendências como lidas — é o que o número promete
 * ("apareceu algo desde a última vez que olhei"), e não "há pendências em aberto",
 * que é o que a lista mostra.
 */
export function NotificationBell() {
	// `canAccessHub` (uma divisão qualquer), e NÃO `canUseApp`: a audiência do sino
	// é `sucont.notification_audience()`, que só enxerga grant de divisão. A conta
	// só-administradora nunca terá notificação, e montar o sino para ela deixava um
	// "não foi possível carregar" fixo no cabeçalho de todas as telas.
	const { canAccessHub } = useSucontAccess()
	const [open, setOpen] = useState(false)
	const queryClient = useQueryClient()

	// Enquanto a sessão não resolve, o botão não existe: montar um sino que
	// dispara 401 é pior do que não ter sino.
	const { data, isPending, isError } = useQuery({ ...notificationsQueryOptions(), enabled: canAccessHub })

	const markRead = useMutation({
		mutationFn: () => markNotificationsReadFn({ data: {} }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationsQueryOptions().queryKey }),
	})

	if (!canAccessHub) return null

	const unread = data?.unread ?? 0
	const items = data?.items ?? []
	const upcoming = data?.upcoming ?? []
	const label = unread > 0 ? `Notificações — ${unread} não lida${unread > 1 ? "s" : ""}` : "Notificações"

	function onOpenChange(next: boolean) {
		setOpen(next)
		// Só ao ABRIR, e só se houver o que marcar: um POST por fechamento de
		// popover é escrita gratuita no banco a cada clique fora.
		if (next && unread > 0 && !markRead.isPending) markRead.mutate()
	}

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			{/*
			 * Sem Tooltip, ao contrário do resto do cabeçalho: o balão abriria no foco
			 * e ficaria por cima do painel que o mesmo clique acabou de abrir. O nome
			 * acessível já vem do `aria-label`, e ele carrega a contagem.
			 */}
			<PopoverTrigger
				render={
					<Button type="button" variant="ghost" size="icon-sm" aria-label={label} className="relative text-muted-foreground hover:text-foreground">
						<Bell className="size-4" />
						{unread > 0 && (
							// `aria-hidden`: a contagem já está no `aria-label` do botão. Sem
							// isso o leitor de tela anuncia o número duas vezes, uma delas sem
							// dizer do que ele é.
							<span
								aria-hidden="true"
								className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-hint text-white tabular-nums"
							>
								{unread > 9 ? "9+" : unread}
							</span>
						)}
					</Button>
				}
			/>

			<PopoverContent align="end" sideOffset={8} className="w-90 gap-0 p-0">
				<div className="flex items-center justify-between border-b border-border px-4 py-3">
					<h2 className="text-label text-foreground">Notificações</h2>
					{markRead.isPending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
				</div>

				<div className="max-h-[26rem] overflow-y-auto">
					<InboxBody isPending={isPending} isError={isError} items={items} upcoming={upcoming} onNavigate={() => setOpen(false)} />
				</div>
			</PopoverContent>
		</Popover>
	)
}

/**
 * Conteúdo do painel.
 *
 * Carregando, falhou e vazio são TRÊS telas — §7.1 do contrato de estilo. Um `[]`
 * no lugar do erro faria uma consulta morta parecer uma caixa de entrada limpa, que
 * é a pior das três mensagens: a única que não pede nada do usuário.
 */
function InboxBody({
	isPending,
	isError,
	items,
	upcoming,
	onNavigate,
}: {
	isPending: boolean
	isError: boolean
	items: NotificationItem[]
	upcoming: UpcomingDeadline[]
	onNavigate: () => void
}) {
	if (isPending) return <p className="px-4 py-8 text-center text-caption text-muted-foreground">Carregando…</p>
	if (isError) return <p className="px-4 py-8 text-center text-caption text-destructive">Não foi possível carregar as notificações.</p>
	if (items.length === 0 && upcoming.length === 0) {
		return (
			<p className="px-4 py-8 text-center text-caption text-muted-foreground">
				Nada pendente. Os prazos do cronograma aparecem aqui a partir de uma semana antes.
			</p>
		)
	}

	return (
		<>
			{items.length > 0 && (
				<Section title="Pendências">
					{items.map((item) => (
						<PendingRow key={item.id} item={item} onNavigate={onNavigate} />
					))}
				</Section>
			)}
			{upcoming.length > 0 && (
				<Section title="Próximos prazos">
					{upcoming.map((deadline) => (
						<UpcomingRow key={`${deadline.itemId}-${deadline.competencia}`} deadline={deadline} onNavigate={onNavigate} />
					))}
				</Section>
			)}
		</>
	)
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="border-b border-border last:border-b-0">
			<h3 className="bg-muted/40 px-4 py-1.5 text-label text-muted-foreground">{title}</h3>
			<ul className="divide-y divide-border">{children}</ul>
		</section>
	)
}

/** Ícone e cor por tipo. Três coisas diferentes não podem chegar com a mesma cara. */
const KIND_STYLE = {
	prazo_perdido: { Icon: AlertTriangle, tone: "text-warning" },
	atribuicao: { Icon: UserRoundCheck, tone: "text-tech-cyan" },
	aviso: { Icon: Megaphone, tone: "text-action" },
} as const

function PendingRow({ item, onNavigate }: { item: NotificationItem; onNavigate: () => void }) {
	const { Icon, tone } = KIND_STYLE[item.kind as keyof typeof KIND_STYLE] ?? KIND_STYLE.aviso
	// `href` é coluna de texto: só rota interna entra no `to`. Hoje só os gatilhos
	// do banco escrevem ali, mas um destino absoluto vindo de uma linha da tabela
	// viraria redirecionamento externo a um clique de distância.
	const to = item.href?.startsWith("/") ? item.href : "/workspace"
	return (
		<li>
			<Link
				to={to as string}
				search={true}
				onClick={onNavigate}
				className={cn("flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50", !item.read_at && "bg-action/5")}
			>
				<Icon className={cn("mt-0.5 size-4 shrink-0", tone)} />
				<div className="min-w-0">
					<p className="truncate text-subheading text-foreground">{item.title}</p>
					{item.body && <p className="mt-0.5 line-clamp-2 text-caption text-muted-foreground">{item.body}</p>}
				</div>
			</Link>
		</li>
	)
}

function UpcomingRow({ deadline, onNavigate }: { deadline: UpcomingDeadline; onNavigate: () => void }) {
	const isToday = deadline.dueOn === todayInBrasilia()
	return (
		<li>
			<Link to="/workspace" search={true} onClick={onNavigate} className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
				<CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
				{/*
				 * A data fica na MESMA linha do rótulo do prazo, e não numa pílula à
				 * direita: num painel de 22rem a pílula comia metade da largura e
				 * "Conciliação Mensal de Contas de Trânsito" chegava ao usuário como
				 * "Conciliação Mensal de C…" — o título é o que identifica a tarefa.
				 */}
				<div className="min-w-0">
					<p className="line-clamp-2 text-subheading text-foreground">{deadline.task}</p>
					<p className="mt-0.5 text-caption text-muted-foreground">
						{deadline.deadline}
						{deadline.deadline ? " · " : ""}
						<span className={cn(isToday && "text-warning")}>{isToday ? "vence hoje" : `vence em ${formatBrDate(deadline.dueOn)}`}</span>
					</p>
				</div>
			</Link>
		</li>
	)
}
