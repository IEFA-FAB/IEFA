import type { SnackRequestDetail } from "@iefa/sisub-domain"
import type { SnackRequestStatus } from "@iefa/sisub-domain/utils"
import { requesterCanCancel } from "@iefa/sisub-domain/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
	audienceLabel,
	classLabel,
	divergenceLabel,
	FUNDING_SOURCE_LABELS,
	formatCurrency,
	formatDateTime,
	MATERIAL_ITEM_LABELS,
	MISSION_KIND_LABELS,
	PREFERENCE_LABELS,
	statusLabel,
} from "./snack-format"
import {
	buildComparison,
	type ComparisonRow,
	describeDuration,
	describeEquipment,
	describePeople,
	describeStops,
	describeVehicle,
} from "./snack-request-detail"

export function SnackRequestDetailView({ request }: { request: SnackRequestDetail }) {
	const status = request.status as SnackRequestStatus
	const divergences = request.calculator_snapshot?.divergences ?? []
	const comparison = buildComparison(request)
	const involvement = request.calculator_snapshot?.entitlement?.involvementMinutes ?? null

	return (
		<div className="space-y-6">
			<StatusAlerts request={request} status={status} />

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="space-y-6">
					<MissionCard request={request} involvement={involvement} />
					<KitsCard request={request} />
					<ComparisonCard request={request} comparison={comparison} divergences={divergences} />
				</div>

				<div className="space-y-6">
					<ProductionCard request={request} status={status} />
					<TimelineCard request={request} />
					{request.materials.length > 0 && <MaterialsCard request={request} />}
				</div>
			</div>
		</div>
	)
}

function StatusAlerts({ request, status }: { request: SnackRequestDetail; status: SnackRequestStatus }) {
	return (
		<>
			{status === "rejected" && (
				<Alert variant="destructive">
					<AlertTitle>Pedido recusado pela cozinha</AlertTitle>
					<AlertDescription>{request.decision_reason ?? "Sem motivo informado."}</AlertDescription>
				</Alert>
			)}
			{status === "cancelled" && (
				<Alert>
					<AlertTitle>Pedido cancelado</AlertTitle>
					<AlertDescription>{request.cancel_reason ?? "Sem motivo informado."}</AlertDescription>
				</Alert>
			)}
			{!requesterCanCancel(status) && (status === "in_production" || status === "ready") && (
				<Alert>
					<AlertTitle>A produção já começou</AlertTitle>
					<AlertDescription>Para cancelar ou alterar este pedido agora, fale direto com a cozinha apoiadora.</AlertDescription>
				</Alert>
			)}
			{request.material_return_pending && (
				<Alert>
					<AlertTitle>Material a devolver</AlertTitle>
					<AlertDescription>Há material da cozinha cautelado neste pedido que ainda não voltou a ela.</AlertDescription>
				</Alert>
			)}
		</>
	)
}

function MissionCard({ request, involvement }: { request: SnackRequestDetail; involvement: number | null }) {
	const kind = request.mission_kind
	const aerial = kind === "aerea"
	return (
		<Card>
			<CardHeader>
				<CardTitle>Missão</CardTitle>
				<CardDescription>
					{MISSION_KIND_LABELS[kind] ?? kind} · {request.kitchen_name ?? "Cozinha"} · pedido em {formatDateTime(request.created_at)}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<dl className="grid gap-4 sm:grid-cols-2">
					<Detail label="Setor requisitante" value={request.requester_unit_label} />
					<Detail label="Nº da ordem de missão" value={request.mission_order_number} />
					<Detail label={aerial ? "Aeronave" : "Viatura"} value={describeVehicle(request)} />
					<Detail label={aerial ? "Decolagem" : "Partida"} value={formatDateTime(request.departure_at)} />
					<Detail label="Procedência / destino" value={[request.origin, request.destination].filter(Boolean).join(" → ")} />
					<Detail label="Escalas" value={describeStops(request)} />
					<Detail label="Duração" value={describeDuration(request, aerial, involvement)} />
					<Detail label={aerial ? "Tripulação / passageiros" : "Efetivo / outros"} value={describePeople(request)} />
					{aerial && <Detail label="Equipamento" value={describeEquipment(request)} />}
					{request.includes_non_military && <Detail label="Civis ou servidores" value={request.non_military_reason} />}
					<Detail
						label="Material"
						value={`água ${request.water_quantity} · copos ${request.cup_quantity} · gelo ${request.ice_quantity} · café ${request.coffee_quantity}`}
					/>
					<Detail label="Preferência" value={PREFERENCE_LABELS[request.preference] ?? request.preference} />
					<Detail label="Retirada" value={`${formatDateTime(request.pickup_at)} · ${request.pickup_responsible}`} />
					<Detail label="Custeio" value={FUNDING_SOURCE_LABELS[request.funding_source] ?? request.funding_source} />
					<div className="sm:col-span-2">
						<Detail label="Descrição" value={request.mission_description} />
					</div>
				</dl>
			</CardContent>
		</Card>
	)
}

function KitsCard({ request }: { request: SnackRequestDetail }) {
	const kind = request.mission_kind
	return (
		<Card>
			<CardHeader>
				<CardTitle>Kits</CardTitle>
				<CardDescription>
					{request.unit_value != null
						? `Valor do lanche: ${formatCurrency(request.unit_value)} por kit.`
						: "O valor do lanche é informado pela cozinha no aceite."}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Padrão</TableHead>
								<TableHead>Público</TableHead>
								<TableHead className="text-right">Pedido</TableHead>
								<TableHead className="text-right">Aprovado</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{request.lines.map((line) => (
								<TableRow key={line.id}>
									<TableCell>
										<div>{line.standard_snapshot.name}</div>
										<div className="text-caption text-muted-foreground">
											{classLabel(line.standard_snapshot.family, line.standard_snapshot.snackClass)}
											{line.optional ? " · opcional" : ""}
										</div>
									</TableCell>
									<TableCell>{audienceLabel(line.audience, kind)}</TableCell>
									<TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
									<TableCell className="text-right tabular-nums">{line.approved_quantity ?? "—"}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	)
}

function ComparisonCard({ request, comparison, divergences }: { request: SnackRequestDetail; comparison: ComparisonRow[]; divergences: string[] }) {
	const kind = request.mission_kind
	return (
		<Card>
			<CardHeader>
				<CardTitle>Sugestão da calculadora × pedido</CardTitle>
				<CardDescription>A sugestão gravada no envio, calculada pelo servidor com os dados da missão.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{comparison.length === 0 ? (
					<p className="text-body text-muted-foreground">Sem sugestão registrada para este pedido.</p>
				) : (
					<ComparisonTable comparison={comparison} divergences={divergences} kind={kind} />
				)}
				{divergences.length > 0 && (
					<Alert>
						<AlertTitle>Justificativa da diferença</AlertTitle>
						<AlertDescription>
							{divergences.map((key) => divergenceLabel(key, kind)).join("; ")}. {request.divergence_reason ?? ""}
						</AlertDescription>
					</Alert>
				)}
				{request.late_reason && (
					<Alert>
						<AlertTitle>Pedido fora do prazo de 24 h</AlertTitle>
						<AlertDescription>{request.late_reason}</AlertDescription>
					</Alert>
				)}
			</CardContent>
		</Card>
	)
}

function ComparisonTable({ comparison, divergences, kind }: { comparison: ComparisonRow[]; divergences: string[]; kind: SnackRequestDetail["mission_kind"] }) {
	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Classe e público</TableHead>
						<TableHead className="text-right">Sugerido</TableHead>
						<TableHead className="text-right">Pedido</TableHead>
						<TableHead />
					</TableRow>
				</TableHeader>
				<TableBody>
					{comparison.map((row) => (
						<TableRow key={row.key}>
							<TableCell>
								{classLabel(row.family, row.snackClass)} — {audienceLabel(row.audience, kind)}
							</TableCell>
							<TableCell className="text-right tabular-nums">{row.suggested}</TableCell>
							<TableCell className="text-right tabular-nums">{row.requested}</TableCell>
							<TableCell className="text-right">
								{divergences.includes(row.key) ? <Badge variant="warning">Diverge</Badge> : row.optional ? <Badge variant="outline">Opcional</Badge> : null}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	)
}

function ProductionCard({ request, status }: { request: SnackRequestDetail; status: SnackRequestStatus }) {
	const productionPct = request.production.total > 0 ? Math.round((request.production.done / request.production.total) * 100) : 0
	return (
		<Card>
			<CardHeader>
				<CardTitle>Produção</CardTitle>
			</CardHeader>
			<CardContent>
				{request.production.total === 0 ? (
					<p className="text-body text-muted-foreground">{status === "submitted" ? "Aguardando o aceite da cozinha." : "Nenhum item no quadro de produção."}</p>
				) : (
					<Progress value={productionPct}>
						<ProgressLabel>
							{request.production.done} de {request.production.total} concluídos
							{request.production.in_progress > 0 ? ` · ${request.production.in_progress} em andamento` : ""}
						</ProgressLabel>
						<ProgressValue />
					</Progress>
				)}
			</CardContent>
		</Card>
	)
}

function TimelineCard({ request }: { request: SnackRequestDetail }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Linha do tempo</CardTitle>
			</CardHeader>
			<CardContent>
				{request.events.length === 0 ? (
					<p className="text-body text-muted-foreground">Sem eventos registrados.</p>
				) : (
					<ItemGroup className="gap-2">
						{request.events.map((event) => (
							<Item key={event.id} variant="muted" size="sm">
								<ItemContent>
									<ItemTitle>{statusLabel(event.to_status)}</ItemTitle>
									<ItemDescription className="text-xs">
										{formatDateTime(event.created_at)}
										{event.actor_label ? ` · ${event.actor_label}` : ""}
									</ItemDescription>
									{event.note && <ItemDescription className="text-xs">{event.note}</ItemDescription>}
								</ItemContent>
							</Item>
						))}
					</ItemGroup>
				)}
			</CardContent>
		</Card>
	)
}

function MaterialsCard({ request }: { request: SnackRequestDetail }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Material cautelado</CardTitle>
				<CardDescription>Material da cozinha entregue com os kits; devolva-o depois da missão.</CardDescription>
			</CardHeader>
			<CardContent>
				<ItemGroup className="gap-2">
					{request.materials.map((material) => (
						<Item key={material.id} variant="outline" size="sm">
							<ItemContent>
								<ItemTitle>
									{MATERIAL_ITEM_LABELS[material.item] ?? material.item}
									{material.description ? ` — ${material.description}` : ""}
								</ItemTitle>
								<ItemDescription className="text-xs">
									{material.returned_quantity} de {material.quantity} devolvido(s) · retirado em {formatDateTime(material.issued_at)}
									{material.returned_at ? ` · devolvido em ${formatDateTime(material.returned_at)}` : ""}
								</ItemDescription>
							</ItemContent>
							{material.returned_quantity >= material.quantity ? <Badge variant="success">Devolvido</Badge> : <Badge variant="warning">Pendente</Badge>}
						</Item>
					))}
				</ItemGroup>
			</CardContent>
		</Card>
	)
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
	return (
		<div>
			<dt className="text-label text-foreground">{label}</dt>
			<dd className="text-body">{value ? value : "—"}</dd>
		</div>
	)
}
