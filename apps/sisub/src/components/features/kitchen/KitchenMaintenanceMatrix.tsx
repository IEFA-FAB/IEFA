/**
 * Aba **Manutenção**: matriz unidade × rotina aplicável.
 *
 * Cada célula está em exatamente um de três estados, e o terceiro é o que faz a tela ser lida:
 *
 *   em dia · vencida há N dias · **sem registro**
 *
 * "Sem registro" não é vencido. Sem esse terceiro estado, 100% do parque nasceria vermelho no
 * dia em que a funcionalidade entra — e um relatório que aponta tudo não é lido por ninguém. A
 * distinção vem de `computeMaintenanceDue`, que só chama de vencida a rotina com âncora
 * conhecida (execução registrada, ou instalação/aquisição do equipamento).
 *
 * Registrar a execução sai da própria célula: obrigar o gestor a procurar a unidade noutra tela
 * é o que faz a matriz envelhecer.
 */

import type { MaintenanceDueState } from "@iefa/sisub-domain"
import { useState } from "react"
import { CONDITION_LABEL, DUE_LABEL, MAINTENANCE_KIND_LABEL } from "@/components/features/shared/equipment/equipment-labels"
import { LogMaintenanceDialog } from "@/components/features/shared/equipment/LogMaintenanceDialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { useKitchenMaintenanceMatrix } from "@/hooks/data/useEquipment"
import { cn } from "@/lib/cn"

const DUE_VARIANT: Record<MaintenanceDueState, "secondary" | "destructive" | "outline"> = {
	ok: "secondary",
	overdue: "destructive",
	unknown: "outline",
}

/** Tint, nunca faixa lateral: a distinção é badge + fundo, como manda o contrato de estilo. */
const DUE_TINT: Record<MaintenanceDueState, string> = {
	ok: "",
	overdue: "bg-destructive/5",
	unknown: "bg-muted/40",
}

export function KitchenMaintenanceMatrix({ kitchenId }: { kitchenId: number }) {
	const { data, isLoading } = useKitchenMaintenanceMatrix(kitchenId)
	const [target, setTarget] = useState<{ unitId: string; unitLabel: string; planId: string | null } | null>(null)

	if (isLoading) return <Skeleton className="h-64 w-full" />
	if (!data) return null

	const hasCells = data.rows.some((row) => row.cells.length > 0)

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap gap-3">
				{(["ok", "overdue", "unknown"] as const).map((state) => (
					<Badge key={state} variant={DUE_VARIANT[state]}>
						{DUE_LABEL[state]}: {data.totals[state]}
					</Badge>
				))}
			</div>

			{!hasCells ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyTitle>Nenhuma rotina aplicável</EmptyTitle>
						<EmptyDescription>
							As rotinas são cadastradas por função de equipamento no Catálogo Global, e valem automaticamente para todo equipamento que assume aquela função.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<div className="space-y-3">
					{data.rows.map((row) => (
						<Card key={row.unit_id}>
							<CardHeader className="pb-3">
								<CardTitle className="flex flex-wrap items-center gap-2">
									{row.unit_label}
									<Badge variant="outline">{CONDITION_LABEL[row.condition]}</Badge>
								</CardTitle>
								<CardDescription>{row.model ?? "Modelo desconhecido"}</CardDescription>
							</CardHeader>
							<CardContent>
								{row.cells.length === 0 ? (
									<p className="text-caption text-muted-foreground">Nenhuma rotina se aplica a este equipamento.</p>
								) : (
									<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
										{row.cells.map((cell) => (
											<button
												key={cell.plan.id}
												type="button"
												onClick={() => setTarget({ unitId: row.unit_id, unitLabel: row.unit_label, planId: cell.plan.id })}
												className={cn("rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50", DUE_TINT[cell.due.state])}
											>
												<span className="flex flex-wrap items-center gap-2">
													<Badge variant={DUE_VARIANT[cell.due.state]}>
														{cell.due.state === "overdue" && cell.due.daysPastDue != null ? `Vencida há ${cell.due.daysPastDue} d` : DUE_LABEL[cell.due.state]}
													</Badge>
													{cell.due.withinTolerance ? <span className="text-caption text-muted-foreground">na folga</span> : null}
												</span>
												<span className="mt-1 block font-medium">{cell.plan.title}</span>
												<span className="block text-caption text-muted-foreground">
													{MAINTENANCE_KIND_LABEL[cell.plan.kind] ?? cell.plan.kind} · a cada {cell.plan.interval_days} dias
												</span>
												<span className="block text-caption text-muted-foreground">
													{cell.last_performed_on
														? `Última: ${new Date(`${cell.last_performed_on}T00:00:00`).toLocaleDateString("pt-BR")}`
														: cell.due.anchor === "installation"
															? "Nunca registrada — contando desde a instalação"
															: "Sem data de instalação nem registro"}
												</span>
											</button>
										))}
									</div>
								)}
							</CardContent>
						</Card>
					))}
				</div>
			)}

			<LogMaintenanceDialog
				unitId={target?.unitId ?? null}
				unitLabel={target?.unitLabel ?? ""}
				defaultPlanId={target?.planId ?? null}
				open={target != null}
				onClose={() => setTarget(null)}
			/>
		</div>
	)
}
