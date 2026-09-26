import type { SnackRequestSummary } from "@iefa/sisub-domain"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, ChefHat, ChevronLeft, ChevronRight, Info, Plane, Tag, Truck } from "lucide-react"
import { useState } from "react"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { snackProductionSummaryQueryOptions } from "@/hooks/data/useSnackRequests"
import { addDaysToCivilDate, classLabel, formatCivilDateLong, formatInt, formatTime, kitsByClass, lineKits } from "./format"
import { SnackLoadError, SnackRequestFlagBadges, SnackStatusBadge } from "./SnackBadges"
import { SnackLabelsDialog } from "./SnackLabels"

interface SnackProductionDayProps {
	kitchenId: number
	kitchenIdStr: string
	date: string
	today: string
	onDateChange: (date: string) => void
}

export function SnackProductionDay({ kitchenId, kitchenIdStr, date, today, onDateChange }: SnackProductionDayProps) {
	const { data: summary, error, isLoading, refetch } = useQuery(snackProductionSummaryQueryOptions(kitchenId, date))
	const [labelsOpen, setLabelsOpen] = useState(false)

	const requests = summary?.requests ?? []
	const byId = new Map(requests.map((r) => [r.id, r]))
	// Os próprios pedidos vão para as etiquetas: o summary já traz missão, kits, preparações,
	// kcal, coleta da amostra e validade do padrão — não há uma busca por pedido a fazer.
	const labelRequests = requests.filter((r) => r.lines.some((l) => lineKits(l) > 0))

	const originLinks = (ids: string[]) => (
		<div className="flex flex-wrap gap-x-3 gap-y-1">
			{ids.map((id) => {
				const r = byId.get(id)
				return (
					<Link
						key={id}
						to="/kitchen/$kitchenId/snack-requests/$requestId"
						params={{ kitchenId: kitchenIdStr, requestId: id }}
						className="text-caption text-primary underline-offset-4 hover:underline"
					>
						{r ? `${formatTime(r.pickup_at)} ${r.mission_description}` : "Pedido"}
					</Link>
				)
			})}
		</div>
	)

	return (
		<div className="space-y-6">
			<PageHeader title="Produção do dia — Pedidos de Lanche" description={formatCivilDateLong(date)}>
				<Button
					size="sm"
					variant="ghost"
					nativeButton={false}
					render={
						<Link to="/kitchen/$kitchenId/snack-requests" params={{ kitchenId: kitchenIdStr }}>
							<ArrowLeft className="size-4 mr-1.5" aria-hidden="true" />
							Fila
						</Link>
					}
				/>
				<Button size="sm" onClick={() => setLabelsOpen(true)} disabled={labelRequests.length === 0}>
					<Tag className="size-4 mr-1.5" aria-hidden="true" />
					Etiquetas do dia
				</Button>
			</PageHeader>

			<div className="flex flex-wrap items-end gap-2">
				<Button size="icon-sm" variant="outline" aria-label="Dia anterior" onClick={() => onDateChange(addDaysToCivilDate(date, -1))}>
					<ChevronLeft aria-hidden="true" />
				</Button>
				<Field className="w-44">
					<FieldLabel htmlFor="snack-production-date">Data de retirada</FieldLabel>
					<Input id="snack-production-date" type="date" value={date} onChange={(e) => e.target.value && onDateChange(e.target.value)} />
				</Field>
				<Button size="icon-sm" variant="outline" aria-label="Dia seguinte" onClick={() => onDateChange(addDaysToCivilDate(date, 1))}>
					<ChevronRight aria-hidden="true" />
				</Button>
				{date !== today && (
					<Button size="sm" variant="ghost" onClick={() => onDateChange(today)}>
						Hoje
					</Button>
				)}
			</div>

			<Alert>
				<Info aria-hidden="true" />
				<AlertTitle>Os mesmos itens estão no quadro da Produção Cozinha</AlertTitle>
				<AlertDescription>
					<p>
						Cada pedido aceito entra no quadro de produção sob “Lanches de Bordo/Apoio”, discriminado por pedido. Este consolidado soma os pedidos aceitos, em
						produção e prontos com retirada no dia — use-o para separar insumos e material.
					</p>
					<Button
						size="sm"
						variant="outline"
						className="mt-2"
						nativeButton={false}
						render={
							<Link to="/kitchen-production/$kitchenId" params={{ kitchenId: kitchenIdStr }}>
								<ChefHat className="size-4 mr-1.5" aria-hidden="true" />
								Abrir o quadro de produção
							</Link>
						}
					/>
				</AlertDescription>
			</Alert>

			{error ? (
				<SnackLoadError what="o consolidado de produção" error={error} onRetry={() => void refetch()} />
			) : isLoading || !summary ? (
				<div className="grid gap-4 lg:grid-cols-2" aria-hidden="true">
					{[1, 2, 3, 4].map((i) => (
						<div key={i} className="h-40 animate-pulse rounded-lg border bg-muted" />
					))}
				</div>
			) : summary.requestCount === 0 ? (
				<Card>
					<CardContent>
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<ChefHat aria-hidden="true" />
								</EmptyMedia>
								<EmptyTitle>Nenhum lanche para produzir neste dia.</EmptyTitle>
								<EmptyDescription>
									Entram aqui os pedidos aceitos, em produção ou prontos com retirada nesta data. Pedidos ainda a decidir não contam — aceite-os na fila para
									que entrem no consolidado.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					</CardContent>
				</Card>
			) : (
				<>
					<div className="grid gap-6 lg:grid-cols-2">
						<Card>
							<CardHeader>
								<CardTitle>Kits por padrão</CardTitle>
								<CardDescription>
									<span className="font-mono tabular-nums">{summary.requestCount}</span> {summary.requestCount === 1 ? "pedido" : "pedidos"} no dia.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="rounded-md border">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Padrão</TableHead>
												<TableHead className="text-right">Kits</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{summary.standards.map((s) => (
												<TableRow key={s.standardId}>
													<TableCell className="whitespace-normal">
														<div className="text-body text-foreground">{s.name}</div>
														<div className="text-caption text-muted-foreground">{classLabel(s.family, s.snackClass)}</div>
														{originLinks(s.requestIds)}
													</TableCell>
													<TableCell className="text-right align-top font-mono tabular-nums">{formatInt(s.kits)}</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Porções por preparação</CardTitle>
								<CardDescription>Soma de todos os padrões que usam a preparação.</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="rounded-md border">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Preparação</TableHead>
												<TableHead className="text-right">Porções</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{summary.recipes.map((r) => (
												<TableRow key={r.recipeId}>
													<TableCell className="whitespace-normal">
														<div className="text-body text-foreground">{r.recipeName}</div>
														{originLinks(r.requestIds)}
													</TableCell>
													<TableCell className="text-right align-top font-mono tabular-nums">{formatInt(r.portions)}</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							</CardContent>
						</Card>
					</div>

					<Card>
						<CardHeader>
							<CardTitle>Material de apoio previsto</CardTitle>
							<CardDescription>Itens do Anexo E pedidos para o dia.</CardDescription>
						</CardHeader>
						<CardContent>
							<dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
								{(
									[
										["Água", summary.materials.water],
										["Copos", summary.materials.cups],
										["Gelo", summary.materials.ice],
										["Café", summary.materials.coffee],
									] as const
								).map(([label, value]) => (
									<div key={label} className="rounded-lg border px-3 py-2">
										<dt className="text-caption text-muted-foreground">{label}</dt>
										<dd className="text-heading text-foreground font-mono tabular-nums">{formatInt(value)}</dd>
									</div>
								))}
							</dl>
						</CardContent>
					</Card>

					<section className="space-y-2" aria-labelledby="snack-production-requests">
						<h2 id="snack-production-requests" className="text-label text-foreground">
							Pedidos do dia
						</h2>
						<ItemGroup>
							{requests.map((r) => (
								<ProductionRequestItem key={r.id} request={r} kitchenIdStr={kitchenIdStr} />
							))}
						</ItemGroup>
					</section>
				</>
			)}

			<SnackLabelsDialog open={labelsOpen} onOpenChange={setLabelsOpen} requests={labelRequests} title={`Etiquetas do dia — ${formatCivilDateLong(date)}`} />
		</div>
	)
}

function ProductionRequestItem({ request, kitchenIdStr }: { request: SnackRequestSummary; kitchenIdStr: string }) {
	const KindIcon = request.mission_kind === "aerea" ? Plane : Truck
	const kits = kitsByClass(request)
	return (
		<Item variant="outline">
			<ItemMedia variant="icon">
				<KindIcon aria-hidden="true" />
			</ItemMedia>
			<ItemContent className="min-w-0">
				<ItemTitle className="line-clamp-2">
					<span className="font-mono tabular-nums">{formatTime(request.pickup_at)}</span> · {request.mission_description}
				</ItemTitle>
				<ItemDescription>
					{request.requester_unit_label} · retirada por {request.pickup_responsible} · {kits.map((k) => `${k.label}: ${formatInt(k.kits)}`).join(" · ")}
				</ItemDescription>
				<SnackRequestFlagBadges request={request} />
			</ItemContent>
			<ItemActions>
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
