import { ArrowLeftRight, Loader2, SlidersHorizontal } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAdjustPortions, useRecordSubstitution } from "@/hooks/data/useProduction"
import type { ProductionItem } from "@/types/domain/production"

interface ShiftAdjustmentsSectionProps {
	item: ProductionItem
	kitchenId: number
	date: string
}

/**
 * Ajustes do turno, direto do chão de fábrica: corrigir porções planejadas
 * (corte de efetivo, demanda extra) e registrar substituição de insumo em falta.
 * Exige nível 2 em kitchen-production ou kitchen — o servidor rejeita sem grant.
 */
export function ShiftAdjustmentsSection({ item, kitchenId, date }: ShiftAdjustmentsSectionProps) {
	const { mutate: adjustPortions, isPending: isAdjusting } = useAdjustPortions()
	const { mutate: recordSubstitution, isPending: isRecording } = useRecordSubstitution()

	const plannedPortions = item.menuItem.planned_portion_quantity != null ? Number(item.menuItem.planned_portion_quantity) : null
	const [portions, setPortions] = useState<string>(plannedPortions?.toString() ?? "")
	const [substituteIngredientId, setSubstituteIngredientId] = useState<string | null>(null)
	const [rationale, setRationale] = useState("")
	const [prevItemId, setPrevItemId] = useState(item.menuItem.id)

	// Sincroniza quando o sheet troca de preparação (ajuste durante render, não em effect).
	if (prevItemId !== item.menuItem.id) {
		setPrevItemId(item.menuItem.id)
		setPortions(plannedPortions?.toString() ?? "")
		setSubstituteIngredientId(null)
		setRationale("")
	}

	const ingredients = item.menuItem.recipe_with_ingredients?.ingredients ?? []
	const selectedIngredient = ingredients.find((i) => i.ingredient?.id === substituteIngredientId)

	const portionsNum = portions === "" ? null : Number(portions)
	const portionsChanged = portionsNum != null && portionsNum > 0 && portionsNum !== plannedPortions

	const handleAdjust = () => {
		if (portionsNum == null || portionsNum <= 0) return
		adjustPortions({ menuItemId: item.menuItem.id, plannedPortionQuantity: portionsNum, kitchenId, date })
	}

	const handleSubstitute = () => {
		if (!substituteIngredientId || !rationale.trim()) return
		recordSubstitution(
			{ menuItemId: item.menuItem.id, ingredientId: substituteIngredientId, rationale: rationale.trim(), kitchenId, date },
			{
				onSuccess: () => {
					setSubstituteIngredientId(null)
					setRationale("")
				},
			}
		)
	}

	return (
		<div className="px-4 pb-4 space-y-2">
			<h3 className="text-subheading text-foreground flex items-center gap-2">
				<SlidersHorizontal className="size-4 text-muted-foreground" />
				Ajustes do Turno
			</h3>
			<div className="rounded-md border border-border p-3 space-y-3">
				{/* Ajuste de porções */}
				<div className="space-y-1">
					<Label htmlFor={`portions-${item.menuItem.id}`} className="text-xs text-muted-foreground">
						Porções planejadas
					</Label>
					<div className="flex gap-2">
						<Input
							id={`portions-${item.menuItem.id}`}
							type="number"
							min="1"
							value={portions}
							onChange={(e) => setPortions(e.target.value)}
							placeholder="Ex: 150"
							className="h-8 text-xs flex-1"
						/>
						<Button size="sm" variant="outline" onClick={handleAdjust} disabled={!portionsChanged || isAdjusting}>
							{isAdjusting && <Loader2 className="size-3.5 mr-1 animate-spin" />}
							Ajustar
						</Button>
					</div>
					<p className="text-[10px] text-muted-foreground">As quantidades de ingredientes acima reescalam automaticamente.</p>
				</div>

				{/* Substituição de insumo */}
				<div className="space-y-1 pt-2 border-t border-border">
					<Label className="text-xs text-muted-foreground flex items-center gap-1">
						<ArrowLeftRight className="size-3" />
						Registrar substituição de insumo
					</Label>
					<Select value={substituteIngredientId} onValueChange={(v) => setSubstituteIngredientId(v)}>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue placeholder="Insumo afetado...">{selectedIngredient?.ingredient?.description ?? "Insumo afetado..."}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{ingredients.flatMap((ing) =>
								ing.ingredient?.id ? (
									<SelectItem key={ing.ingredient.id} value={ing.ingredient.id}>
										{ing.ingredient.description ?? "Insumo sem nome"}
									</SelectItem>
								) : (
									[]
								)
							)}
						</SelectContent>
					</Select>
					<div className="flex gap-2">
						<Input
							value={rationale}
							onChange={(e) => setRationale(e.target.value)}
							placeholder="Justificativa (ex: produto em falta)"
							className="h-8 text-xs flex-1"
						/>
						<Button size="sm" variant="outline" onClick={handleSubstitute} disabled={!substituteIngredientId || !rationale.trim() || isRecording}>
							{isRecording && <Loader2 className="size-3.5 mr-1 animate-spin" />}
							Registrar
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}
