import { Circle, CircleCheck, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Toggle } from "@/components/ui/toggle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/cn"
import { formatSheetNumber, technicalSheetLine, technicalSheetTotals } from "@/lib/technical-sheet"

/** Linha da ficha como o formulário a mantém. Espelha `IngredientFormItem` do `RecipeForm`. */
export interface RecipeIngredientRow {
	ingredient_id: string | null
	ingredient_name: string
	measure_unit: string
	folder_id: string | null
	net_quantity: number | null
	is_optional: boolean
	priority_order: number
	correction_factor: number | null
	rehydration_index: number | null
}

interface RecipeIngredientsTableProps {
	ingredients: RecipeIngredientRow[]
	/** Rendimento em porções — divisor do per capita. */
	portionYield: number
	onChange: (next: RecipeIngredientRow[]) => void
	onAdd: () => void
	/** Erros do campo `ingredients` como um todo (ex.: lista vazia). */
	errors: Array<{ message?: string }>
	/** Erro por linha/campo, calculado pelo formulário contra o schema do submit. */
	rowErrors?: (row: RecipeIngredientRow) => Partial<Record<keyof RecipeIngredientRow, string>>
}

/**
 * PARTE 02 da Ficha Técnica de Preparação, no formato do modelo oficial da SIA
 * (`docs/examples/Modelo_FTP_SIA.pdf`): uma TABELA com `Ingrediente | Unidade` e a faixa
 * `PER CAPITA` cobrindo `PB | FC | PL | IR | Peso reidratado`, fechada por uma linha TOTAL.
 *
 * Antes era uma lista de cartões: cada insumo ocupava três alturas de linha, os fatores
 * ficavam num rodapé recuado e o peso bruto aparecia como frase solta. Não dava para
 * comparar dois insumos sem rolar, e nada na tela correspondia ao papel que a Seção
 * preenche. Numa tabela os números ficam alinhados na coluna e a conferência é vertical.
 *
 * O que se DIGITA continua sendo o que o banco guarda — peso líquido TOTAL da preparação,
 * FC e IR. `PB`, `PL` e `Peso reidratado` são derivados (`lib/technical-sheet.ts`), e a
 * coluna de total fica separada da faixa per capita: misturar as duas escalas na mesma
 * linha foi o erro de leitura que o formulário em papel evita ao dizer PER CAPITA no topo.
 */
export function RecipeIngredientsTable({ ingredients, portionYield, onChange, onAdd, errors, rowErrors }: RecipeIngredientsTableProps) {
	const patch = (index: number, changes: Partial<RecipeIngredientRow>) => {
		const next = ingredients.map((row, i) => (i === index ? { ...row, ...changes } : row))
		onChange(next)
	}

	const remove = (index: number) => {
		const snapshot = [...ingredients]
		onChange(snapshot.filter((_, i) => i !== index))
		toast("Ingrediente removido.", { action: { label: "Desfazer", onClick: () => onChange(snapshot) } })
	}

	const lines = ingredients.map((row) => ({
		row,
		sheet: technicalSheetLine(
			{ netQuantity: row.net_quantity, correctionFactor: row.correction_factor, rehydrationIndex: row.rehydration_index },
			portionYield
		),
	}))
	const totals = technicalSheetTotals(lines.map(({ row, sheet }) => ({ ...sheet, measureUnit: row.measure_unit })))
	const mixedUnits = totals.units.length > 1

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<div className="flex items-center gap-2">
					<CardTitle>Ingredientes</CardTitle>
					{ingredients.length > 0 && <Badge variant="secondary">{ingredients.length}</Badge>}
				</div>
				<Button type="button" variant="outline" size="sm" onClick={onAdd}>
					<Plus className="size-4 mr-2" />
					Adicionar
				</Button>
			</CardHeader>
			<CardContent className="space-y-3">
				{ingredients.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border py-10 text-muted-foreground">
						<p className="text-body">Nenhum ingrediente adicionado</p>
						<Button type="button" variant="outline" size="sm" onClick={onAdd}>
							<Plus className="size-4 mr-2" />
							Adicionar ingrediente
						</Button>
					</div>
				) : (
					<Table>
						<TableHeader>
							{/* Dois níveis de cabeçalho, como no modelo: a faixa PER CAPITA agrupa as cinco
							    colunas derivadas e deixa explícito que aquilo NÃO é o total da preparação. */}
							<TableRow className="hover:bg-transparent">
								<TableHead rowSpan={2} className="align-bottom">
									Ingrediente
								</TableHead>
								<TableHead rowSpan={2} className="align-bottom">
									Unidade
								</TableHead>
								<TableHead rowSpan={2} className="align-bottom text-right">
									PL total
								</TableHead>
								<TableHead colSpan={5} className="border-x border-border text-center">
									PER CAPITA
								</TableHead>
								<TableHead rowSpan={2} className="align-bottom text-center">
									Opcional
								</TableHead>
								<TableHead rowSpan={2}>
									<span className="sr-only">Ações</span>
								</TableHead>
							</TableRow>
							<TableRow className="hover:bg-transparent">
								<TableHead className="border-l border-border text-right">PB</TableHead>
								<TableHead className="text-right">FC</TableHead>
								<TableHead className="text-right">PL</TableHead>
								<TableHead className="text-right">IR</TableHead>
								<TableHead className="border-r border-border text-right">Peso reidratado</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{lines.map(({ row, sheet }, index) => {
								const rowError = rowErrors?.(row) ?? {}
								const messages = [rowError.ingredient_id, rowError.net_quantity, rowError.correction_factor, rowError.rehydration_index].filter(Boolean)
								return (
									// Chave composta: o mesmo insumo pode entrar duas vezes na ficha (dois cortes de
									// carne com o mesmo cadastro), e só o `ingredient_id` colidiria — duas linhas com a
									// mesma chave trocam o foco e o valor dos inputs entre si ao editar.
									<TableRow
										key={`${row.ingredient_id ?? "novo"}-${index}`}
										data-invalid={messages.length > 0 || undefined}
										className="data-[invalid]:bg-destructive/5"
									>
										<TableCell className="max-w-64 whitespace-normal font-medium">
											{row.ingredient_name}
											{messages.length > 0 && (
												<p role="alert" className="text-caption text-destructive">
													{messages.join(" · ")}
												</p>
											)}
										</TableCell>
										<TableCell className="text-muted-foreground">{row.measure_unit}</TableCell>
										<TableCell className="text-right">
											<Input
												aria-label={`Peso líquido total de ${row.ingredient_name}`}
												type="number"
												step="0.001"
												aria-invalid={!!rowError.net_quantity}
												value={row.net_quantity ?? 0}
												onChange={(e) => patch(index, { net_quantity: Number(e.target.value) })}
												className="ml-auto w-24 text-right"
											/>
										</TableCell>
										<TableCell className="border-l border-border text-right font-mono tabular-nums">{formatSheetNumber(sheet.grossWeight)}</TableCell>
										<TableCell className="text-right">
											<Input
												aria-label={`Fator de correção de ${row.ingredient_name}`}
												type="number"
												step="0.01"
												min={0}
												placeholder="1"
												aria-invalid={!!rowError.correction_factor}
												value={row.correction_factor ?? ""}
												onChange={(e) => patch(index, { correction_factor: e.target.value === "" ? null : Number(e.target.value) })}
												className="ml-auto w-20 text-right"
											/>
										</TableCell>
										<TableCell className="text-right font-mono tabular-nums">{formatSheetNumber(sheet.netWeight)}</TableCell>
										<TableCell className="text-right">
											<Input
												aria-label={`Índice de reidratação de ${row.ingredient_name}`}
												type="number"
												step="0.01"
												min={0}
												placeholder="1"
												aria-invalid={!!rowError.rehydration_index}
												value={row.rehydration_index ?? ""}
												onChange={(e) => patch(index, { rehydration_index: e.target.value === "" ? null : Number(e.target.value) })}
												className="ml-auto w-20 text-right"
											/>
										</TableCell>
										<TableCell className="border-r border-border text-right font-mono tabular-nums">{formatSheetNumber(sheet.rehydratedWeight)}</TableCell>
										<TableCell className="text-center">
											<Toggle
												variant="outline"
												size="sm"
												pressed={row.is_optional}
												onPressedChange={(pressed) => patch(index, { is_optional: pressed })}
												aria-label={`Marcar ${row.ingredient_name} como opcional`}
											>
												{row.is_optional ? <CircleCheck className="size-3.5" /> : <Circle className="size-3.5" />}
											</Toggle>
										</TableCell>
										<TableCell>
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												className="text-muted-foreground hover:text-destructive"
												aria-label={`Remover ${row.ingredient_name}`}
												onClick={() => remove(index)}
											>
												<Trash2 className="size-3.5" />
											</Button>
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
						<TableFooter>
							<TableRow className="hover:bg-transparent">
								<TableCell colSpan={3} className="font-medium">
									TOTAL
								</TableCell>
								<TableCell className={cn("border-l border-border text-right font-mono tabular-nums", mixedUnits && "text-muted-foreground")}>
									{formatSheetNumber(totals.grossWeight)}
								</TableCell>
								<TableCell />
								<TableCell className={cn("text-right font-mono tabular-nums", mixedUnits && "text-muted-foreground")}>
									{formatSheetNumber(totals.netWeight)}
								</TableCell>
								<TableCell />
								<TableCell className={cn("border-r border-border text-right font-mono tabular-nums", mixedUnits && "text-muted-foreground")}>
									{formatSheetNumber(totals.rehydratedWeight)}
								</TableCell>
								<TableCell colSpan={2} />
							</TableRow>
						</TableFooter>
					</Table>
				)}

				{/* Legenda do modelo — as siglas não são óbvias fora do formulário em papel. */}
				{ingredients.length > 0 && (
					<p className="text-caption text-muted-foreground">
						PB = Peso Bruto · PL = Peso Líquido · FC = PB ÷ PL · IR = Peso reidratado ÷ Peso seco. A faixa PER CAPITA é o valor por porção
						{portionYield > 0 ? ` (rendimento: ${portionYield} porções)` : " (defina o rendimento na aba Detalhes)"}.
					</p>
				)}

				{/* O TOTAL do formulário em papel pressupõe uma unidade só; o catálogo mistura KG,
				    LT e UN. Somar assim mesmo e ficar calado seria imprimir um número inventado. */}
				{mixedUnits && (
					<Tooltip>
						<TooltipTrigger
							render={
								<p className="w-fit cursor-help text-caption text-warning">
									O TOTAL soma unidades diferentes ({totals.units.join(", ")}) — use como referência, não como peso.
								</p>
							}
						/>
						<TooltipContent>O modelo em papel tem uma linha TOTAL só, que só faz sentido quando toda a ficha está na mesma unidade.</TooltipContent>
					</Tooltip>
				)}

				<FieldError errors={errors} />
			</CardContent>
		</Card>
	)
}
