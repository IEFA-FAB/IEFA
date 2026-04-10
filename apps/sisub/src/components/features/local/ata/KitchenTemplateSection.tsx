import { Minus, Plus, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { KitchenSelectionState, TemplateSelection } from "@/types/domain/ata"
import type { TemplateWithItemCounts } from "@/types/domain/planning"

interface KitchenTemplateSectionProps {
	kitchenState: KitchenSelectionState
	templates: TemplateWithItemCounts[]
	isLoadingTemplates?: boolean
	selectionType: "templateSelections" | "eventSelections"
	onUpdateSelection: (kitchenId: number, selectionType: "templateSelections" | "eventSelections", selections: TemplateSelection[]) => void
}

export function KitchenTemplateSection({ kitchenState, templates, isLoadingTemplates, selectionType, onUpdateSelection }: KitchenTemplateSectionProps) {
	const currentSelections = kitchenState[selectionType]

	const isSelected = (templateId: string) => currentSelections.some((s) => s.templateId === templateId)
	const getRepetitions = (templateId: string) => currentSelections.find((s) => s.templateId === templateId)?.repetitions ?? 1

	const handleToggle = (template: TemplateWithItemCounts, checked: boolean) => {
		if (checked) {
			onUpdateSelection(kitchenState.kitchenId, selectionType, [
				...currentSelections,
				{
					templateId: template.id,
					templateName: template.name || "",
					repetitions: 1,
				},
			])
		} else {
			onUpdateSelection(
				kitchenState.kitchenId,
				selectionType,
				currentSelections.filter((s) => s.templateId !== template.id)
			)
		}
	}

	const handleRepetitions = (templateId: string, delta: number) => {
		onUpdateSelection(
			kitchenState.kitchenId,
			selectionType,
			currentSelections.map((s) => (s.templateId === templateId ? { ...s, repetitions: Math.max(1, s.repetitions + delta) } : s))
		)
	}

	const handleRepetitionsInput = (templateId: string, value: string) => {
		const n = Number.parseInt(value, 10)
		if (!Number.isNaN(n) && n >= 1) {
			onUpdateSelection(
				kitchenState.kitchenId,
				selectionType,
				currentSelections.map((s) => (s.templateId === templateId ? { ...s, repetitions: n } : s))
			)
		}
	}

	const selectedCount = currentSelections.length

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center justify-between">
					<span className="text-base">{kitchenState.kitchenName}</span>
					{selectedCount > 0 && (
						<Badge variant="secondary" className="text-xs font-normal">
							{selectedCount} {selectedCount === 1 ? "selecionado" : "selecionados"}
						</Badge>
					)}
				</CardTitle>
			</CardHeader>
			<CardContent>
				{isLoadingTemplates ? (
					<div className="space-y-2">
						{[1, 2, 3].map((i) => (
							<div key={i} className="h-12 animate-pulse rounded bg-muted" aria-hidden="true" />
						))}
					</div>
				) : templates.length === 0 ? (
					<p className="text-sm text-muted-foreground py-4 text-center">Nenhum template disponível para esta cozinha.</p>
				) : (
					<div className="space-y-2">
						{templates.map((template) => {
							const selected = isSelected(template.id)
							const reps = getRepetitions(template.id)
							const allFilled = template.item_count > 0 && template.headcount_filled === template.item_count
							const someMissing = template.item_count > 0 && template.headcount_filled < template.item_count

							return (
								<div
									key={template.id}
									className={`flex items-center gap-3 rounded-md border p-3 transition-colors ${selected ? "border-primary/50 bg-primary/5" : "border-border"}`}
								>
									<Checkbox
										id={`template-${template.id}`}
										checked={selected}
										onCheckedChange={(checked) => handleToggle(template, checked === true)}
										aria-label={`Selecionar ${template.name}`}
									/>
									<div className="flex-1 min-w-0">
										<Label htmlFor={`template-${template.id}`} className="text-sm font-medium cursor-pointer">
											{template.name || "Sem nome"}
										</Label>
										<div className="flex items-center gap-2 mt-0.5 flex-wrap">
											<span className="text-xs text-muted-foreground">{template.recipe_count} preparações</span>

											{/* Indicador de comensais — só mostra quando incompleto */}
											{someMissing && (
												<>
													<span className="text-xs text-muted-foreground/40">·</span>
													<span className="text-xs text-destructive font-medium flex items-center gap-1">
														<Users className="h-3 w-3" aria-hidden="true" />
														{template.headcount_filled}/{template.item_count} com comensais
													</span>
												</>
											)}

											{/* Mostra média quando tudo preenchido */}
											{allFilled && template.avg_headcount_weekday !== null && (
												<>
													<span className="text-xs text-muted-foreground/40">·</span>
													<span className="text-xs text-muted-foreground flex items-center gap-1">
														<Users className="h-3 w-3" aria-hidden="true" />~{template.avg_headcount_weekday} com. (Seg–Qui)
													</span>
												</>
											)}
										</div>
									</div>
									{selected && (
										<div className="flex items-center gap-1.5 shrink-0">
											<Button
												size="icon"
												variant="outline"
												className="h-7 w-7"
												onClick={() => handleRepetitions(template.id, -1)}
												disabled={reps <= 1}
												aria-label="Diminuir repetições"
											>
												<Minus className="h-3 w-3" aria-hidden="true" />
											</Button>
											<Input
												type="number"
												min={1}
												value={reps}
												onChange={(e) => handleRepetitionsInput(template.id, e.target.value)}
												className="h-7 w-14 text-center tabular-nums text-sm"
												aria-label="Número de repetições"
											/>
											<Button
												size="icon"
												variant="outline"
												className="h-7 w-7"
												onClick={() => handleRepetitions(template.id, 1)}
												aria-label="Aumentar repetições"
											>
												<Plus className="h-3 w-3" aria-hidden="true" />
											</Button>
											<span className="text-xs text-muted-foreground ml-1">×</span>
										</div>
									)}
								</div>
							)
						})}
					</div>
				)}
			</CardContent>
		</Card>
	)
}
