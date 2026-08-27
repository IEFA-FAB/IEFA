/**
 * Aba **Condição**: como o parque está, e o que fazer com as panes abertas.
 *
 * A condição não é uma coluna — vem de `deriveEquipmentCondition` no domínio, a mesma função
 * que decide se a unidade conta no planejamento. É por isso que a tela pode prometer que o que
 * ela pinta como "parado" é exatamente o que o cardápio deixou de contar.
 *
 * A fila de panes é ordenada por severidade e depois por tempo em aberto: uma pane inoperante
 * de ontem importa mais que uma degradada de duas semanas, e entre iguais quem está parado há
 * mais tempo vem primeiro. Sem o tempo explícito, "aberta" vira uma lista que ninguém prioriza.
 */

import type { EquipmentCondition } from "@iefa/sisub-domain"
import { CheckCircle2, Wrench, X } from "lucide-react"
import { useState } from "react"
import { usePBAC } from "@/auth/pbac"
import {
	CONDITION_LABEL,
	CONDITION_TINT,
	ISSUE_CATEGORY_LABEL,
	ISSUE_STATUS_LABEL,
	SEVERITY_BADGE,
} from "@/components/features/shared/equipment/equipment-labels"
import { LogMaintenanceDialog } from "@/components/features/shared/equipment/LogMaintenanceDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useKitchenEquipmentCondition, useUpdateEquipmentIssue } from "@/hooks/data/useEquipment"
import { cn } from "@/lib/cn"

const CONDITION_ORDER: EquipmentCondition[] = ["down", "degraded", "operational", "retired"]

function daysLabel(days: number): string {
	if (days === 0) return "hoje"
	return days === 1 ? "há 1 dia" : `há ${days} dias`
}

export function KitchenEquipmentCondition({ kitchenId }: { kitchenId: number }) {
	const { can } = usePBAC()
	const canManage = can("kitchen", 2, { type: "kitchen", id: kitchenId })
	const { data, isLoading } = useKitchenEquipmentCondition(kitchenId)
	const updateIssue = useUpdateEquipmentIssue()
	const [repairTarget, setRepairTarget] = useState<{ unitId: string; unitLabel: string; issueId: string } | null>(null)

	if (isLoading) return <Skeleton className="h-64 w-full" />
	if (!data) return null

	if (data.total_units === 0) {
		return (
			<Empty className="border">
				<EmptyHeader>
					<EmptyTitle>Nenhum equipamento cadastrado</EmptyTitle>
					<EmptyDescription>Cadastre o parque na aba Parque para acompanhar condição, panes e manutenção.</EmptyDescription>
				</EmptyHeader>
			</Empty>
		)
	}

	return (
		<div className="space-y-6">
			{/* Resumo: quatro números, na ordem em que doem. */}
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				{CONDITION_ORDER.map((condition) => (
					<Card key={condition} className={cn(CONDITION_TINT[condition])}>
						<CardHeader className="pb-2">
							<CardDescription>{CONDITION_LABEL[condition]}</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-heading">{data.counts[condition]}</p>
						</CardContent>
					</Card>
				))}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Panes abertas</CardTitle>
					<CardDescription>Equipamento com pane inoperante sai do cálculo de atendimento das preparações até ser resolvido ou descartado.</CardDescription>
				</CardHeader>
				<CardContent>
					{data.open_issues.length === 0 ? (
						<Empty className="border">
							<EmptyHeader>
								<EmptyTitle>Nenhuma pane aberta</EmptyTitle>
								<EmptyDescription>O parque está inteiro segundo o que foi relatado.</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Equipamento</TableHead>
									<TableHead className="w-28">Severidade</TableHead>
									<TableHead className="w-32">Tipo</TableHead>
									<TableHead>Descrição</TableHead>
									<TableHead className="w-28">Aberta</TableHead>
									<TableHead className="w-40 text-right">Ações</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.open_issues.map((row) => (
									<TableRow key={row.issue.id} className={cn(row.issue.severity === "inoperative" && "bg-destructive/5")}>
										<TableCell className="font-medium">{row.unit_label}</TableCell>
										<TableCell>
											<Badge variant={row.issue.severity === "inoperative" ? "destructive" : "outline"}>{SEVERITY_BADGE[row.issue.severity]}</Badge>
										</TableCell>
										<TableCell>{ISSUE_CATEGORY_LABEL[row.issue.category] ?? row.issue.category}</TableCell>
										<TableCell className="text-caption">{row.issue.description}</TableCell>
										<TableCell>
											{daysLabel(row.days_open)}
											{row.issue.status === "in_repair" ? <span className="block text-caption text-muted-foreground">em conserto</span> : null}
										</TableCell>
										<TableCell className="text-right">
											{canManage ? (
												<div className="flex justify-end gap-1">
													{row.issue.status === "open" ? (
														<Button
															variant="ghost"
															size="sm"
															onClick={() => updateIssue.mutate({ issueId: row.issue.id, status: "in_repair", severity: null, resolutionNote: null })}
														>
															Em conserto
														</Button>
													) : null}
													<Button
														variant="ghost"
														size="icon"
														aria-label="Registrar conserto e resolver"
														onClick={() => setRepairTarget({ unitId: row.issue.unit_id, unitLabel: row.unit_label, issueId: row.issue.id })}
													>
														<Wrench className="size-4" />
													</Button>
													<Button
														variant="ghost"
														size="icon"
														aria-label="Descartar pane"
														onClick={() =>
															updateIssue.mutate({
																issueId: row.issue.id,
																status: "dismissed",
																severity: null,
																resolutionNote: "Descartada na revisão da gestão",
															})
														}
													>
														<X className="size-4" />
													</Button>
												</div>
											) : null}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Histórico</CardTitle>
					<CardDescription>Panes já encerradas, da mais recente para a mais antiga.</CardDescription>
				</CardHeader>
				<CardContent>
					{data.history.length === 0 ? (
						<p className="text-caption text-muted-foreground">Nenhuma pane encerrada até agora.</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Equipamento</TableHead>
									<TableHead className="w-28">Desfecho</TableHead>
									<TableHead>Descrição</TableHead>
									<TableHead className="w-40">Encerrada em</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.history.map((issue) => (
									<TableRow key={issue.id}>
										<TableCell>{issue.unit_label}</TableCell>
										<TableCell>
											<Badge variant="secondary">
												{issue.status === "resolved" ? <CheckCircle2 className="size-3 mr-1" /> : null}
												{ISSUE_STATUS_LABEL[issue.status]}
											</Badge>
										</TableCell>
										<TableCell className="text-caption">{issue.description}</TableCell>
										<TableCell className="text-caption">{issue.resolved_at ? new Date(issue.resolved_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			<LogMaintenanceDialog
				unitId={repairTarget?.unitId ?? null}
				unitLabel={repairTarget?.unitLabel ?? ""}
				issueId={repairTarget?.issueId ?? null}
				canResolveIssue={canManage}
				open={repairTarget != null}
				onClose={() => setRepairTarget(null)}
			/>
		</div>
	)
}
