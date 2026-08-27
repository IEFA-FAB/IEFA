import type { WorkforceGroupSummary } from "@iefa/sisub-domain/utils"
import { AlertTriangle, HandHelping, Users, UserX } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface WorkforceSummaryProps {
	summary: WorkforceGroupSummary
	/** Rótulo do escopo agregado ("neste ELO", "na rede"). */
	scopeLabel: string
}

/**
 * Cabeçalho de números da matriz.
 *
 * A taxa de resposta vem junto do efetivo de propósito: "998 militares" sem "27 de 65 ranchos
 * responderam" é um número que convida à leitura errada, e foi assim que a planilha circulou.
 */
export function WorkforceSummary({ summary, scopeLabel }: WorkforceSummaryProps) {
	const pending = summary.ranchos - summary.answeredRanchos
	const responseRate = Math.round(summary.responseRate * 100)

	const tiles = [
		{
			icon: Users,
			label: "Efetivo declarado",
			value: summary.total.toLocaleString("pt-BR"),
			hint: `${summary.availableTotal.toLocaleString("pt-BR")} disponíveis, descontados afastamentos e desvios`,
		},
		{
			icon: AlertTriangle,
			label: "Ranchos sem resposta",
			value: String(pending),
			hint: pending === 0 ? `Todos os ${summary.ranchos} ranchos responderam` : `${responseRate}% dos ${summary.ranchos} ranchos ${scopeLabel} responderam`,
		},
		{
			icon: UserX,
			label: "Sem cobertura técnica",
			value: String(summary.ranchosWithoutTechnicalStaff),
			hint: `${summary.ranchosWithoutNutritionist} sem nutricionista; ${summary.technicalStaff} técnicos no total`,
		},
		{
			icon: HandHelping,
			label: "Civis terceirizados",
			value: String(summary.outsourced),
			hint: "Declarados pelos gestores; não entram no efetivo militar",
		},
	]

	return (
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			{tiles.map((tile) => (
				<Card key={tile.label}>
					<CardHeader className="pb-2">
						<CardTitle className="flex items-center gap-2 text-subheading">
							<tile.icon className="size-4 text-muted-foreground" aria-hidden="true" />
							{tile.label}
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-1">
						<p className="text-display">{tile.value}</p>
						<CardDescription>{tile.hint}</CardDescription>
					</CardContent>
				</Card>
			))}
		</div>
	)
}
