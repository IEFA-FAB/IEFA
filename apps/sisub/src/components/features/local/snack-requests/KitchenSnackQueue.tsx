import type { SnackRequestSummary } from "@iefa/sisub-domain"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ChefHat, Plane, PlaneTakeoff, Truck } from "lucide-react"
import { useMemo } from "react"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { kitchenSnackRequestsQueryOptions } from "@/hooks/data/useSnackRequests"
import {
	formatCivilDateLong,
	formatInt,
	formatTime,
	kitsByClass,
	MISSION_KIND_LABELS,
	pickupCivilDate,
	QUEUE_TAB_KEYS,
	QUEUE_TABS,
	type QueueTab,
} from "./format"
import { SnackLoadError, SnackRequestFlagBadges, SnackStatusBadge } from "./SnackBadges"

export type KitchenSnackQueueSearch = { tab: QueueTab; from: string; to: string }

interface KitchenSnackQueueProps {
	kitchenId: number
	kitchenIdStr: string
	search: KitchenSnackQueueSearch
	/** Período padrão (hoje → +7 dias), para o botão de voltar ao padrão. */
	defaultRange: { from: string; to: string }
	today: string
	onSearchChange: (next: Partial<KitchenSnackQueueSearch>) => void
}

const EMPTY_MESSAGES: Record<QueueTab, { title: string; description: string }> = {
	decide: {
		title: "Nenhum pedido aguardando decisão no período.",
		description:
			"Quando um comensal enviar uma requisição de Lanche de Bordo ou de Apoio para esta cozinha, ela aparece aqui para a SSU aceitar — informando o valor do lanche — ou recusar com o motivo.",
	},
	ongoing: {
		title: "Nenhum pedido em andamento no período.",
		description: "Pedidos aceitos, em produção, prontos ou retirados com retirada no período aparecem aqui. Amplie o período se procura um pedido mais antigo.",
	},
	closed: {
		title: "Nenhum pedido encerrado no período.",
		description: "Pedidos encerrados, recusados ou cancelados ficam aqui como histórico. Amplie o período para ver retiradas anteriores.",
	},
}

export function KitchenSnackQueue({ kitchenId, kitchenIdStr, search, defaultRange, today, onSearchChange }: KitchenSnackQueueProps) {
	const range = { from: search.from, to: search.to }
	const rangeValid = range.from <= range.to

	// "A decidir" é sempre buscado: dá o contador da aba mesmo quando outra aba está aberta.
	// Mesma chave de cache da lista quando a aba ativa é ela.
	const decideQuery = useQuery({
		...kitchenSnackRequestsQueryOptions(kitchenId, { ...range, statuses: [...QUEUE_TABS.decide.statuses] }),
		enabled: rangeValid,
	})
	const tabQuery = useQuery({
		...kitchenSnackRequestsQueryOptions(kitchenId, { ...range, statuses: [...QUEUE_TABS[search.tab].statuses] }),
		enabled: rangeValid && search.tab !== "decide",
	})
	const active = search.tab === "decide" ? decideQuery : tabQuery
	const { data: requests, error, isLoading, refetch } = active

	const byDay = useMemo(() => {
		const groups = new Map<string, SnackRequestSummary[]>()
		for (const request of requests ?? []) {
			const day = pickupCivilDate(request.pickup_at)
			const list = groups.get(day) ?? []
			list.push(request)
			groups.set(day, list)
		}
		return [...groups.entries()]
	}, [requests])

	const isDefaultRange = range.from === defaultRange.from && range.to === defaultRange.to
	const decideCount = decideQuery.data?.length

	return (
		<div className="space-y-6">
			<PageHeader title="Lanches de Bordo/Apoio" description="Requisições de lanche para missões aéreas e terrestres, ordenadas pela retirada.">
				<Button
					size="sm"
					variant="outline"
					nativeButton={false}
					render={
						<Link to="/kitchen/$kitchenId/snack-requests/production" params={{ kitchenId: kitchenIdStr }} search={{ date: today }}>
							<ChefHat className="size-4 mr-2" aria-hidden="true" />
							Produção do dia
						</Link>
					}
				/>
			</PageHeader>

			<div className="flex flex-wrap items-end justify-between gap-4">
				<Tabs value={search.tab} onValueChange={(value) => onSearchChange({ tab: value as QueueTab })}>
					<TabsList>
						{QUEUE_TAB_KEYS.map((key) => (
							<TabsTrigger key={key} value={key}>
								{QUEUE_TABS[key].label}
								{key === "decide" && decideCount != null && decideCount > 0 && (
									<Badge variant="warning" className="font-mono tabular-nums">
										{decideCount}
									</Badge>
								)}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>

				<div className="flex flex-wrap items-end gap-3">
					<Field className="w-40">
						<FieldLabel htmlFor="snack-queue-from">Retirada de</FieldLabel>
						<Input
							id="snack-queue-from"
							type="date"
							value={range.from}
							max={range.to}
							onChange={(e) => e.target.value && onSearchChange({ from: e.target.value })}
						/>
					</Field>
					<Field className="w-40">
						<FieldLabel htmlFor="snack-queue-to">até</FieldLabel>
						<Input
							id="snack-queue-to"
							type="date"
							value={range.to}
							min={range.from}
							onChange={(e) => e.target.value && onSearchChange({ to: e.target.value })}
						/>
					</Field>
					{!isDefaultRange && (
						<Button size="sm" variant="ghost" onClick={() => onSearchChange(defaultRange)}>
							Próximos 7 dias
						</Button>
					)}
				</div>
			</div>

			{!rangeValid ? (
				<Card>
					<CardContent className="py-8 text-center">
						<p className="text-body text-muted-foreground">A data inicial do período é posterior à final.</p>
					</CardContent>
				</Card>
			) : error ? (
				<SnackLoadError what="os pedidos de lanche" error={error} onRetry={() => void refetch()} />
			) : isLoading ? (
				<div className="space-y-3" aria-hidden="true">
					{[1, 2, 3].map((i) => (
						<div key={i} className="h-24 animate-pulse rounded-lg border bg-muted" />
					))}
				</div>
			) : byDay.length === 0 ? (
				<Card>
					<CardContent>
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<PlaneTakeoff aria-hidden="true" />
								</EmptyMedia>
								<EmptyTitle>{EMPTY_MESSAGES[search.tab].title}</EmptyTitle>
								<EmptyDescription>{EMPTY_MESSAGES[search.tab].description}</EmptyDescription>
							</EmptyHeader>
						</Empty>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-6">
					{byDay.map(([day, dayRequests]) => (
						<section key={day} className="space-y-2" aria-label={formatCivilDateLong(day)}>
							<div className="flex items-center justify-between gap-2">
								<h2 className="text-label text-foreground">
									{formatCivilDateLong(day)}
									{day === today && " · hoje"}
								</h2>
								<Button
									size="sm"
									variant="ghost"
									nativeButton={false}
									render={
										<Link to="/kitchen/$kitchenId/snack-requests/production" params={{ kitchenId: kitchenIdStr }} search={{ date: day }}>
											<ChefHat className="size-4 mr-1.5" aria-hidden="true" />
											Produção do dia
										</Link>
									}
								/>
							</div>
							<ItemGroup>
								{dayRequests.map((request) => (
									<SnackQueueItem key={request.id} request={request} kitchenIdStr={kitchenIdStr} />
								))}
							</ItemGroup>
						</section>
					))}
					{(requests?.length ?? 0) >= 300 && (
						<p className="text-caption text-muted-foreground">Mostrando os 300 primeiros pedidos do período. Reduza o período para ver os demais.</p>
					)}
				</div>
			)}
		</div>
	)
}

function SnackQueueItem({ request, kitchenIdStr }: { request: SnackRequestSummary; kitchenIdStr: string }) {
	const kits = kitsByClass(request)
	const people = request.crew_count + request.pax_count
	const KindIcon = request.mission_kind === "aerea" ? Plane : Truck

	return (
		<Item variant="outline" className="flex-wrap sm:flex-nowrap">
			<ItemMedia variant="icon">
				<KindIcon aria-hidden="true" />
			</ItemMedia>
			<ItemContent className="min-w-0">
				<ItemTitle className="line-clamp-2">
					<Link
						to="/kitchen/$kitchenId/snack-requests/$requestId"
						params={{ kitchenId: kitchenIdStr, requestId: request.id }}
						className="hover:underline underline-offset-4"
					>
						{request.mission_description}
					</Link>
				</ItemTitle>
				<ItemDescription>
					{request.requester.label} · {request.requester_unit_label} · {MISSION_KIND_LABELS[request.mission_kind] ?? request.mission_kind}
				</ItemDescription>
				<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
					<span>
						Retirada <span className="font-mono tabular-nums text-foreground">{formatTime(request.pickup_at)}</span>
					</span>
					<span>
						<span className="font-mono tabular-nums text-foreground">{formatInt(people)}</span> {people === 1 ? "pessoa" : "pessoas"} (
						<span className="font-mono tabular-nums">{request.crew_count}</span> trip. + <span className="font-mono tabular-nums">{request.pax_count}</span>{" "}
						pax)
					</span>
					{kits.map((k) => (
						<span key={k.key}>
							{k.label}: <span className="font-mono tabular-nums text-foreground">{formatInt(k.kits)}</span>
							{k.kits !== k.requested && <span className="font-mono tabular-nums"> de {formatInt(k.requested)}</span>}
							{" kits"}
						</span>
					))}
				</div>
				<SnackRequestFlagBadges request={request} />
			</ItemContent>
			<ItemActions className="w-full justify-end sm:w-auto">
				<SnackStatusBadge status={request.status} />
				<Button
					size="sm"
					variant="outline"
					nativeButton={false}
					render={
						<Link to="/kitchen/$kitchenId/snack-requests/$requestId" params={{ kitchenId: kitchenIdStr, requestId: request.id }}>
							Abrir
						</Link>
					}
				/>
			</ItemActions>
		</Item>
	)
}
