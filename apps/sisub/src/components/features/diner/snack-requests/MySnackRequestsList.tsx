import type { SnackRequestSummary } from "@iefa/sisub-domain"
import type { SnackRequestStatus } from "@iefa/sisub-domain/utils"
import { MIN_LEAD_TIME_HOURS, requesterCanCancel } from "@iefa/sisub-domain/utils"
import { Link } from "@tanstack/react-router"
import { Bus, ChevronRight, Plane, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { CancelSnackRequestDialog } from "./CancelSnackRequestDialog"
import { SnackStatusBadge } from "./SnackStatusBadge"
import { formatDateTime } from "./snack-format"

function totalKits(request: SnackRequestSummary): number {
	return request.lines.reduce((sum, line) => sum + (line.approved_quantity ?? line.quantity), 0)
}

export function MySnackRequestsEmpty() {
	return (
		<Card>
			<CardContent>
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Plane aria-hidden />
						</EmptyMedia>
						<EmptyTitle>Nenhum pedido de lanche ainda</EmptyTitle>
						<EmptyDescription>
							O <strong>Lanche de Bordo</strong> acompanha missões aéreas; o <strong>Lanche de Apoio</strong>, deslocamentos terrestres em que a tropa não
							consegue fazer a refeição no rancho. Você descreve a missão, o sistema calcula a classe devida pela norma e a cozinha apoiadora prepara os kits
							para retirada.
						</EmptyDescription>
						<EmptyDescription>
							Peça com pelo menos {MIN_LEAD_TIME_HOURS} h de antecedência da retirada — pedido em cima da hora exige justificativa.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button
							size="sm"
							nativeButton={false}
							render={
								<Link to="/diner/snack-requests/new">
									<Plus className="size-4" aria-hidden />
									Fazer o primeiro pedido
								</Link>
							}
						/>
					</EmptyContent>
				</Empty>
			</CardContent>
		</Card>
	)
}

export function MySnackRequestsList({ requests }: { requests: SnackRequestSummary[] }) {
	return (
		<ItemGroup>
			{requests.map((request) => {
				const kits = totalKits(request)
				const Icon = request.mission_kind === "aerea" ? Plane : Bus
				return (
					<Item key={request.id} variant="outline">
						<ItemMedia variant="icon">
							<Icon aria-hidden />
						</ItemMedia>
						<ItemContent>
							<ItemTitle>
								<Link to="/diner/snack-requests/$requestId" params={{ requestId: request.id }} className="hover:underline underline-offset-4">
									{request.mission_description}
								</Link>
								<SnackStatusBadge status={request.status} />
								{request.is_late && <Badge variant="warning">Fora do prazo</Badge>}
							</ItemTitle>
							<ItemDescription>
								{request.kitchen_name ?? "Cozinha"} · retirada {formatDateTime(request.pickup_at)} · partida {formatDateTime(request.departure_at)} · {kits}{" "}
								{kits === 1 ? "kit" : "kits"}
							</ItemDescription>
						</ItemContent>
						<ItemActions>
							{requesterCanCancel(request.status as SnackRequestStatus) && (
								<CancelSnackRequestDialog requestId={request.id} missionDescription={request.mission_description} />
							)}
							<Button
								variant="ghost"
								size="sm"
								nativeButton={false}
								render={
									<Link to="/diner/snack-requests/$requestId" params={{ requestId: request.id }}>
										Detalhe
										<ChevronRight className="size-4" aria-hidden />
									</Link>
								}
							/>
						</ItemActions>
					</Item>
				)
			})}
		</ItemGroup>
	)
}
