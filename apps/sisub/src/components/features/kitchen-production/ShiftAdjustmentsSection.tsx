import { ArrowLeftRight, Loader2, SlidersHorizontal } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMenuItemSubstituteOptions } from "@/hooks/data/usePlanningAdjustments"
import { useAdjustPortions, useRecordSubstitution } from "@/hooks/data/useProduction"
import type { ProductionItem } from "@/types/domain/production"

interface ShiftAdjustmentsSectionProps {
	item: ProductionItem
	kitchenId: number
	date: string
}

/**
 * Ajustes do turno, direto do chão de fábrica.
 *
 * - Substituição de insumo em falta: o turno registra sozinho (`kitchen-production:1`) o que
 *   faltou E o que entrou no lugar — o mesmo registro do agendamento, que a baixa e a
 *   nutricionista leem depois. Os substitutos que a ficha prevê aparecem a um clique.
 * - Porções planejadas: ajuste de planejamento, exige nível 2 em kitchen-production ou kitchen
 *   (o servidor recusa sem o grant).
 */
export function ShiftAdjustmentsSection({ item, kitchenId, date }: ShiftAdjustmentsSectionProps) {
	const { mutate: adjustPortions, isPending: isAdjusting } = useAdjustPortions()
	const { mutate: recordSubstitution, isPending: isRecording } = useRecordSubstitution()

	const plannedPortions = item.menuItem.planned_portion_quantity != null ? Number(item.menuItem.planned_portion_quantity) : null
	const [portions, setPortions] = useState<string>(plannedPortions?.toString() ?? "")
	const [missingIngredientId, setMissingIngredientId] = useState<string | null>(null)
	const [substituteId, setSubstituteId] = useState<string | null>(null)
	const [substituteName, setSubstituteName] = useState("")
	const [rationale, setRationale] = useState("")
	const [prevItemId, setPrevItemId] = useState(item.menuItem.id)

	// Sincroniza quando o sheet troca de preparação (ajuste durante render, não em effect).
	if (prevItemId !== item.menuItem.id) {
		setPrevItemId(item.menuItem.id)
		setPortions(plannedPortions?.toString() ?? "")
		setMissingIngredientId(null)
		setSubstituteId(null)
		setSubstituteName("")
		setRationale("")
	}

	const ingredients = item.menuItem.recipe_with_ingredients?.ingredients ?? []
	const missingLine = ingredients.find((i) => i.ingredient?.id === missingIngredientId)
	const { data: substituteOptions } = useMenuItemSubstituteOptions(missingIngredientId ? item.menuItem.id : null)
	const suggestions = missingLine ? (substituteOptions?.[missingLine.id] ?? []) : []

	const portionsNum = portions === "" ? null : Number(portions)
	const portionsChanged = portionsNum != null && portionsNum > 0 && portionsNum !== plannedPortions
	const canRecord = missingIngredientId != null && substituteName.trim() !== "" && rationale.trim() !== ""

	const handleAdjust = () => {
		if (portionsNum == null || portionsNum <= 0) return
		adjustPortions({ menuItemId: item.menuItem.id, plannedPortionQuantity: portionsNum, kitchenId, date })
	}

	const handleSubstitute = () => {
		if (!missingIngredientId || !canRecord) return
		recordSubstitution(
			{
				menuItemId: item.menuItem.id,
				ingredientId: missingIngredientId,
				substituteIngredientId: substituteId,
				substituteDescription: substituteName.trim(),
				rationale: rationale.trim(),
				kitchenId,
				date,
			},
			{
				onSuccess: () => {
					setMissingIngredientId(null)
					setSubstituteId(null)
					setSubstituteName("")
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

				{/* Substituição de insumo: o que faltou e o que entrou */}
				<div className="space-y-2 pt-2 border-t border-border">
					<Label className="text-xs text-muted-foreground flex items-center gap-1">
						<ArrowLeftRight className="size-3" />
						Faltou um insumo? Registre o substituto
					</Label>
					<Select
						value={missingIngredientId}
						onValueChange={(v) => {
							setMissingIngredientId(v)
							setSubstituteId(null)
							setSubstituteName("")
						}}
					>
						<SelectTrigger className="h-8 text-xs" aria-label="Insumo que faltou">
							<SelectValue placeholder="Insumo que faltou...">{missingLine?.ingredient?.description ?? "Insumo que faltou..."}</SelectValue>
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
					{missingLine && (
						<Field>
							<FieldLabel htmlFor={`substitute-${item.menuItem.id}`}>O que entrou no lugar?</FieldLabel>
							{suggestions.length > 0 && (
								<div className="flex flex-wrap gap-1.5">
									{suggestions.map((s) => (
										<Button
											key={`${s.kind}-${s.id}`}
											type="button"
											size="xs"
											variant={substituteName === (s.description ?? "") ? "default" : "outline"}
											onClick={() => {
												// Só insumo do catálogo vira id; preparação congelada vai pelo nome.
												setSubstituteId(s.kind === "ingredient" ? s.id : null)
												setSubstituteName(s.description ?? "")
											}}
										>
											{s.description}
											{s.kind === "frozen_preparation" ? " (congelada)" : ""}
										</Button>
									))}
								</div>
							)}
							<Input
								id={`substitute-${item.menuItem.id}`}
								value={substituteName}
								onChange={(e) => {
									setSubstituteName(e.target.value)
									setSubstituteId(null)
								}}
								placeholder="Ex.: Polpa de acerola"
								maxLength={200}
							/>
							<FieldDescription>
								{suggestions.length > 0
									? "Substitutos previstos na ficha acima; ou digite outro."
									: "Digite o que foi usado — vale o que não está no catálogo."}
							</FieldDescription>
						</Field>
					)}
					<div className="flex gap-2">
						<Input
							value={rationale}
							onChange={(e) => setRationale(e.target.value)}
							placeholder="Motivo (ex: produto em falta)"
							aria-label="Motivo da substituição"
							className="h-8 text-xs flex-1"
						/>
						<Button size="sm" variant="outline" onClick={handleSubstitute} disabled={!canRecord || isRecording}>
							{isRecording && <Loader2 className="size-3.5 mr-1 animate-spin" />}
							Registrar
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}
