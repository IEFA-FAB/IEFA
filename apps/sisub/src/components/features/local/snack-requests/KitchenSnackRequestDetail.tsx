import type { SnackRequestDetail } from "@iefa/sisub-domain"
import { entitlementKey, formatDuration, kcalRangeFor, MIN_LEAD_TIME_HOURS, SNACK_REQUEST_STATUS_LABELS, summarizeEntitlement } from "@iefa/sisub-domain/utils"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { AlertTriangle, ArrowLeft, ChefHat, Tag } from "lucide-react"
import { type ReactNode, useState } from "react"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { kitchenSnackRequestQueryOptions } from "@/hooks/data/useSnackRequests"
import { cn } from "@/lib/cn"
import {
	AUDIENCE_LABELS,
	asStatus,
	classLabel,
	entitlementKeyLabel,
	FAMILY_LABELS,
	FUNDING_LABELS,
	formatBrl,
	formatDateTime,
	formatInt,
	lineKits,
	MATERIAL_ITEM_LABELS,
	MISSION_KIND_LABELS,
	pickupCivilDate,
	VARIANT_LABELS,
} from "./format"
import { SnackLoadError, SnackRequestFlagBadges, SnackStatusBadge } from "./SnackBadges"
import { SnackLabelsDialog } from "./SnackLabels"
import { SnackRequestActions } from "./SnackRequestActions"

interface KitchenSnackRequestDetailProps {
	kitchenId: number
	kitchenIdStr: string
	requestId: string
}

export function KitchenSnackRequestDetail({ kitchenId, kitchenIdStr, requestId }: KitchenSnackRequestDetailProps) {
	const { data: request, error, isLoading, refetch } = useQuery(kitchenSnackRequestQueryOptions(requestId))
	const [labelsOpen, setLabelsOpen] = useState(false)

	const backButton = (
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
	)

	if (error) {
		return (
			<div className="space-y-6">
				<PageHeader title="Pedido de lanche">{backButton}</PageHeader>
				<SnackLoadError what="o pedido" error={error} onRetry={() => void refetch()} />
			</div>
		)
	}
	if (isLoading || !request) {
		return (
			<div className="space-y-4" aria-hidden="true">
				<div className="h-10 w-2/3 animate-pulse rounded-lg bg-muted" />
				<div className="h-40 animate-pulse rounded-lg border bg-muted" />
				<div className="h-64 animate-pulse rounded-lg border bg-muted" />
			</div>
		)
	}

	const status = asStatus(request.status)
	const hasKits = request.lines.some((l) => lineKits(l) > 0)
	const labelsAvailable = hasKits && (status === "accepted" || status === "in_production" || status === "ready" || status === "delivered")

	return (
		<div className="space-y-6">
			<PageHeader title={request.mission_description} badge={<SnackStatusBadge status={request.status} />}>
				{backButton}
				<Button
					size="sm"
					variant="outline"
					nativeButton={false}
					render={
						<Link to="/kitchen/$kitchenId/snack-requests/production" params={{ kitchenId: kitchenIdStr }} search={{ date: pickupCivilDate(request.pickup_at) }}>
							<ChefHat className="size-4 mr-1.5" aria-hidden="true" />
							Produção do dia
						</Link>
					}
				/>
				<Button size="sm" variant="outline" onClick={() => setLabelsOpen(true)} disabled={!labelsAvailable}>
					<Tag className="size-4 mr-1.5" aria-hidden="true" />
					Etiquetas
				</Button>
			</PageHeader>

			<SnackRequestFlagBadges request={request} />

			<Card>
				<CardHeader>
					<CardTitle>Próxima etapa</CardTitle>
					<CardDescription>{nextStepText(request)}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2">
					<SnackRequestActions request={request} kitchenId={kitchenId} />
				</CardContent>
			</Card>

			<Justifications request={request} />

			<div className="grid gap-6 lg:grid-cols-2">
				<MissionCard request={request} />
				<PeopleCard request={request} />
			</div>

			<CalculatorComparison request={request} />

			<LinesCard request={request} />

			<div className="grid gap-6 lg:grid-cols-2">
				<ProgressCard request={request} />
				<MaterialsCard request={request} />
			</div>

			<EventsCard request={request} />

			<SnackLabelsDialog open={labelsOpen} onOpenChange={setLabelsOpen} requestIds={[request.id]} title={`Etiquetas — ${request.mission_description}`} />
		</div>
	)
}

function nextStepText(request: SnackRequestDetail): string {
	const pending = request.materials.some((m) => m.returned_quantity < m.quantity)
	switch (asStatus(request.status)) {
		case "submitted":
			return "Aguardando a decisão da SSU: aceitar informando o valor do lanche, ou recusar com o motivo."
		case "accepted":
			return "Aceito — os itens já estão no quadro de produção. Inicie a produção quando a cozinha começar o lote."
		case "in_production":
			return "Em produção. Para liberar a retirada, registre a coleta da amostra."
		case "ready":
			return "Pronto para retirada. Registre quem retirou e o material de apoio cautelado."
		case "delivered":
			return pending ? "Retirado. Há material cautelado a devolver antes do encerramento." : "Retirado, sem material pendente. Encerre o pedido."
		case "cancelled":
			return request.material_return_pending || pending ? "Cancelado com devolução de material pendente." : "Pedido cancelado."
		case "rejected":
			return "Pedido recusado pela SSU."
		case "closed":
			return "Pedido encerrado."
	}
}

// ── Blocos ─────────────────────────────────────────────────────────────────

/** [rótulo, valor, numérico?] — numérico sai em mono tabular. */
type DataRow = [string, ReactNode] | [string, ReactNode, boolean]

function DataList({ rows }: { rows: DataRow[] }) {
	return (
		<dl className="grid grid-cols-[minmax(0,11rem)_1fr] gap-x-4 gap-y-2">
			{rows.map(([label, value, mono]) => (
				<div key={label} className="contents">
					<dt className="text-caption text-muted-foreground">{label}</dt>
					<dd className={cn("text-body text-foreground", mono && "font-mono tabular-nums")}>{value ?? "—"}</dd>
				</div>
			))}
		</dl>
	)
}

const yesNo = (v: boolean) => (v ? "Sim" : "Não")

function Justifications({ request }: { request: SnackRequestDetail }) {
	const items: { title: string; text: string }[] = []
	if (request.is_late || request.late_reason)
		items.push({ title: `Pedido fora do prazo de ${MIN_LEAD_TIME_HOURS} h — justificativa`, text: request.late_reason || "Sem justificativa registrada." })
	if (request.calculator_snapshot?.divergences?.length || request.divergence_reason)
		items.push({ title: "Pedido diverge da sugestão da calculadora — justificativa", text: request.divergence_reason || "Sem justificativa registrada." })
	if (request.includes_non_military) items.push({ title: "Inclui não militares — motivo", text: request.non_military_reason || "Sem motivo registrado." })
	if (items.length === 0) return null
	return (
		<div className="grid gap-3">
			{items.map((item) => (
				<Alert key={item.title}>
					<AlertTriangle aria-hidden="true" />
					<AlertTitle>{item.title}</AlertTitle>
					<AlertDescription>{item.text}</AlertDescription>
				</Alert>
			))}
		</div>
	)
}

function MissionCard({ request }: { request: SnackRequestDetail }) {
	const isAir = request.mission_kind === "aerea"
	return (
		<Card>
			<CardHeader>
				<CardTitle>Missão</CardTitle>
				<CardDescription>{MISSION_KIND_LABELS[request.mission_kind] ?? request.mission_kind}</CardDescription>
			</CardHeader>
			<CardContent>
				<DataList
					rows={[
						["Descrição", request.mission_description],
						["Ordem de missão", request.mission_order_number],
						[isAir ? "Aeronave" : "Viatura", [request.vehicle_type, request.vehicle_registration].filter(Boolean).join(" · ") || null],
						["OM do meio", request.vehicle_om],
						[isAir ? "Decolagem" : "Partida", formatDateTime(request.departure_at), true],
						["Origem → destino", [request.origin, request.destination].some(Boolean) ? `${request.origin ?? "—"} → ${request.destination ?? "—"}` : null],
						["Escalas", request.stops],
						["Duração total", formatDuration(request.total_minutes)],
						["Maior perna", request.longest_leg_minutes != null ? formatDuration(request.longest_leg_minutes) : null],
						["Parada sem rancho", yesNo(request.stops_without_mess)],
						...(isAir
							? ([
									["Tempo em solo", formatDuration(request.ground_minutes)],
									["Missão operacional", yesNo(request.is_operational)],
									["Copa / minicozinha", yesNo(request.has_galley)],
									["Forno", yesNo(request.has_oven)],
								] as DataRow[])
							: []),
					]}
				/>
			</CardContent>
		</Card>
	)
}

function PeopleCard({ request }: { request: SnackRequestDetail }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Requisitante, pessoas e retirada</CardTitle>
			</CardHeader>
			<CardContent>
				<DataList
					rows={[
						["Requisitante", request.requester.label],
						["OM requisitante", request.requester_unit_label],
						["Tripulação", formatInt(request.crew_count), true],
						["Passageiros", formatInt(request.pax_count), true],
						["Inclui não militares", yesNo(request.includes_non_military)],
						["Preferência", VARIANT_LABELS[request.preference] ?? request.preference],
						["Retirada", formatDateTime(request.pickup_at), true],
						["Responsável pela retirada", request.pickup_responsible],
						["Recurso", FUNDING_LABELS[request.funding_source] ?? request.funding_source],
						["Valor do lanche", formatBrl(request.unit_value), true],
						["Água", formatInt(request.water_quantity), true],
						["Copos", formatInt(request.cup_quantity), true],
						["Gelo", formatInt(request.ice_quantity), true],
						["Café", formatInt(request.coffee_quantity), true],
						["Enviado em", formatDateTime(request.created_at), true],
					]}
				/>
			</CardContent>
		</Card>
	)
}

function CalculatorComparison({ request }: { request: SnackRequestDetail }) {
	const entitlement = request.calculator_snapshot?.entitlement
	const divergences = new Set(request.calculator_snapshot?.divergences ?? [])
	const suggested = entitlement ? summarizeEntitlement(entitlement) : new Map<string, { quantity: number; optional: boolean }>()

	const requested = new Map<string, { quantity: number; approved: number }>()
	for (const line of request.lines) {
		const key = entitlementKey(line.standard_snapshot.family, line.standard_snapshot.snackClass, line.audience as "crew" | "pax")
		const row = requested.get(key) ?? { quantity: 0, approved: 0 }
		row.quantity += line.quantity
		row.approved += lineKits(line)
		requested.set(key, row)
	}
	const keys = [...new Set([...suggested.keys(), ...requested.keys()])].sort()
	const decided = request.lines.some((l) => l.approved_quantity != null)

	return (
		<Card>
			<CardHeader>
				<CardTitle>Sugestão da calculadora × pedido</CardTitle>
				<CardDescription>
					Sugestão calculada no envio, pelas regras do Módulo 7.
					{entitlement && (
						<>
							{" "}
							Duração que decide a classe: {formatDuration(entitlement.effectiveMinutes)}
							{entitlement.involvementMinutes != null && ` · envolvimento da tripulação: ${formatDuration(entitlement.involvementMinutes)}`}.
						</>
					)}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Classe · público</TableHead>
								<TableHead className="text-right">Sugestão</TableHead>
								<TableHead className="text-right">Pedido</TableHead>
								{decided && <TableHead className="text-right">Aprovado</TableHead>}
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{keys.map((key) => {
								const s = suggested.get(key)
								const r = requested.get(key)
								const divergent = divergences.has(key)
								return (
									<TableRow key={key} className={cn(divergent && "bg-warning/5")}>
										<TableCell>{entitlementKeyLabel(key)}</TableCell>
										<TableCell className="text-right font-mono tabular-nums">{s ? formatInt(s.quantity) : "—"}</TableCell>
										<TableCell className="text-right font-mono tabular-nums">{r ? formatInt(r.quantity) : "—"}</TableCell>
										{decided && <TableCell className="text-right font-mono tabular-nums">{r ? formatInt(r.approved) : "—"}</TableCell>}
										<TableCell>
											<div className="flex flex-wrap justify-end gap-1.5">
												{s?.optional && <Badge variant="outline">Opcional</Badge>}
												{divergent && <Badge variant="warning">Diverge</Badge>}
											</div>
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
					</Table>
				</div>

				{entitlement && entitlement.lines.length > 0 && (
					<div className="space-y-2">
						<h3 className="text-label text-foreground">Por que a calculadora sugeriu</h3>
						<ul className="space-y-1.5">
							{entitlement.lines.map((line) => (
								<li key={`${line.ruleId}:${line.audience}:${line.snackClass}`} className="text-body text-foreground">
									<span className="text-subheading">
										{classLabel(line.family, line.snackClass)} · {AUDIENCE_LABELS[line.audience]}:
									</span>{" "}
									{line.reason} <span className="text-caption text-muted-foreground">({line.normRef})</span>
								</li>
							))}
						</ul>
					</div>
				)}
				{entitlement && entitlement.notes.length > 0 && (
					<div className="space-y-2">
						<h3 className="text-label text-foreground">Observações da norma</h3>
						<ul className="space-y-1.5">
							{entitlement.notes.map((note) => (
								<li key={note.ruleId} className="text-body text-foreground">
									{note.text} <span className="text-caption text-muted-foreground">({note.normRef})</span>
								</li>
							))}
						</ul>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

function LinesCard({ request }: { request: SnackRequestDetail }) {
	const effectiveMinutes = request.calculator_snapshot?.entitlement?.effectiveMinutes ?? request.total_minutes
	return (
		<Card>
			<CardHeader>
				<CardTitle>Kits pedidos</CardTitle>
				<CardDescription>Composição do padrão como estava no envio do pedido.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				{request.lines.map((line) => {
					const s = line.standard_snapshot
					const kits = lineKits(line)
					const range = kcalRangeFor(s.family, s.snackClass, effectiveMinutes)
					return (
						<section key={line.id} className="space-y-2" aria-label={s.name}>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="space-y-0.5">
									<h3 className="text-subheading text-foreground">{s.name}</h3>
									<p className="text-caption text-muted-foreground">
										{FAMILY_LABELS[s.family] ?? s.family} — Classe {s.snackClass} · {VARIANT_LABELS[s.variant] ?? s.variant} ·{" "}
										{AUDIENCE_LABELS[line.audience] ?? line.audience}
									</p>
								</div>
								<div className="flex flex-wrap items-center gap-1.5">
									{line.optional && <Badge variant="outline">Opcional</Badge>}
									<Badge variant="secondary" className="font-mono tabular-nums">
										{line.approved_quantity != null && line.approved_quantity !== line.quantity
											? `${formatInt(line.approved_quantity)} de ${formatInt(line.quantity)} kits`
											: `${formatInt(line.quantity)} kits`}
									</Badge>
								</div>
							</div>
							<p className="text-caption text-muted-foreground">
								Valor energético do kit:{" "}
								{s.kcalPerKit == null ? (
									"sem dado nutricional — conferir ficha"
								) : (
									<span className="font-mono tabular-nums text-foreground">
										{formatInt(Math.round(s.kcalPerKit))} kcal{!s.kcalComplete && " (parcial — há preparação sem composição)"}
									</span>
								)}{" "}
								· faixa da classe{" "}
								<span className="font-mono tabular-nums">
									{formatInt(range.min)}–{formatInt(range.max)} kcal
								</span>
								{s.shelfLifeHours != null && (
									<>
										{" "}
										· validade <span className="font-mono tabular-nums">{s.shelfLifeHours} h</span>
									</>
								)}
							</p>
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Preparação</TableHead>
											<TableHead>Grupo</TableHead>
											<TableHead className="text-right">Porções/kit</TableHead>
											<TableHead className="text-right">Total</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{s.items.map((item) => (
											<TableRow key={item.recipeId}>
												<TableCell>{item.recipeName}</TableCell>
												<TableCell className="text-muted-foreground">{item.itemGroup ?? "—"}</TableCell>
												<TableCell className="text-right font-mono tabular-nums">{formatInt(item.portions)}</TableCell>
												<TableCell className="text-right font-mono tabular-nums">{formatInt(item.portions * kits)}</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						</section>
					)
				})}
			</CardContent>
		</Card>
	)
}

function ProgressCard({ request }: { request: SnackRequestDetail }) {
	const { total, done, in_progress: inProgress } = request.production
	const percent = total > 0 ? Math.round((done / total) * 100) : 0
	const rows: DataRow[] = []
	if (request.decided_at) rows.push([asStatus(request.status) === "rejected" ? "Recusado em" : "Decidido em", formatDateTime(request.decided_at)])
	if (request.decision_reason) rows.push(["Nota da decisão", request.decision_reason])
	if (request.sample_collected_at) rows.push(["Amostra coletada", formatDateTime(request.sample_collected_at), true])
	if (request.sample_notes) rows.push(["Observação da amostra", request.sample_notes])
	if (request.picked_up_at) rows.push(["Retirado em", formatDateTime(request.picked_up_at), true])
	if (request.picked_up_by_name) rows.push(["Retirado por", request.picked_up_by_name])
	if (request.cancel_reason) rows.push(["Motivo do cancelamento", request.cancel_reason])

	return (
		<Card>
			<CardHeader>
				<CardTitle>Andamento</CardTitle>
				<CardDescription>Itens deste pedido no quadro da Produção Cozinha.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{total > 0 ? (
					<div className="space-y-1.5">
						<Progress value={percent} aria-label="Itens concluídos" />
						<p className="text-caption text-muted-foreground">
							<span className="font-mono tabular-nums text-foreground">
								{done}/{total}
							</span>{" "}
							itens concluídos
							{inProgress > 0 && (
								<>
									{" "}
									· <span className="font-mono tabular-nums">{inProgress}</span> em preparo
								</>
							)}
						</p>
					</div>
				) : (
					<p className="text-caption text-muted-foreground">Nenhum item no quadro de produção — ele entra quando o pedido é aceito.</p>
				)}
				{rows.length > 0 && <DataList rows={rows} />}
			</CardContent>
		</Card>
	)
}

function MaterialsCard({ request }: { request: SnackRequestDetail }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Material cautelado</CardTitle>
				<CardDescription>Material de apoio que saiu com o lanche e tem que voltar ao rancho.</CardDescription>
			</CardHeader>
			<CardContent>
				{request.materials.length === 0 ? (
					<p className="text-caption text-muted-foreground">
						{request.material_return_pending
							? "Devolução pendente sem cautela registrada: confira com o rancho o que saiu com o lanche."
							: "Nenhum material cautelado."}
					</p>
				) : (
					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Item</TableHead>
									<TableHead className="text-right">Cautelado</TableHead>
									<TableHead className="text-right">Devolvido</TableHead>
									<TableHead>Devolução</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{request.materials.map((m) => (
									<TableRow key={m.id}>
										<TableCell>
											{MATERIAL_ITEM_LABELS[m.item] ?? m.item}
											{m.description && <span className="text-muted-foreground"> — {m.description}</span>}
										</TableCell>
										<TableCell className="text-right font-mono tabular-nums">{m.quantity}</TableCell>
										<TableCell className="text-right font-mono tabular-nums">{m.returned_quantity}</TableCell>
										<TableCell>
											{m.returned_quantity >= m.quantity ? (
												<span className="font-mono tabular-nums">{formatDateTime(m.returned_at)}</span>
											) : (
												<Badge variant="destructive">Pendente</Badge>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

type AdjustmentDetail = { lineId: string; from: number; to: number }

function adjustmentsOf(details: unknown): AdjustmentDetail[] {
	if (!details || typeof details !== "object") return []
	const raw = (details as { adjustments?: unknown }).adjustments
	return Array.isArray(raw) ? (raw.filter((a) => a && typeof a === "object" && "lineId" in a) as AdjustmentDetail[]) : []
}

function EventsCard({ request }: { request: SnackRequestDetail }) {
	const lineNames = new Map(request.lines.map((l) => [l.id, `${l.standard_snapshot.name} (${AUDIENCE_LABELS[l.audience] ?? l.audience})`]))
	const events = [...request.events].sort((a, b) => a.created_at.localeCompare(b.created_at))
	const statusLabel = (s: string | null) => (s ? (SNACK_REQUEST_STATUS_LABELS[asStatus(s)] ?? s) : null)

	return (
		<Card>
			<CardHeader>
				<CardTitle>Histórico</CardTitle>
			</CardHeader>
			<CardContent>
				{events.length === 0 ? (
					<p className="text-caption text-muted-foreground">Sem eventos registrados.</p>
				) : (
					<ol className="space-y-3">
						{events.map((event, i) => {
							const from = statusLabel(event.from_status)
							const to = statusLabel(event.to_status)
							const adjustments = adjustmentsOf(event.details)
							return (
								<li key={`${event.created_at}:${i}`} className="grid gap-0.5">
									<div className="flex flex-wrap items-baseline gap-x-2">
										<span className="text-subheading text-foreground">{!from ? `Enviado (${to})` : from === to ? to : `${from} → ${to}`}</span>
										<span className="text-caption text-muted-foreground">
											{event.actor_label} · <span className="font-mono tabular-nums">{formatDateTime(event.created_at)}</span>
										</span>
									</div>
									{event.note && <p className="text-body text-foreground">{event.note}</p>}
									{adjustments.map((a) => (
										<p key={a.lineId} className="text-caption text-muted-foreground">
											{lineNames.get(a.lineId) ?? "Linha"}: <span className="font-mono tabular-nums">{a.from}</span> →{" "}
											<span className="font-mono tabular-nums">{a.to}</span> kits
										</p>
									))}
								</li>
							)
						})}
					</ol>
				)}
			</CardContent>
		</Card>
	)
}
