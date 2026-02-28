// components/MealButton.tsx

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Button } from "@iefa/ui"
import { Check, type LucideIcon, X } from "lucide-react"
import { memo } from "react"
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

export const MealButton = memo<MealButtonProps>(
	({ meal, isSelected, onToggle, disabled, compact = false, dishes }) => {
		const Icon = meal.icon
		const mainDish = dishes?.[0] // Show first dish for now

		const buttonClasses = cn(
			"w-full rounded-lg border-2 transition-all duration-200 group relative z-10",
			"focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
			{
				// Estados selecionado/não selecionado
				"border-green-500 bg-green-50 text-green-900": isSelected,
				"border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50":
					!isSelected,

				// Estados de interação
				"cursor-pointer active:scale-95 hover:shadow-sm": !disabled,
				"opacity-50 cursor-not-allowed": disabled,

				// Tamanhos
				"p-2 h-auto min-h-[64px]": compact,
				"p-3": !compact,
			}
		)

		const iconClasses = cn("transition-colors duration-200", {
			"h-4 w-4": compact,
			"h-5 w-5": !compact,
			"text-green-600": isSelected,
			"text-gray-500 group-hover:text-gray-600": !isSelected && !disabled,
		})

		// Compact mode structure (Forecast)
		if (compact) {
			return (
				<div className="flex flex-col gap-1 w-full">
					<Button
						onClick={onToggle}
						disabled={disabled}
						className={buttonClasses}
						title={`${meal.label} - ${isSelected ? "Confirmado" : "Não vai"}`}
					>
						<div className="flex flex-col items-center space-y-1 w-full">
							<Icon className={iconClasses} />
							<span className="text-xs font-medium truncate w-full text-center">{meal.label}</span>

							{/* Indicador visual simples */}
							<div
								className={cn(
									"w-2 h-2 rounded-full transition-colors duration-200",
									isSelected ? "bg-green-500" : "bg-gray-300"
								)}
							/>
						</div>
					</Button>

					{mainDish && (
						<Accordion className="w-full bg-muted/20 rounded-md border border-border/50">
							<AccordionItem value="details" className="border-0">
								<AccordionTrigger className="px-2 py-1.5 text-xs hover:no-underline hover:bg-muted/50 rounded-t-md data-[state=open]:rounded-b-none [&>svg]:w-3 [&>svg]:h-3">
									<span className="truncate text-left font-medium max-w-25 leading-tight text-foreground/80">
										{mainDish.name}
									</span>
								</AccordionTrigger>
								<AccordionContent className="px-2 pb-2 text-[10px] text-muted-foreground bg-background/50 rounded-b-md">
									{mainDish.ingredients.length > 0 ? (
										<ul className="list-disc pl-3 space-y-0.5 mt-1">
											{mainDish.ingredients.map((ing, i) => (
												<li key={`${ing.product_name}-${i}`}>
													{ing.product_name}
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
			<Button onClick={onToggle} disabled={disabled} className={buttonClasses}>
				<div className="flex items-center justify-between w-full">
					<div className="flex items-center space-x-3">
						<Icon className={iconClasses} />
						<span className="font-medium">{meal.label}</span>
					</div>

					{/* Status icon mais limpo */}
					<div
						className={cn(
							"flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200",
							{
								"bg-green-500 text-white": isSelected,
								"bg-gray-200 text-gray-500": !isSelected,
							}
						)}
					>
						{isSelected ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
					</div>
				</div>
			</Button>
		)
	}
)

MealButton.displayName = "MealButton"
