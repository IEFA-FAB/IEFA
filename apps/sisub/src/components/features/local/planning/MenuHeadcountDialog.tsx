import { Users } from "lucide-react"
import { useEffect, useId, useState } from "react"
import type { MealTypeInfo } from "@/components/features/local/planning/MealTypeSection"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/cn"
import type { HeadcountPlan, HeadcountPlanByDays } from "@/lib/menu-fill"
import type { WeekdayGroup } from "@/lib/weekdays"

/** Mesmas cores da previsão de comensais (`DayCard`): seg–qui, sexta e fim de semana. */
const GROUP_TONE: Record<WeekdayGroup["key"], string> = {
	"mon-thu": "bg-primary/10 text-primary",
	fri: "bg-success/10 text-success",
	weekend: "bg-warning/10 text-warning",
}

/** Coluna única (evento, apoio, dia): a chave não chega a aparecer. */
const SINGLE_COLUMN = "all"

/**
 * Com `dayGroups` (cardápio semanal) o diálogo pede um número por faixa da semana e entrega o
 * plano por faixa; sem, um número por refeição, e o chamador decide os dias.
 */
type ApplyProps =
	| {
			dayGroups?: undefined
			countTargets: (plan: HeadcountPlan, overwrite: boolean) => number
			onApply: (plan: HeadcountPlan, overwrite: boolean) => void
	  }
	| {
			dayGroups: readonly WeekdayGroup[]
			countTargets: (plans: HeadcountPlanByDays, overwrite: boolean) => number
			onApply: (plans: HeadcountPlanByDays, overwrite: boolean) => void
	  }

/**
 * Auxiliador de quantitativos: um campo por refeição, aplicado de uma vez ao cardápio todo.
 *
 * O editor pede o efetivo no cabeçalho de cada refeição, dentro da aba de cada dia — informar
 * "almoço = 800" custava sete idas a abas diferentes. Aqui é um número por refeição.
 *
 * Onde o número cai é do chamador (`onApply`): no cardápio semanal ele vira efetivo BASE da
 * refeição, que é o que alcança todas as preparações; em evento e exceção, que não têm efetivo
 * base, vira o pax de cada preparação.
 *
 * No cardápio semanal o número é por faixa da semana (`dayGroups`): o efetivo de sexta e o do
 * fim de semana não são o de segunda a quinta, e um número só para os sete dias obrigava a
 * corrigir três dias à mão depois.
 */
export function MenuHeadcountDialog({
	open,
	onOpenChange,
	mealTypes,
	scope,
	...apply
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	mealTypes: MealTypeInfo[]
	/** Só muda o texto: o destino de verdade é decidido no `onApply`. */
	scope: "meal-base" | "event-meal-base" | "support-meal-kits" | "day-menu"
} & ApplyProps) {
	const overwriteId = useId()
	/** Chave `${coluna}|${refeição}`. */
	const [values, setValues] = useState<Record<string, string>>({})
	const [overwrite, setOverwrite] = useState(false)

	const planFor = (columnKey: string): HeadcountPlan =>
		new Map(
			mealTypes.map((mealType) => {
				const raw = values[`${columnKey}|${mealType.id}`]?.trim()
				if (!raw) return [mealType.id, null]
				const parsed = Number.parseInt(raw, 10)
				return [mealType.id, Number.isFinite(parsed) && parsed > 0 ? parsed : null]
			})
		)

	const plansByDays: HeadcountPlanByDays = apply.dayGroups ? apply.dayGroups.map((group) => ({ days: group.days, plan: planFor(group.key) })) : []

	const targets = apply.dayGroups ? apply.countTargets(plansByDays, overwrite) : apply.countTargets(planFor(SINGLE_COLUMN), overwrite)

	// O pai abre pelo próprio estado, então `onOpenChange(true)` nunca chega aqui: sem este
	// efeito o diálogo reabria com os números da aplicação anterior ainda nos campos.
	useEffect(() => {
		if (!open) return
		setValues({})
		setOverwrite(false)
	}, [open])

	const handleApply = () => {
		if (apply.dayGroups) apply.onApply(plansByDays, overwrite)
		else apply.onApply(planFor(SINGLE_COLUMN), overwrite)
		onOpenChange(false)
	}

	const setValue = (columnKey: string, mealTypeId: string, value: string) => setValues((prev) => ({ ...prev, [`${columnKey}|${mealTypeId}`]: value }))
	const placeholder = scope === "support-meal-kits" ? "kits" : "pessoas"

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className={apply.dayGroups ? "sm:max-w-lg" : "sm:max-w-md"}>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Users className="size-4" />
						Quantitativo por refeição
					</DialogTitle>
					<DialogDescription>
						{scope === "meal-base"
							? "Informe quantas pessoas comem em cada refeição, por faixa da semana. O número vira o efetivo da refeição nos dias da faixa e vale para todas as preparações dela. Faixa em branco não muda."
							: scope === "event-meal-base"
								? "Informe quantas pessoas comem em cada refeição do evento. O número vira o efetivo da refeição: a porcentagem de cada preparação incide sobre ele."
								: scope === "support-meal-kits"
									? "Informe quantos kits saem de cada refeição do apoio. As porções por kit de cada preparação incidem sobre esse número."
									: "Informe quantas pessoas comem em cada refeição deste dia. O número vira a previsão de comensais da refeição; refeições ainda não planejadas neste dia não recebem."}
					</DialogDescription>
				</DialogHeader>

				{mealTypes.length === 0 ? (
					<p className="text-caption text-muted-foreground">
						{scope === "event-meal-base"
							? 'Este evento ainda não tem refeições — crie uma em "Nova refeição".'
							: scope === "support-meal-kits"
								? 'Este apoio ainda não tem refeições — crie uma em "Nova refeição".'
								: "Nenhum tipo de refeição configurado."}
					</p>
				) : (
					<FieldGroup>
						{apply.dayGroups ? (
							<div className="flex flex-col gap-2">
								<div className="flex items-center gap-2" aria-hidden="true">
									<span className="flex-1" />
									{apply.dayGroups.map((group) => (
										<span key={group.key} className={cn("w-24 rounded-md px-1.5 py-0.5 text-center text-caption", GROUP_TONE[group.key])}>
											{group.label}
										</span>
									))}
								</div>
								{mealTypes.map((mealType) => (
									<div key={mealType.id} className="flex items-center gap-2">
										<span className="flex-1 truncate">{mealType.name}</span>
										{apply.dayGroups.map((group) => (
											<Input
												key={group.key}
												type="number"
												min="1"
												inputMode="numeric"
												className="w-24"
												aria-label={`${mealType.name} — ${group.label}`}
												placeholder={placeholder}
												value={values[`${group.key}|${mealType.id}`] ?? ""}
												onChange={(e) => setValue(group.key, mealType.id, e.target.value)}
											/>
										))}
									</div>
								))}
							</div>
						) : (
							mealTypes.map((mealType) => (
								<Field key={mealType.id} orientation="horizontal">
									<FieldLabel htmlFor={`headcount-${mealType.id}`}>{mealType.name}</FieldLabel>
									<Input
										id={`headcount-${mealType.id}`}
										type="number"
										min="1"
										inputMode="numeric"
										className="w-28"
										placeholder={placeholder}
										value={values[`${SINGLE_COLUMN}|${mealType.id}`] ?? ""}
										onChange={(e) => setValue(SINGLE_COLUMN, mealType.id, e.target.value)}
									/>
								</Field>
							))
						)}
						<Field orientation="horizontal">
							<FieldLabel htmlFor={overwriteId}>Substituir o que já está preenchido</FieldLabel>
							<Switch id={overwriteId} checked={overwrite} onCheckedChange={setOverwrite} />
						</Field>
						<FieldDescription>
							{overwrite ? "Os valores já informados serão trocados pelos daqui." : "Só o que está em branco é preenchido — nenhum ajuste seu é sobrescrito."}
						</FieldDescription>
					</FieldGroup>
				)}

				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
						Cancelar
					</Button>
					<Button type="button" disabled={targets === 0} onClick={handleApply}>
						{targets === 0 ? "Preencher" : `Preencher ${targets}`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
