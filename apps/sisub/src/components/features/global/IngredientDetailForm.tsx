import type { Ceafa, Folder, Ingredient, Nutrient } from "@iefa/database/sisub"
import { useForm } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { Check, ChevronsUpDown, Loader2, Save } from "lucide-react"
import { type Dispatch, type SetStateAction, useMemo, useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/cn"
import { ceafaQueryOptions, useIngredientNutrients, useNutrients, useSetIngredientNutrients, useUpdateIngredient } from "@/services/IngredientsService"
import { IngredientItemsManager } from "./IngredientItemsManager"
import { PurchaseItemsManager } from "./PurchaseItemsManager"

const productSchema = z.object({
	description: z.string().min(3, "Descrição deve ter no mínimo 3 caracteres"),
	folder_id: z.string().uuid().nullable(),
	measure_unit: z.string().nullable(),
	correction_factor: z.number().nullable(),
	ceafa_id: z.string().uuid().nullable(),
})

const MEASURE_UNIT_LABELS: Record<string, string> = {
	UN: "UN (Unidade)",
	KG: "KG (Quilograma)",
	LT: "LT (Litro)",
	G: "G (Grama)",
	ML: "ML (Mililitro)",
}

interface IngredientDetailFormProps {
	ingredient: Ingredient
	folders: Folder[]
}

export function IngredientDetailForm({ ingredient, folders }: IngredientDetailFormProps) {
	const queryClient = useQueryClient()
	const { updateIngredient, isUpdating } = useUpdateIngredient()
	const { setIngredientNutrients, isSaving: isSavingNutrients } = useSetIngredientNutrients()

	const { nutrients } = useNutrients()
	const { ingredientNutrients } = useIngredientNutrients(ingredient.id)

	const [ceafaOpen, setCeafaOpen] = useState(false)
	const [ceafaSearch, setCeafaSearch] = useState("")

	// Load ceafa list reactively via query
	const ceafaList = queryClient.getQueryData<Ceafa[]>(ceafaQueryOptions(ceafaSearch).queryKey) ?? []

	const syncedNutrients = nutrients ?? []

	// Derive initial nutrient values from server data; user edits are tracked via overrides
	const baseNutrientValues = useMemo(() => {
		if (!nutrients || !ingredientNutrients) return {}
		const map = Object.fromEntries(ingredientNutrients.map((pn) => [pn.nutrient_id, pn.nutrient_value]))
		return Object.fromEntries(nutrients.map((n) => [n.id, map[n.id] != null ? String(map[n.id]) : ""]))
	}, [nutrients, ingredientNutrients])

	// Local nutrient state (controlled separately from the main form)
	const [nutrientOverrides, setNutrientOverrides] = useState<Record<string, string>>({})
	const nutrientValues = { ...baseNutrientValues, ...nutrientOverrides }
	const setNutrientValues: Dispatch<SetStateAction<Record<string, string>>> = (action) => {
		setNutrientOverrides((prev) => {
			const base = { ...baseNutrientValues, ...prev }
			return typeof action === "function" ? action(base) : action
		})
	}
	const currentCeafa = ingredient.ceafa_id ? queryClient.getQueryData<Ceafa[]>(ceafaQueryOptions("").queryKey)?.find((c) => c.id === ingredient.ceafa_id) : null

	const form = useForm({
		defaultValues: {
			description: ingredient.description ?? "",
			folder_id: ingredient.folder_id ?? null,
			measure_unit: ingredient.measure_unit ?? "",
			correction_factor: ingredient.correction_factor ? Number(ingredient.correction_factor) : 1.0,
			ceafa_id: ingredient.ceafa_id ?? null,
		},
		onSubmit: async ({ value }) => {
			const validation = productSchema.safeParse(value)
			if (!validation.success) {
				const first = validation.error.issues[0]
				toast.error(first?.message ?? "Preencha os campos obrigatórios corretamente")
				return
			}

			try {
				await updateIngredient({ id: ingredient.id, payload: validation.data })

				const nutrientsPayload = syncedNutrients.map((n) => ({
					nutrient_id: n.id,
					nutrient_value: nutrientValues[n.id] !== "" ? Number(nutrientValues[n.id]) : null,
				}))
				await setIngredientNutrients({ ingredientId: ingredient.id, nutrients: nutrientsPayload })

				await queryClient.invalidateQueries({ queryKey: ["ingredients"] })
				toast.success("Insumo atualizado com sucesso!")
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err)
				toast.error(msg || "Erro ao atualizar insumo")
			}
		},
	})

	const isPending = isUpdating || isSavingNutrients

	const folder = folders.find((f) => f.id === ingredient.folder_id)

	return (
		<div className="space-y-6 pb-20">
			<PageHeader title={ingredient.description ?? "Insumo"} description={folder?.description ?? undefined} onBack={() => window.history.back()} />

			<form
				onSubmit={(e) => {
					e.preventDefault()
					e.stopPropagation()
					form.handleSubmit()
				}}
				className="space-y-6 max-w-5xl mx-auto"
			>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					{/* Informações Básicas */}
					<Card className="md:col-span-2">
						<CardHeader>
							<CardTitle>Informações Básicas</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<form.Field name="description">
								{(field) => (
									<Field data-invalid={field.state.meta.errors.length > 0}>
										<FieldLabel htmlFor="description">
											Descrição <span className="text-destructive">*</span>
										</FieldLabel>
										<FieldContent>
											<Input
												id="description"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												className={field.state.meta.errors.length > 0 ? "border-destructive" : ""}
												placeholder="Ex: Arroz Branco, Feijão Carioca"
											/>
											<FieldError errors={field.state.meta.errors.filter(Boolean).map((e) => ({ message: String(e) }))} />
										</FieldContent>
									</Field>
								)}
							</form.Field>

							<form.Field name="folder_id">
								{(field) => (
									<Field>
										<FieldLabel>Pasta (Categoria)</FieldLabel>
										<FieldContent>
											<Select
												value={field.state.value ?? "__NONE__"}
												onValueChange={(v) => field.handleChange(v === "__NONE__" || v == null ? (null as unknown as string) : v)}
											>
												<SelectTrigger>
													<SelectValue placeholder="Selecione uma pasta">
														{field.state.value && field.state.value !== "__NONE__"
															? (folders.find((f) => f.id === field.state.value)?.description ?? "Sem Nome")
															: undefined}
													</SelectValue>
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="__NONE__">Sem pasta</SelectItem>
													{folders.map((f) => (
														<SelectItem key={f.id} value={f.id}>
															{f.description ?? "Sem Nome"}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</FieldContent>
									</Field>
								)}
							</form.Field>

							<form.Field name="ceafa_id">
								{(field) => (
									<Field>
										<FieldLabel>Correlação CEAFA</FieldLabel>
										<FieldContent>
											<Popover open={ceafaOpen} onOpenChange={setCeafaOpen}>
												<PopoverTrigger
													type="button"
													role="combobox"
													aria-expanded={ceafaOpen}
													aria-controls="ceafa-combobox-popup"
													className={cn(buttonVariants({ variant: "outline" }), "w-full justify-between font-normal")}
												>
													<span className="truncate">
														{field.state.value
															? (ceafaList.find((c) => c.id === field.state.value)?.description ?? currentCeafa?.description ?? "CEAFA selecionado")
															: "Buscar alimento CEAFA..."}
													</span>
													<ChevronsUpDown className="ml-2 size-4 shrink-0 text-muted-foreground" />
												</PopoverTrigger>
												<PopoverContent id="ceafa-combobox-popup" className="w-[400px] p-0" align="start">
													<Command shouldFilter={false}>
														<CommandInput
															placeholder="Pesquisar CEAFA..."
															value={ceafaSearch}
															onValueChange={(v) => {
																setCeafaSearch(v)
																queryClient.fetchQuery(ceafaQueryOptions(v))
															}}
														/>
														<CommandList>
															<CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
															<CommandGroup>
																{field.state.value && (
																	<CommandItem
																		value="__CLEAR__"
																		onSelect={() => {
																			field.handleChange(null as unknown as string)
																			setCeafaOpen(false)
																		}}
																	>
																		<span className="text-muted-foreground italic">Remover correlação</span>
																	</CommandItem>
																)}
																{ceafaList.map((ceafa) => (
																	<CommandItem
																		key={ceafa.id}
																		value={ceafa.id}
																		onSelect={() => {
																			field.handleChange(ceafa.id)
																			setCeafaOpen(false)
																		}}
																	>
																		<Check className={cn("mr-2 size-4", field.state.value === ceafa.id ? "opacity-100" : "opacity-0")} />
																		<span className="truncate">{ceafa.description}</span>
																		<span className="ml-auto text-xs text-muted-foreground shrink-0">{ceafa.quantity}g</span>
																	</CommandItem>
																))}
															</CommandGroup>
														</CommandList>
													</Command>
												</PopoverContent>
											</Popover>
										</FieldContent>
									</Field>
								)}
							</form.Field>
						</CardContent>
					</Card>

					{/* Métricas */}
					<Card>
						<CardHeader>
							<CardTitle>Métricas</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<form.Field name="measure_unit">
								{(field) => (
									<Field>
										<FieldLabel>Unidade de Medida</FieldLabel>
										<FieldContent>
											<Select value={field.state.value ?? "__NONE__"} onValueChange={(v) => field.handleChange(v === "__NONE__" || v == null ? "" : v)}>
												<SelectTrigger>
													<SelectValue placeholder="Selecione">
														{field.state.value && field.state.value !== "__NONE__" ? (MEASURE_UNIT_LABELS[field.state.value] ?? field.state.value) : undefined}
													</SelectValue>
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="__NONE__">Selecione</SelectItem>
													<SelectItem value="UN">UN (Unidade)</SelectItem>
													<SelectItem value="KG">KG (Quilograma)</SelectItem>
													<SelectItem value="LT">LT (Litro)</SelectItem>
													<SelectItem value="G">G (Grama)</SelectItem>
													<SelectItem value="ML">ML (Mililitro)</SelectItem>
												</SelectContent>
											</Select>
										</FieldContent>
									</Field>
								)}
							</form.Field>

							<form.Field name="correction_factor">
								{(field) => (
									<Field>
										<FieldLabel>Fator de Correção (FC)</FieldLabel>
										<FieldContent>
											<Input
												type="number"
												step="0.0001"
												value={field.state.value ?? ""}
												onChange={(e) => field.handleChange(Number(e.target.value))}
												placeholder="1.0000"
											/>
											<FieldDescription>Fator nutricional/desperdício (padrão: 1.0)</FieldDescription>
										</FieldContent>
									</Field>
								)}
							</form.Field>
						</CardContent>
					</Card>
				</div>

				{/* Nutrientes */}
				<NutrientsCard nutrients={syncedNutrients} values={nutrientValues} onChange={setNutrientValues} />

				<div className="flex justify-end gap-4">
					<Button type="button" variant="outline" onClick={() => window.history.back()}>
						Cancelar
					</Button>
					<Button type="submit" disabled={isPending}>
						{isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
						<Save className="size-4 mr-2" />
						Salvar Insumo
					</Button>
				</div>
			</form>

			{/* Itens de Compra (purchase_item + CATMAT) */}
			<div className="max-w-5xl mx-auto">
				<PurchaseItemsManager ingredientId={ingredient.id} />
			</div>

			{/* Itens de Produto (ingredient_item — estoque/GS1, vinculado a 1 item de compra) */}
			<div className="max-w-5xl mx-auto">
				<IngredientItemsManager ingredientId={ingredient.id} />
			</div>
		</div>
	)
}

// ============================================================================
// Nutrients sub-component
// ============================================================================

interface NutrientsCardProps {
	nutrients: Nutrient[]
	values: Record<string, string>
	onChange: Dispatch<SetStateAction<Record<string, string>>>
}

/** Extrai a unidade embutida no nome (ex.: "Carboidratos (g)" → label "Carboidratos", unit "g"). */
function parseNutrientName(name: string): { label: string; unit: string | null } {
	const match = name.match(/\s*\(([^)]+)\)\s*$/)
	if (match && match.index != null) return { label: name.slice(0, match.index).trim(), unit: match[1] }
	return { label: name, unit: null }
}

/** Formata número removendo casas decimais desnecessárias (300.00 → "300", 24.5 → "24,5"). */
function formatNumber(n: number): string {
	return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
}

function NutrientsCard({ nutrients, values, onChange }: NutrientsCardProps) {
	if (nutrients.length === 0) return null

	// Ordena como num rótulo nutricional brasileiro: valor energético primeiro, depois display_order.
	const ordered = [...nutrients].sort((a, b) => {
		if (a.is_energy_value !== b.is_energy_value) return a.is_energy_value ? -1 : 1
		return (a.display_order ?? 999) - (b.display_order ?? 999)
	})

	return (
		<Card className="max-w-5xl mx-auto">
			<CardHeader>
				<CardTitle>Informação Nutricional</CardTitle>
				<p className="text-sm text-muted-foreground">
					Valores por <span className="font-medium text-foreground">100 g</span> do insumo. O %VD é calculado automaticamente sobre os valores diários de
					referência. Deixe em branco para não informar.
				</p>
			</CardHeader>
			<CardContent>
				<div className="overflow-hidden rounded-lg border border-border">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b-2 border-foreground/80 bg-muted/40">
								<th className="px-4 py-2 text-left font-semibold text-foreground">Nutrientes</th>
								<th className="px-4 py-2 text-right font-semibold text-foreground w-44">Quantidade por 100 g</th>
								<th className="px-4 py-2 text-right font-semibold text-foreground w-24">%VD*</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{ordered.map((n) => (
								<NutrientRow key={n.id} nutrient={n} value={values[n.id] ?? ""} onChange={onChange} />
							))}
						</tbody>
					</table>
				</div>
				<p className="mt-3 text-caption text-muted-foreground">
					* Percentual de valores diários (%VD) com base em uma dieta de 2.000 kcal. Passe o mouse sobre o %VD para ver o cálculo.
				</p>
			</CardContent>
		</Card>
	)
}

interface NutrientRowProps {
	nutrient: Nutrient
	value: string
	onChange: Dispatch<SetStateAction<Record<string, string>>>
}

function NutrientRow({ nutrient, value, onChange }: NutrientRowProps) {
	const { label, unit } = parseNutrientName(nutrient.name)
	const numeric = value !== "" ? Number(value) : null
	const hasValue = numeric != null && !Number.isNaN(numeric)
	const dailyValue = nutrient.daily_value ? Number(nutrient.daily_value) : null
	const vd = hasValue && dailyValue && dailyValue > 0 ? (numeric / dailyValue) * 100 : null
	const vdLabel = vd != null ? `${vd < 1 && vd > 0 ? vd.toFixed(1) : Math.round(vd)}%` : "—"

	return (
		<tr className={cn("transition-colors hover:bg-muted/30", nutrient.is_energy_value && "bg-muted/20")}>
			<td className={cn("px-4 py-1.5 text-foreground", nutrient.is_energy_value && "font-semibold")}>{label}</td>
			<td className="px-4 py-1.5">
				<div className="flex items-center justify-end gap-1.5">
					<Input
						id={`nutrient-${nutrient.id}`}
						type="number"
						step="0.001"
						min="0"
						placeholder="—"
						value={value}
						onChange={(e) => onChange((prev) => ({ ...prev, [nutrient.id]: e.target.value }))}
						className="h-8 w-24 text-right text-sm font-mono"
					/>
					{unit && <span className="w-8 text-left text-xs text-muted-foreground">{unit}</span>}
				</div>
			</td>
			<td className="px-4 py-1.5 text-right">
				{vd != null && dailyValue ? (
					<Tooltip>
						<TooltipTrigger
							render={
								<span className="cursor-help font-medium tabular-nums text-foreground underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">
									{vdLabel}
								</span>
							}
						/>
						<TooltipContent>
							<div className="space-y-0.5 text-left">
								<p className="font-medium">
									VD de referência: {formatNumber(dailyValue)} {unit ?? ""}
								</p>
								<p className="opacity-90">
									{formatNumber(numeric ?? 0)} {unit ?? ""} ÷ {formatNumber(dailyValue)} {unit ?? ""} × 100 = {vdLabel}
								</p>
							</div>
						</TooltipContent>
					</Tooltip>
				) : (
					<span className="tabular-nums text-muted-foreground">{vdLabel}</span>
				)}
			</td>
		</tr>
	)
}
