import { ArrowLeftRight, ChevronRight, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/cn"
import { formatSheetNumber, portionYieldOrOne } from "@/lib/technical-sheet"
import type { RecipeAlternativeFormRow } from "@/types/domain/recipes"
import { IngredientSelector } from "./IngredientSelector"

/** A linha da ficha e seus substitutos. Espelha `IngredientFormItem` do `RecipeForm`. */
export interface RecipeSubstitutionLine {
	ingredient_id: string | null
	ingredient_name: string
	measure_unit: string
	net_quantity: number | null
	alternatives: RecipeAlternativeFormRow[]
}

interface RecipeSubstitutionsPanelProps {
	ingredients: readonly RecipeSubstitutionLine[]
	portionYield: number
	/** Devolve a lista de substitutos de UMA linha (índice na ficha). */
	onChange: (index: number, alternatives: RecipeAlternativeFormRow[]) => void
}

/**
 * Substituições DA PREPARAÇÃO, linha a linha — como no SISUBWEB e como a ficha técnica em
 * papel registra.
 *
 * Entre 2026-07 e agora isto viveu no cadastro do insumo, como um par global
 * insumo → substituto com um fator. O modelo não descrevia a decisão real: "no lugar do
 * biscoito champagne vai amanteigado" vale NAQUELA preparação e quase nunca na mesma
 * gramatura. Por isso a substituta traz aqui a QUANTIDADE dela, não um multiplicador, e a
 * lista pertence à linha (`kitchen.recipe_ingredient_alternatives`).
 *
 * Estado do FORMULÁRIO, não gravação própria: os substitutos são salvos junto com a ficha,
 * no mesmo clique. `saveRecipeEdit` insere linhas novas a cada versão — gravar em separado
 * prenderia as substituições à versão anterior e a nova nasceria sem elas.
 */
export function RecipeSubstitutionsPanel({ ingredients, portionYield, onChange }: RecipeSubstitutionsPanelProps) {
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
	const [selectorOpen, setSelectorOpen] = useState(false)

	// Derivado, não sincronizado por efeito: remover o insumo da ficha invalida o índice e
	// o painel de baixo some no MESMO render.
	const selected = selectedIndex != null && selectedIndex < ingredients.length ? ingredients[selectedIndex] : null
	const yieldSafe = portionYieldOrOne(portionYield)

	if (ingredients.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Substituições</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border py-12 text-muted-foreground">
						<ArrowLeftRight className="size-10 opacity-30" />
						<p className="text-body">Nenhum ingrediente na ficha técnica</p>
						<p className="text-caption">Adicione ingredientes na aba Ingredientes para definir substituições.</p>
					</div>
				</CardContent>
			</Card>
		)
	}

	const patchAlternative = (altIndex: number, changes: Partial<RecipeAlternativeFormRow>) => {
		if (selectedIndex == null || !selected) return
		onChange(
			selectedIndex,
			selected.alternatives.map((alt, i) => (i === altIndex ? { ...alt, ...changes } : alt))
		)
	}

	const removeAlternative = (altIndex: number) => {
		if (selectedIndex == null || !selected) return
		onChange(
			selectedIndex,
			selected.alternatives.filter((_, i) => i !== altIndex)
		)
	}

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Ingrediente da ficha</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					{ingredients.map((item, index) => {
						const isSelected = index === selectedIndex
						return (
							<Item
								// A ficha aceita o mesmo insumo duas vezes, então a identidade da linha é a
								// POSIÇÃO — é ela que o `onChange` usa para devolver a lista alterada.
								key={`${item.ingredient_id ?? "novo"}-${index}`}
								variant="outline"
								className={cn("cursor-pointer transition-colors", isSelected ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40")}
								onClick={() => setSelectedIndex(isSelected ? null : index)}
							>
								<ItemContent>
									<ItemTitle>{item.ingredient_name}</ItemTitle>
									<ItemDescription>
										{formatSheetNumber(item.net_quantity ?? 0)} {item.measure_unit}
									</ItemDescription>
								</ItemContent>
								<ItemActions>
									{item.alternatives.length > 0 && (
										<Badge variant="secondary">
											{item.alternatives.length} {item.alternatives.length === 1 ? "substituto" : "substitutos"}
										</Badge>
									)}
									{isSelected ? <Badge variant="outline">Selecionado</Badge> : <ChevronRight className="size-4 text-muted-foreground" />}
								</ItemActions>
							</Item>
						)
					})}
				</CardContent>
			</Card>

			{selected && (
				<Card>
					<CardHeader className="flex flex-row items-center justify-between">
						<div className="flex items-center gap-2">
							<ArrowLeftRight className="size-4 text-muted-foreground" />
							<CardTitle>Substitutos de {selected.ingredient_name}</CardTitle>
						</div>
						<Button type="button" variant="outline" size="sm" onClick={() => setSelectorOpen(true)}>
							<Plus className="size-4 mr-2" />
							Adicionar substituto
						</Button>
					</CardHeader>
					<CardContent className="space-y-3">
						{selected.alternatives.length === 0 ? (
							<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border py-10 text-muted-foreground">
								<p className="text-body">Nenhum substituto para este ingrediente</p>
								<Button type="button" variant="outline" size="sm" onClick={() => setSelectorOpen(true)}>
									<Plus className="size-4 mr-2" />
									Adicionar substituto
								</Button>
							</div>
						) : (
							<Table>
								<TableHeader>
									<TableRow className="hover:bg-transparent">
										<TableHead>Substituto</TableHead>
										<TableHead>Unidade</TableHead>
										<TableHead className="text-right">Quantidade total</TableHead>
										<TableHead className="text-right">Per capita</TableHead>
										<TableHead>
											<span className="sr-only">Ações</span>
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{selected.alternatives.map((alt, altIndex) => (
										<TableRow key={`${alt.ingredient_id}-${altIndex}`}>
											<TableCell className="max-w-64 whitespace-normal font-medium">{alt.ingredient_name}</TableCell>
											<TableCell className="text-muted-foreground">{alt.measure_unit}</TableCell>
											<TableCell className="text-right">
												<Input
													aria-label={`Quantidade de ${alt.ingredient_name}`}
													type="number"
													step="0.001"
													min={0}
													value={alt.net_quantity ?? 0}
													onChange={(e) => patchAlternative(altIndex, { net_quantity: Number(e.target.value) })}
													className="ml-auto w-24 text-right"
												/>
											</TableCell>
											<TableCell className="text-right font-mono tabular-nums text-muted-foreground">
												{formatSheetNumber((alt.net_quantity ?? 0) / yieldSafe)}
											</TableCell>
											<TableCell>
												<Button
													type="button"
													variant="ghost"
													size="icon-sm"
													className="text-muted-foreground hover:text-destructive"
													aria-label={`Remover ${alt.ingredient_name}`}
													onClick={() => removeAlternative(altIndex)}
												>
													<Trash2 className="size-3.5" />
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}

						<p className="text-caption text-muted-foreground">
							A quantidade é a da SUBSTITUTA nesta preparação, não um fator: {formatSheetNumber(selected.net_quantity ?? 0)} {selected.measure_unit} de{" "}
							{selected.ingredient_name} podem virar uma gramatura diferente da substituta. Os substitutos são salvos junto com a ficha.
						</p>
					</CardContent>
				</Card>
			)}

			{selectorOpen && selected && selectedIndex != null && (
				<IngredientSelector
					isOpen={selectorOpen}
					onClose={() => setSelectorOpen(false)}
					onSelect={(ingredient) => {
						// O insumo da própria linha não é substituto de si mesmo, e o mesmo substituto
						// não entra duas vezes — o índice único da tabela rejeitaria a segunda com um
						// 23505 sem mensagem, já depois de o usuário ter clicado em salvar.
						if (ingredient.id === selected.ingredient_id) return
						if (selected.alternatives.some((alt) => alt.ingredient_id === ingredient.id)) return
						onChange(selectedIndex, [
							...selected.alternatives,
							{
								ingredient_id: ingredient.id,
								ingredient_name: ingredient.description ?? "",
								measure_unit: ingredient.measure_unit ?? "UN",
								// Nasce com a quantidade da linha original: é o palpite certo na maioria
								// dos casos e deixa explícito o que se deve ajustar quando não é.
								net_quantity: selected.net_quantity,
							},
						])
					}}
				/>
			)}
		</div>
	)
}
