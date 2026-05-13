// components/MealButton.tsx

import { Check, type LucideIcon, X } from "lucide-react"
import { memo } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { DishDetails } from "@/hooks/data/useDailyMenuContent"
import { cn } from "@/lib/cn"

interface Meal {
	icon: LucideIcon
	label: string
	value: string
}

interface MealButtonProps {
	meal: Meal
	isSelected: boolean
	onToggle: () => void
	disabled: boolean
	compact?: boolean
	dishes?: DishDetails[]
}

export const MealButton = memo<MealButtonProps>(({ meal, isSelected, onToggle, disabled, compact = false, dishes }) => {
	const Icon = meal.icon
	const mainDish = dishes?.[0] // Show first dish for now

	const buttonClasses = cn(
		"w-full rounded-md border-2 transition-colors duration-200 group relative z-10",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
		{
			// Estados selecionado/não selecionado — via tokens semânticos
			"border-success bg-success/10 text-success": isSelected,
			"border-border bg-card text-foreground hover:border-muted-foreground/40 hover:bg-muted/50": !isSelected,

			// Estados de interação
			"cursor-pointer active:scale-95": !disabled,
			"opacity-50 cursor-not-allowed": disabled,

			// Tamanhos
			"p-2 h-auto min-h-[64px]": compact,
			"p-3": !compact,
		}
	)

	const iconClasses = cn("transition-colors duration-200", {
		"h-4 w-4": compact,
		"h-5 w-5": !compact,
		"text-success": isSelected,
		"text-muted-foreground group-hover:text-foreground": !isSelected && !disabled,
	})

	// Compact mode structure (Forecast)
	if (compact) {
		return (
			<div className="flex flex-col gap-1 w-full">
				<Tooltip>
					<TooltipTrigger
						render={
							<Button type="button" onClick={onToggle} disabled={disabled} className={buttonClasses}>
								<div className="flex flex-col items-center space-y-1 w-full">
									<Icon className={iconClasses} />
									<span className="text-xs font-medium truncate w-full text-center">{meal.label}</span>

									{/* Indicador visual via token */}
									<div className={cn("w-2 h-2 rounded-sm transition-colors duration-200", isSelected ? "bg-success" : "bg-muted-foreground/30")} />
								</div>
							</Button>
						}
					></TooltipTrigger>
					<TooltipContent>
						{meal.label} — {isSelected ? "Confirmado" : "Não vai"}
					</TooltipContent>
				</Tooltip>

				{mainDish && (
					<Accordion className="w-full bg-muted/20 rounded-md border border-border/50">
						<AccordionItem value="details" className="border-0">
							<AccordionTrigger className="px-2 py-1.5 text-xs hover:no-underline hover:bg-muted/50 rounded-t-md data-[state=open]:rounded-b-none [&>svg]:w-3 [&>svg]:h-3">
								<span className="truncate text-left font-medium max-w-25 leading-tight text-foreground/80">{mainDish.name}</span>
							</AccordionTrigger>
							<AccordionContent className="px-2 pb-2 text-[10px] text-muted-foreground bg-background/50 rounded-b-md">
								{mainDish.ingredients.length > 0 ? (
									<ul className="list-disc pl-3 space-y-0.5 mt-1">
										{mainDish.ingredients.map((ing, i) => (
											<li key={`${ing.ingredient_name}-${i}`}>
												{ing.ingredient_name}
												<span className="opacity-70 ml-1">
													({ing.quantity} {ing.measure_unit})
												</span>
											</li>
										))}
									</ul>
								) : (
									<span className="italic">Sem composição</span>
								)}
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				)}
			</div>
		)
	}

	// Full mode (reserved for future/other views)
	return (
		<button type="button" onClick={onToggle} disabled={disabled} className={buttonClasses}>
			<div className="flex items-center justify-between w-full">
				<div className="flex items-center space-x-3">
					<Icon className={iconClasses} />
					<span className="font-medium">{meal.label}</span>
				</div>

				{/* Status icon via tokens */}
				<div
					className={cn("flex items-center justify-center w-6 h-6 rounded-sm transition-colors duration-200", {
						"bg-success text-success-foreground": isSelected,
						"bg-muted text-muted-foreground": !isSelected,
					})}
				>
					{isSelected ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
				</div>
			</div>
		</button>
	)
})

MealButton.displayName = "MealButton"
