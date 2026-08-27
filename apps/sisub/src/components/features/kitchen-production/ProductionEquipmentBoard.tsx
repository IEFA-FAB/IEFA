/**
 * Painel de equipamento do CHÃO DE FÁBRICA.
 *
 * A tela da gestão é tabela; esta é cartão, porque quem a usa está de pé, com o celular na mão,
 * no meio do serviço. A ação principal — relatar pane — é um botão por cartão, sem navegação.
 *
 * O que a praça vê e a gestão não precisa ver: a condição de cada unidade agora, e se alguma
 * rotina daquele equipamento venceu. O que a praça NÃO faz aqui: resolver ou descartar pane
 * (isso é decisão de gestão, `kitchen:2`) — relatar é o que ela sabe fazer melhor que ninguém.
 */

import { AlertTriangle, PlusCircle, Wrench } from "lucide-react"
import { useState } from "react"
import { CONDITION_LABEL, CONDITION_TINT, SEVERITY_BADGE } from "@/components/features/shared/equipment/equipment-labels"
import { LogMaintenanceDialog } from "@/components/features/shared/equipment/LogMaintenanceDialog"
import { ReportIssueDialog } from "@/components/features/shared/equipment/ReportIssueDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { useKitchenEquipmentCondition, useKitchenMaintenanceMatrix } from "@/hooks/data/useEquipment"
import { cn } from "@/lib/cn"

export function ProductionEquipmentBoard({ kitchenId }: { kitchenId: number }) {
	const { data: condition, isLoading } = useKitchenEquipmentCondition(kitchenId)
	const { data: matrix } = useKitchenMaintenanceMatrix(kitchenId)
	const [reportTarget, setReportTarget] = useState<{ id: string; label: string } | null>(null)
	const [logTarget, setLogTarget] = useState<{ id: string; label: string } | null>(null)

	if (isLoading) return <Skeleton className="h-64 w-full" />
	if (!condition) return null

	if (condition.total_units === 0) {
		return (
			<Empty className="border">
				<EmptyHeader>
					<EmptyTitle>Nenhum equipamento cadastrado</EmptyTitle>
					<EmptyDescription>A Gestão Cozinha cadastra o parque; aqui você relata pane e registra manutenção do que está cadastrado.</EmptyDescription>
				</EmptyHeader>
			</Empty>
		)
	}

	const overdueByUnit = new Map<string, number>()
	for (const row of matrix?.rows ?? []) {
		overdueByUnit.set(row.unit_id, row.cells.filter((cell) => cell.due.state === "overdue").length)
	}
	const openByUnit = new Map<string, { id: string; severity: string; description: string | null }[]>()
	for (const row of condition.open_issues) {
		const list = openByUnit.get(row.issue.unit_id) ?? []
		list.push({ id: row.issue.id, severity: row.issue.severity, description: row.issue.description })
		openByUnit.set(row.issue.unit_id, list)
	}

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{condition.units.map((unit) => {
					const open = openByUnit.get(unit.id) ?? []
					const overdue = overdueByUnit.get(unit.id) ?? 0
					return (
						<Card key={unit.id} className={cn(CONDITION_TINT[unit.condition])}>
							<CardHeader className="pb-2">
								<CardTitle className="flex flex-wrap items-center gap-2 text-body">
									{unit.label}
									<Badge variant={unit.condition === "down" ? "destructive" : unit.condition === "degraded" ? "outline" : "secondary"}>
										{CONDITION_LABEL[unit.condition]}
									</Badge>
								</CardTitle>
								<CardDescription>{unit.model ?? "Modelo desconhecido"}</CardDescription>
							</CardHeader>
							<CardContent className="space-y-2">
								{open.length > 0 ? (
									<ul className="space-y-1">
										{open.map((issue) => (
											<li key={issue.id} className="flex flex-wrap items-center gap-2 text-caption">
												<Badge variant={issue.severity === "inoperative" ? "destructive" : "outline"}>{SEVERITY_BADGE[issue.severity]}</Badge>
												<span className="text-muted-foreground">{issue.description}</span>
											</li>
										))}
									</ul>
								) : null}

								{overdue > 0 ? (
									<p className="text-caption">
										<Badge variant="outline">
											{overdue} rotina{overdue === 1 ? "" : "s"} vencida{overdue === 1 ? "" : "s"}
										</Badge>
									</p>
								) : null}

								{!unit.counts_for_production ? (
									<p className="text-caption text-muted-foreground">Fora do planejamento das preparações enquanto estiver assim.</p>
								) : null}

								<div className="flex flex-wrap gap-2 pt-1">
									<Button size="sm" variant="outline" onClick={() => setReportTarget({ id: unit.id, label: unit.label })}>
										<AlertTriangle className="size-4 mr-2" />
										Relatar pane
									</Button>
									<Button size="sm" variant="ghost" onClick={() => setLogTarget({ id: unit.id, label: unit.label })}>
										<Wrench className="size-4 mr-2" />
										Registrar manutenção
									</Button>
								</div>
							</CardContent>
						</Card>
					)
				})}
			</div>

			<p className="text-caption text-muted-foreground">
				<PlusCircle className="mr-1 inline size-3" />
				Equipamento novo é cadastrado por quem opera a linha, em Gestão Cozinha → Equipamentos.
			</p>

			<ReportIssueDialog
				unitId={reportTarget?.id ?? null}
				unitLabel={reportTarget?.label ?? ""}
				open={reportTarget != null}
				onClose={() => setReportTarget(null)}
			/>
			<LogMaintenanceDialog unitId={logTarget?.id ?? null} unitLabel={logTarget?.label ?? ""} open={logTarget != null} onClose={() => setLogTarget(null)} />
		</div>
	)
}
