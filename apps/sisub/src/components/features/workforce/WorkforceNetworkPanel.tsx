import type { WorkforceNetworkWire } from "@iefa/sisub-domain"
import { formatRatio } from "@/components/features/workforce/labels"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/cn"

interface WorkforceNetworkPanelProps {
	network: WorkforceNetworkWire
}

/**
 * Visão de rede da SDAB: consolidado por ELO e a fila de ranchos sem cobertura técnica.
 *
 * A fila de lacunas é ordenada pelo efetivo servido, não alfabeticamente — é ela que
 * fundamenta pedido de vaga, e o rancho de 55 militares sem nutricionista pesa mais do
 * que o de 3.
 */
export function WorkforceNetworkPanel({ network }: WorkforceNetworkPanelProps) {
	return (
		<div className="grid gap-6 xl:grid-cols-2">
			<Card>
				<CardHeader>
					<CardTitle>Consolidado por ELO</CardTitle>
					<CardDescription>Efetivo declarado, disponibilidade e cobertura técnica de cada elo</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="rounded-md border overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>ELO</TableHead>
									<TableHead className="text-right">Ranchos</TableHead>
									<TableHead className="text-right">Efetivo</TableHead>
									<TableHead className="text-right">Disponível</TableHead>
									<TableHead className="text-right">Carreira</TableHead>
									<TableHead className="text-right">Sem técnico</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{network.by_elo.map((group) => (
									<TableRow key={group.key}>
										<TableCell className="text-subheading">{group.key}</TableCell>
										<TableCell className="text-right tabular-nums">
											<span className={cn(group.answeredRanchos < group.ranchos && "text-muted-foreground")}>
												{group.answeredRanchos}/{group.ranchos}
											</span>
										</TableCell>
										<TableCell className="text-right tabular-nums">{group.total}</TableCell>
										<TableCell className="text-right tabular-nums">{group.availableTotal}</TableCell>
										<TableCell className="text-right tabular-nums">{formatRatio(group.total > 0 ? group.careerStaff / group.total : null)}</TableCell>
										<TableCell className="text-right tabular-nums">
											{group.ranchosWithoutTechnicalStaff > 0 ? (
												<Badge variant="warning">{group.ranchosWithoutTechnicalStaff}</Badge>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Ranchos sem cobertura técnica</CardTitle>
					<CardDescription>Responderam a competência e não declararam nutricionista nem técnico em nutrição, do maior efetivo ao menor</CardDescription>
				</CardHeader>
				<CardContent>
					{network.coverage_gaps.length === 0 ? (
						<Empty>
							<EmptyHeader>
								<EmptyTitle>Nenhuma lacuna</EmptyTitle>
								<EmptyDescription>Todos os ranchos que responderam declararam ao menos um nutricionista ou técnico.</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<div className="rounded-md border overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Rancho</TableHead>
										<TableHead>ELO</TableHead>
										<TableHead className="text-right">Efetivo</TableHead>
										<TableHead className="text-right">Disponível</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{network.coverage_gaps.map((rancho) => (
										<TableRow key={rancho.ranchoId}>
											<TableCell className="text-subheading">{rancho.displayName}</TableCell>
											<TableCell className="text-muted-foreground">{rancho.eloCode}</TableCell>
											<TableCell className="text-right tabular-nums">{rancho.total}</TableCell>
											<TableCell className="text-right tabular-nums">{rancho.availableTotal}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
