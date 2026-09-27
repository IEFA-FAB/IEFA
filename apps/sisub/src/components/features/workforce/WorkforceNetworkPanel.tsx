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
 * Visão de rede da SDAB: consolidado por ELO e a fila de refeitórios sem cobertura técnica.
 *
 * A fila de lacunas é ordenada pelo efetivo servido, não alfabeticamente — é ela que
 * fundamenta pedido de vaga, e o refeitório de 55 militares sem nutricionista pesa mais do
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
									<TableHead className="text-right">Refeitórios</TableHead>
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
											<span className={cn(group.answeredMessHalls < group.messHalls && "text-muted-foreground")}>
												{group.answeredMessHalls}/{group.messHalls}
											</span>
										</TableCell>
										<TableCell className="text-right tabular-nums">{group.total}</TableCell>
										<TableCell className="text-right tabular-nums">{group.availableTotal}</TableCell>
										<TableCell className="text-right tabular-nums">{formatRatio(group.total > 0 ? group.careerStaff / group.total : null)}</TableCell>
										<TableCell className="text-right tabular-nums">
											{group.messHallsWithoutTechnicalStaff > 0 ? (
												<Badge variant="warning">{group.messHallsWithoutTechnicalStaff}</Badge>
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
					<CardTitle>Refeitórios sem cobertura técnica</CardTitle>
					<CardDescription>Responderam a competência e não declararam nutricionista nem técnico em nutrição, do maior efetivo ao menor</CardDescription>
				</CardHeader>
				<CardContent>
					{network.coverage_gaps.length === 0 ? (
						<Empty>
							<EmptyHeader>
								<EmptyTitle>Nenhuma lacuna</EmptyTitle>
								<EmptyDescription>Todos os refeitórios que responderam declararam ao menos um nutricionista ou técnico.</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<div className="rounded-md border overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Refeitório</TableHead>
										<TableHead>ELO</TableHead>
										<TableHead className="text-right">Efetivo</TableHead>
										<TableHead className="text-right">Disponível</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{network.coverage_gaps.map((row) => (
										<TableRow key={row.messHallWorkforceId}>
											<TableCell className="text-subheading">{row.displayName}</TableCell>
											<TableCell className="text-muted-foreground">{row.eloCode}</TableCell>
											<TableCell className="text-right tabular-nums">{row.total}</TableCell>
											<TableCell className="text-right tabular-nums">{row.availableTotal}</TableCell>
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
