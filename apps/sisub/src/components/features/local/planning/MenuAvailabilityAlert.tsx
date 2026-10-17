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
import type { AvailabilityChecks, AvailabilityWarning } from "@/lib/planning-availability"

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 })

export function describeAvailabilityGap(warning: AvailabilityWarning): string {
	switch (warning.gap) {
		case "short_stock": {
			const unit = warning.measureUnit ? ` ${warning.measureUnit}` : ""
			// Sem permissão de Estoque os números não vêm: o aviso diz que falta, não quanto há.
			const amounts =
				warning.weekNeed && warning.stock != null
					? `: a semana agendada usa ${NUM.format(warning.weekNeed)}${unit} e há ${NUM.format(warning.stock ?? 0)}${unit}`
					: ""
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

/** Recebe os avisos já lidos pelo calendário: o painel do dia não refaz a conta. */
export function MenuAvailabilityAlert({ warnings: all, dailyMenuId }: { warnings: readonly AvailabilityWarning[] | null; dailyMenuId: string }) {
	// Falha não é "atende": calar aqui deixaria agendar achando que tudo foi conferido.
	if (all == null) return <p className="text-caption text-muted-foreground">Não foi possível conferir se os insumos desta refeição podem faltar.</p>
	const warnings = all.filter((w) => w.dailyMenuId === dailyMenuId)
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

/** Resumo do dia para o hover do calendário: refeição → preparação → insumo, com o motivo. */
export function DayAvailabilityList({ warnings }: { warnings: readonly AvailabilityWarning[] }) {
	const byMeal = new Map<string, AvailabilityWarning[]>()
	for (const warning of warnings) byMeal.set(warning.mealName, [...(byMeal.get(warning.mealName) ?? []), warning])
	return (
		<div className="space-y-2">
			<p className="text-subheading flex items-center gap-1.5">
				<AlertTriangle className="size-3.5 text-warning" aria-hidden="true" />
				Insumo que pode faltar
			</p>
			{[...byMeal.entries()].map(([meal, items]) => (
				<div key={meal} className="space-y-0.5">
					<p className="text-label text-muted-foreground">{meal}</p>
					<ul className="space-y-0.5 text-xs">
						{items.map((w) => (
							<li key={`${w.menuItemId}:${w.ingredientId}`}>
								<strong>{w.description}</strong> ({w.recipeName}): {describeAvailabilityGap(w)}
							</li>
						))}
					</ul>
				</div>
			))}
			<p className="text-caption text-muted-foreground">Clique no dia para trocar a preparação.</p>
		</div>
	)
}

/** O que o aviso deixou de conferir (fonte não usada no sisub) ou não conseguiu ler. */
export function AvailabilityStatusNote({ checks, error }: { checks: AvailabilityChecks | null; error: Error | null }) {
	// Falha não é "atende": sem esta linha o calendário limpo pareceria tudo conferido.
	if (error) return <p className="text-caption text-muted-foreground">Não foi possível conferir os insumos que podem faltar: {error.message}</p>
	// Fonte que a OM não usa no sisub fica fora do aviso: dizer isso evita ler silêncio como "atende".
	if (!checks || (checks.stock && checks.contracts)) return null
	const reasons = [
		!checks.stock && "a cozinha não controla estoque no sisub",
		!checks.contracts && "a unidade não tem ata nem empenho registrado no sisub",
	].filter(Boolean)
	const skipped = [!checks.stock && "o estoque", !checks.contracts && "ata e empenho"].filter(Boolean)
	// Item de compra se confere sempre: não depende de fonte nenhuma da OM.
	return (
		<p className="text-caption text-muted-foreground">
			Aviso de insumo que pode faltar: {reasons.join(" e ")}, então {skipped.join(" e ")} não {skipped.length > 1 ? "são conferidos" : "é conferido"}
			{checks.stock || checks.contracts ? "." : "; só se confere se o insumo tem item de compra."}
		</p>
	)
}
