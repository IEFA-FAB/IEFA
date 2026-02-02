// components/BulkMealSelector.tsx

import { Button, Card, CardContent, CardHeader, CardTitle, Label } from "@iefa/ui"
import { CheckCircle, Loader2, UtensilsCrossed } from "lucide-react"
import { useState } from "react"
import { MealButton } from "@/components/features/forecast/MealButton"
import { MEAL_TYPES } from "@/constants/rancho"
import { createEmptyDayMeals } from "@/lib/meal"
import type { DayMeals } from "@/types/domain/"

type ApplyMode = "fill-missing" | "override"

interface BulkMealSelectorProps {
	targetDates: string[] // Datas (YYYY-MM-DD) que receberão o template
	initialTemplate?: Partial<DayMeals> // Template inicial
	onApply: (template: DayMeals, options: { mode: ApplyMode }) => Promise<void>
	onCancel: () => void
	isApplying: boolean
}

export function BulkMealSelector({
	targetDates,
	initialTemplate,
	onApply,
	onCancel,
	isApplying,
}: BulkMealSelectorProps) {
	// Estado local do template de refeições
	const [template, setTemplate] = useState<DayMeals>(() => {
		const base = createEmptyDayMeals()
		if (initialTemplate) {
			Object.entries(initialTemplate).forEach(([key, val]) => {
				;(base as any)[key] = Boolean(val)
			})
		}
		return base
	})

	const [applyMode, setApplyMode] = useState<ApplyMode>("fill-missing")

	const cardsCount = targetDates.length
	const hasCardsToApply = cardsCount > 0

	const modeBtnBase = "text-xs sm:text-sm h-8 px-3 border rounded-md transition-colors"
	const modeBtnSelected = "bg-primary text-primary-foreground border-primary"
	const modeBtnUnselected = "border-border text-foreground hover:bg-muted"

	const selectedCount = Object.values(template).filter(Boolean).length

	const toggleMeal = (mealKey: keyof DayMeals) => {
		if (isApplying) return
		setTemplate((prev) => ({ ...prev, [mealKey]: !prev[mealKey] }))
	}

	const setAll = (value: boolean) => {
		if (isApplying) return
		setTemplate((prev) => {
			const next: DayMeals = { ...prev }
			Object.keys(next).forEach((k) => {
				;(next as any)[k] = value
			})
			return next
		})
	}

	const setWorkdayPreset = () => {
		if (isApplying) return
		setTemplate((prev) => {
			const next: DayMeals = { ...prev }
			// Café + Almoço marcados, demais desmarcados
			Object.keys(next).forEach((k) => {
				;(next as any)[k] = k === "cafe" || k === "almoco"
			})
			return next
		})
	}

	const handleApply = async () => {
		if (!hasCardsToApply || isApplying) return
		try {
			await onApply(template, { mode: applyMode })
		} catch (err) {
			console.error("Erro ao aplicar template de refeições:", err)
		}
	}

	const handleCancel = () => {
		if (isApplying) return
		onCancel()
	}

	return (
		<Card
			className="group relative w-full h-fit bg-card text-card-foreground border border-border shadow-sm transition-all duration-300 hover:shadow-md hover:border-accent max-w-xl
        "
		>
			<CardHeader className="">
				<CardTitle className="flex items-center gap-2 text-foreground">
					<span
						className="
                  inline-flex items-center justify-center h-8 w-8 rounded-lg
                  bg-background text-primary ring-1 ring-border
                "
					>
						<UtensilsCrossed className="h-5 w-5" />
					</span>
					Aplicar Refeições em Massa
				</CardTitle>
			</CardHeader>

			<CardContent className="space-y-6">
				{/* Modo de aplicação */}
				<div className="space-y-2">
					<Label className="text-sm font-medium text-foreground">Modo de aplicação:</Label>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							className={`${modeBtnBase} ${
								applyMode === "fill-missing" ? modeBtnSelected : modeBtnUnselected
							}`}
							onClick={() => setApplyMode("fill-missing")}
							disabled={isApplying}
						>
							Preencher onde está vazio
						</Button>
						<Button
							type="button"
							variant="outline"
							className={`${modeBtnBase} ${
								applyMode === "override" ? modeBtnSelected : modeBtnUnselected
							}`}
							onClick={() => setApplyMode("override")}
							disabled={isApplying}
						>
							Sobrescrever tudo
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						Selecionadas: <strong className="text-foreground">{selectedCount}</strong> de 4
						refeições.
					</p>
				</div>

				{/* Grid de refeições (padrão do DayCard) */}
				<div className="space-y-3">
					<Label className="text-sm font-medium text-foreground">Escolha as refeições:</Label>
					<div className="grid grid-cols-2 gap-2">
						{MEAL_TYPES.map((meal) => {
							const mealKey = meal.value as keyof DayMeals
							return (
								<MealButton
									key={meal.value}
									meal={meal}
									isSelected={template[mealKey]}
									onToggle={() => toggleMeal(mealKey)}
									disabled={isApplying}
									compact={true}
								/>
							)
						})}
					</div>

					{/* Presets rápidos */}
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setAll(true)}
							disabled={isApplying}
							className="text-xs hover:bg-muted"
						>
							Todas
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setAll(false)}
							disabled={isApplying}
							className="text-xs hover:bg-muted"
						>
							Nenhuma
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={setWorkdayPreset}
							disabled={isApplying}
							className="text-xs hover:bg-muted"
						>
							Padrão Dias Úteis
						</Button>
					</div>
				</div>

				{/* Rodapé com ações */}
				<div className="flex flex-row-reverse gap-4">
					<Button
						variant="outline"
						size="sm"
						onClick={handleCancel}
						disabled={isApplying}
						className="
                    hover:bg-muted
                    focus-visible:ring-2 focus-visible:ring-ring
                    focus-visible:ring-offset-2 focus-visible:ring-offset-background
                  "
					>
						Cancelar
					</Button>

					<Button
						size="sm"
						onClick={handleApply}
						disabled={isApplying || !hasCardsToApply || selectedCount === 0}
						className="
                    bg-primary text-primary-foreground hover:bg-primary/90
                    focus-visible:ring-2 focus-visible:ring-ring
                    focus-visible:ring-offset-2 focus-visible:ring-offset-background
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
					>
						{isApplying ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin mr-2" />
								Aplicando...
							</>
						) : (
							<>
								<CheckCircle className="h-4 w-4 mr-2" />
								Aplicar a {cardsCount} card{cardsCount !== 1 ? "s" : ""}
							</>
						)}
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}
