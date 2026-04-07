import { useForm } from "@tanstack/react-form"
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, ChevronsUpDown, Loader2, Save } from "lucide-react"
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react"
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
import { cn } from "@/lib/cn"
import { catmatQueryOptions, ceafaQueryOptions, useNutrients, useProductNutrients, useSetProductNutrients, useUpdateProduct } from "@/services/ProductsService"
import type { Ceafa, Folder, Nutrient, Product } from "@/types/supabase.types"
import { ProductItemsManager } from "./ProductItemsManager"

const productSchema = z.object({
	description: z.string().min(3, "Descrição deve ter no mínimo 3 caracteres"),
	folder_id: z.string().uuid().nullable(),
	measure_unit: z.string().nullable(),
	correction_factor: z.number().nullable(),
	ceafa_id: z.string().uuid().nullable(),
	catmat_item_codigo: z.number().int().positive().nullable(),
	catmat_item_descricao: z.string().nullable(),
})

const MEASURE_UNIT_LABELS: Record<string, string> = {
	UN: "UN (Unidade)",
	KG: "KG (Quilograma)",
	LT: "LT (Litro)",
	G: "G (Grama)",
	ML: "ML (Mililitro)",
}

interface ProductDetailFormProps {
	product: Product
	folders: Folder[]
}

export function ProductDetailForm({ product, folders }: ProductDetailFormProps) {
	const queryClient = useQueryClient()
	const { updateProduct, isUpdating } = useUpdateProduct()
	const { setProductNutrients, isSaving: isSavingNutrients } = useSetProductNutrients()

	const { nutrients } = useNutrients()
	const { productNutrients } = useProductNutrients(product.id)

	const [ceafaOpen, setCeafaOpen] = useState(false)
	const [ceafaSearch, setCeafaSearch] = useState("")
	const [catmatDescricao, setCatmatDescricao] = useState<string | null>(product.catmat_item_descricao ?? null)

	// Load ceafa list reactively via query
	const ceafaList = queryClient.getQueryData<Ceafa[]>(ceafaQueryOptions(ceafaSearch).queryKey) ?? []

	const syncedNutrients = nutrients ?? []

	// Derive initial nutrient values from server data; user edits are tracked via overrides
	const baseNutrientValues = useMemo(() => {
		if (!nutrients || !productNutrients) return {}
		const map = Object.fromEntries(productNutrients.map((pn) => [pn.nutrient_id, pn.nutrient_value]))
		return Object.fromEntries(nutrients.map((n) => [n.id, map[n.id] != null ? String(map[n.id]) : ""]))
	}, [nutrients, productNutrients])

	// Local nutrient state (controlled separately from the main form)
	const [nutrientOverrides, setNutrientOverrides] = useState<Record<string, string>>({})
	const nutrientValues = { ...baseNutrientValues, ...nutrientOverrides }
	const setNutrientValues: Dispatch<SetStateAction<Record<string, string>>> = (action) => {
		setNutrientOverrides((prev) => {
			const base = { ...baseNutrientValues, ...prev }
			return typeof action === "function" ? action(base) : action
		})
	}
	const currentCeafa = product.ceafa_id ? queryClient.getQueryData<Ceafa[]>(ceafaQueryOptions("").queryKey)?.find((c) => c.id === product.ceafa_id) : null

	const form = useForm({
		defaultValues: {
			description: product.description ?? "",
			folder_id: product.folder_id ?? null,
			measure_unit: product.measure_unit ?? "",
			correction_factor: product.correction_factor ? Number(product.correction_factor) : 1.0,
			ceafa_id: product.ceafa_id ?? null,
			catmat_item_codigo: product.catmat_item_codigo ?? null,
			catmat_item_descricao: product.catmat_item_descricao ?? null,
		},
		onSubmit: async ({ value }) => {
			const validation = productSchema.safeParse(value)
			if (!validation.success) {
				toast.error("Preencha os campos obrigatórios corretamente")
				return
			}

			try {
				await updateProduct({ id: product.id, payload: value })

				// Save nutrients
				const nutrientsPayload = syncedNutrients.map((n) => ({
					nutrient_id: n.id,
					nutrient_value: nutrientValues[n.id] !== "" ? Number(nutrientValues[n.id]) : null,
				}))
				await setProductNutrients({ productId: product.id, nutrients: nutrientsPayload })

				await queryClient.invalidateQueries({ queryKey: ["products"] })
				toast.success("Insumo atualizado com sucesso!")
			} catch {
				toast.error("Erro ao atualizar insumo")
			}
		},
	})

	const isPending = isUpdating || isSavingNutrients

	const folder = folders.find((f) => f.id === product.folder_id)

	return (
		<div className="space-y-6 pb-20">
			<PageHeader title={product.description ?? "Insumo"} description={folder?.description ?? undefined} onBack={() => window.history.back()} />

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
													className={cn(buttonVariants({ variant: "outline" }), "w-full justify-between font-normal")}
												>
													<span className="truncate">
														{field.state.value
															? (ceafaList.find((c) => c.id === field.state.value)?.description ?? currentCeafa?.description ?? "CEAFA selecionado")
															: "Buscar alimento CEAFA..."}
													</span>
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</PopoverTrigger>
												<PopoverContent className="w-[400px] p-0" align="start">
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
																		<Check className={cn("mr-2 h-4 w-4", field.state.value === ceafa.id ? "opacity-100" : "opacity-0")} />
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

				{/* Vinculação CATMAT */}
				<Card>
					<CardHeader>
						<CardTitle>CATMAT</CardTitle>
					</CardHeader>
					<CardContent>
						<form.Field name="catmat_item_codigo">
							{(field) => (
								<Field>
									<FieldLabel>Código</FieldLabel>
									<FieldContent>
										<CatmatCombobox
											value={field.state.value as number | null}
											descricao={catmatDescricao}
											onChange={(codigo, descricao) => {
												field.handleChange(codigo as unknown as number)
												form.setFieldValue("catmat_item_descricao", descricao)
												setCatmatDescricao(descricao)
											}}
										/>
										<FieldDescription>
											Consulte também em{" "}
											<a href="https://catalogo.compras.gov.br/cnbs-web/busca" target="_blank" rel="noopener noreferrer">
												catalogo.compras.gov.br
											</a>
										</FieldDescription>
									</FieldContent>
								</Field>
							)}
						</form.Field>
					</CardContent>
				</Card>

				{/* Nutrientes */}
				<NutrientsCard nutrients={syncedNutrients} values={nutrientValues} onChange={setNutrientValues} />

				<div className="flex justify-end gap-4">
					<Button type="button" variant="outline" onClick={() => window.history.back()}>
						Cancelar
					</Button>
					<Button type="submit" disabled={isPending}>
						{isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
						<Save className="w-4 h-4 mr-2" />
						Salvar Insumo
					</Button>
				</div>
			</form>

			{/* Itens de Compra */}
			<div className="max-w-5xl mx-auto">
				<ProductItemsManager productId={product.id} />
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

function NutrientsCard({ nutrients, values, onChange }: NutrientsCardProps) {
	if (nutrients.length === 0) return null

	const energyNutrients = nutrients.filter((n) => n.is_energy_value)
	const regularNutrients = nutrients.filter((n) => !n.is_energy_value)

	return (
		<Card className="max-w-5xl mx-auto">
			<CardHeader>
				<CardTitle>Composição Nutricional</CardTitle>
				<p className="text-sm text-muted-foreground">Valores por 100g do insumo. Deixe em branco para não informar.</p>
			</CardHeader>
			<CardContent className="space-y-6">
				{energyNutrients.length > 0 && (
					<div>
						<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Valores Energéticos</p>
						<NutrientGrid nutrients={energyNutrients} values={values} onChange={onChange} />
					</div>
				)}
				{regularNutrients.length > 0 && (
					<div>
						<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Nutrientes</p>
						<NutrientGrid nutrients={regularNutrients} values={values} onChange={onChange} />
					</div>
				)}
			</CardContent>
		</Card>
	)
}

interface NutrientGridProps {
	nutrients: Nutrient[]
	values: Record<string, string>
	onChange: Dispatch<SetStateAction<Record<string, string>>>
}

function NutrientGrid({ nutrients, values, onChange }: NutrientGridProps) {
	return (
		<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
			{nutrients.map((n) => (
				<div key={n.id} className="space-y-1">
					<label htmlFor={`nutrient-${n.id}`} className="text-xs font-medium text-foreground">
						{n.name}
						{n.daily_value && <span className="text-muted-foreground ml-1">(VD: {n.daily_value})</span>}
					</label>
					<Input
						id={`nutrient-${n.id}`}
						type="number"
						step="0.001"
						min="0"
						placeholder="—"
						value={values[n.id] ?? ""}
						onChange={(e) => onChange((prev) => ({ ...prev, [n.id]: e.target.value }))}
						className="h-8 text-sm font-mono"
					/>
				</div>
			))}
		</div>
	)
}

// ============================================================================
// CatmatCombobox sub-component
// ============================================================================

type CatmatSearchItem = {
	codigo_item: number
	descricao_item: string
	item_sustentavel: boolean | null
}

interface CatmatComboboxProps {
	value: number | null
	descricao: string | null
	onChange: (codigo: number | null, descricao: string | null) => void
}

function CatmatCombobox({ value, descricao, onChange }: CatmatComboboxProps) {
	const [open, setOpen] = useState(false)
	const [inputValue, setInputValue] = useState("")
	const [debouncedSearch, setDebouncedSearch] = useState("")

	// Debounce: 400ms — avoids hammering the server on every keystroke
	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(inputValue.trim()), 400)
		return () => clearTimeout(timer)
	}, [inputValue])

	const minCharsReached = debouncedSearch.length >= 3
	const inputReachesMin = inputValue.trim().length >= 3
	const isTyping = inputReachesMin && inputValue.trim() !== debouncedSearch

	const { data: results = [], isFetching } = useQuery({
		...catmatQueryOptions(debouncedSearch),
		// Keep previous results visible while new search loads — avoids list flash
		placeholderData: keepPreviousData,
	})

	const showLoading = isTyping || (minCharsReached && isFetching)

	function handleOpenChange(next: boolean) {
		setOpen(next)
		if (!next) setInputValue("")
	}

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger
				type="button"
				role="combobox"
				aria-expanded={open}
				className={cn(buttonVariants({ variant: "outline" }), "h-auto min-h-9 w-full justify-between font-normal")}
			>
				{value ? (
					<span className="flex min-w-0 items-center gap-2">
						<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">#{value}</span>
						<span className="truncate text-sm">{descricao ?? "..."}</span>
					</span>
				) : (
					<span className="text-muted-foreground">Vincular código CATMAT...</span>
				)}
				<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
			</PopoverTrigger>

			<PopoverContent className="p-0" style={{ width: "var(--radix-popover-trigger-width)", minWidth: "360px", maxWidth: "700px" }} align="start">
				<Command shouldFilter={false}>
					<CommandInput placeholder="Código (ex: 327430) ou parte da descrição..." value={inputValue} onValueChange={setInputValue} />

					<CommandList className="max-h-[300px]">
						{/* Idle — waiting for 3+ chars */}
						{inputValue.trim().length < 3 && <div className="py-6 text-center text-sm text-muted-foreground">Pesquise o código ou parte da descrição.</div>}

						{/* Loading / debouncing */}
						{inputValue.trim().length >= 3 && showLoading && (
							<div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								Buscando...
							</div>
						)}

						{/* Results */}
						{inputValue.trim().length >= 3 &&
							!showLoading &&
							(results.length === 0 ? (
								<CommandEmpty>Nenhum resultado para "{debouncedSearch}".</CommandEmpty>
							) : (
								<CommandGroup>
									{value && (
										<CommandItem
											value="__CLEAR__"
											onSelect={() => {
												onChange(null, null)
												setOpen(false)
											}}
										>
											<span className="text-sm italic text-muted-foreground">Remover vinculação</span>
										</CommandItem>
									)}

									{(results as CatmatSearchItem[]).map((item) => (
										<CommandItem
											key={item.codigo_item}
											value={String(item.codigo_item)}
											onSelect={() => {
												onChange(item.codigo_item, item.descricao_item)
												setOpen(false)
												setInputValue("")
											}}
											className="flex items-start gap-2"
										>
											<Check className={cn("mt-0.5 h-4 w-4 shrink-0", value === item.codigo_item ? "opacity-100" : "opacity-0")} />
											<span className="shrink-0 font-mono text-xs text-muted-foreground">#{item.codigo_item}</span>
											<span className="flex-1 text-sm leading-snug">{item.descricao_item}</span>
											{item.item_sustentavel && <span className="mt-0.5 shrink-0 rounded bg-success/10 px-1.5 py-0.5 text-xs text-success">Sustentável</span>}
										</CommandItem>
									))}
								</CommandGroup>
							))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}
