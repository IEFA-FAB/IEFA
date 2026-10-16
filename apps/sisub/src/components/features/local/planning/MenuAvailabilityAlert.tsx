/**
 * Insumo agendado que pode não chegar, numa refeição do dia.
 *
 * O cardápio que foi base da contratação nem sempre é o que se produz: depois da homologação a
 * nutricionista troca preparações, e uma troca pode cair em insumo sem ata, sem empenho ou sem
 * estoque. O aviso mora aqui, onde ainda dá para trocar, e não chega como falta no dia do turno.
 *
 * Amarelo e calado quando atende: não impede agendar (a execução não trava). A regra por
 * horizonte (semana, mês, depois) está em `lib/planning-availability.ts`.
 */

import { AlertTriangle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { usePlanningAvailability } from "@/hooks/data/usePlanningAvailability"
import type { AvailabilityWarning } from "@/lib/planning-availability"

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 })

export function describeAvailabilityGap(warning: AvailabilityWarning): string {
	switch (warning.gap) {
		case "short_stock": {
			const unit = warning.measureUnit ? ` ${warning.measureUnit}` : ""
			const amounts = warning.weekNeed ? `: a semana agendada usa ${NUM.format(warning.weekNeed)}${unit} e há ${NUM.format(warning.stock ?? 0)}${unit}` : ""
			return `estoque não cobre esta semana${amounts}.${warning.inTransit ? " Há OF a caminho, confira a entrega." : ""}`
		}
		case "no_empenho_or_stock":
			return "sem estoque, sem OF a caminho e sem empenho com saldo. A unidade precisa empenhar a tempo."
		case "no_contract":
			return "sem ata ou contratação vigente nesta data."
		case "no_purchase_item":
			return "sem item de compra: não há como comprar. Quem vincula é o catálogo global."
	}
}

export function MenuAvailabilityAlert({ kitchenId, date, dailyMenuId }: { kitchenId: number; date: string | null; dailyMenuId: string }) {
	const { data } = usePlanningAvailability(kitchenId, date, date)
	const warnings = (data?.warnings ?? []).filter((w) => w.dailyMenuId === dailyMenuId)
	if (warnings.length === 0) return null

	const byRecipe = new Map<string, { recipeName: string; items: AvailabilityWarning[] }>()
	for (const warning of warnings) {
		const entry = byRecipe.get(warning.menuItemId) ?? { recipeName: warning.recipeName, items: [] }
		entry.items.push(warning)
		byRecipe.set(warning.menuItemId, entry)
	}

	return (
		<Alert variant="warning">
			<AlertTriangle />
			<AlertTitle>Insumo que pode faltar</AlertTitle>
			<AlertDescription>
				<div className="space-y-2">
					<ul className="space-y-1.5">
						{[...byRecipe.entries()].map(([menuItemId, entry]) => (
							<li key={menuItemId}>
								<span className="text-subheading">{entry.recipeName}</span>
								<ul className="mt-0.5 space-y-0.5">
									{entry.items.map((w) => (
										<li key={w.ingredientId}>
											<strong>{w.description}</strong>: {describeAvailabilityGap(w)}
										</li>
									))}
								</ul>
							</li>
						))}
					</ul>
					<p className="text-caption text-muted-foreground">Troque a preparação ou o insumo, ou acione a unidade. O aviso não impede o agendamento.</p>
				</div>
			</AlertDescription>
		</Alert>
	)
}
