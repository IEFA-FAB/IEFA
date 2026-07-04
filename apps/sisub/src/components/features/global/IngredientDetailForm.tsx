import type { Ceafa, Folder, Ingredient, Nutrient } from "@iefa/database/sisub"
import type { NutritionReferenceSummary } from "@iefa/sisub-domain"
import { useForm } from "@tanstack/react-form"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, CalendarCheck, Check, ChevronsUpDown, CircleCheck, History, Loader2, Pencil, RotateCcw, Save } from "lucide-react"
import { type Dispatch, type SetStateAction, useMemo, useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { PageHeader } from "@/components/layout/PageHeader"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/cn"
import { computeIngredientDiff } from "@/lib/ingredient-diff"
import {
	ceafaQueryOptions,
	ingredientLastReviewQueryOptions,
	useIngredientEffectiveNutrients,
	useIngredientVersions,
	useNutrients,
	useRecordIngredientReview,
	useRecordIngredientVersion,
	useRestoreIngredientVersion,
	useSaveIngredientDetails,
} from "@/services/IngredientsService"
import { IngredientHistorySheet } from "./IngredientHistorySheet"
import { IngredientItemsManager } from "./IngredientItemsManager"
import { IngredientVersionPreview } from "./IngredientVersionPreview"
import { NutritionReferenceCombobox } from "./NutritionReferenceCombobox"
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
	const { saveIngredientDetails, isSaving } = useSaveIngredientDetails()
	const { recordIngredientVersion } = useRecordIngredientVersion()
	const { recordIngredientReview, isReviewing } = useRecordIngredientReview()
	const { restoreIngredientVersion, isRestoring } = useRestoreIngredientVersion()
	const { versions, isLoading: versionsLoading } = useIngredientVersions(ingredient.id)
	const { data: lastReview } = useQuery(ingredientLastReviewQueryOptions(ingredient.id))

	const { nutrients } = useNutrients()
	const { effectiveNutrients } = useIngredientEffectiveNutrients(ingredient.id)
	const ingredientNutrients = effectiveNutrients?.nutrients
	const serverNutritionReference = effectiveNutrients?.reference ?? null

	const [ceafaOpen, setCeafaOpen] = useState(false)
	const [ceafaSearch, setCeafaSearch] = useState("")
	const [folderOpen, setFolderOpen] = useState(false)
	const [nutritionReferenceOverride, setNutritionReferenceOverride] = useState<NutritionReferenceSummary | null | undefined>(undefined)
	const nutritionReference = nutritionReferenceOverride !== undefined ? nutritionReferenceOverride : serverNutritionReference
	const nutritionReferenceLocked = nutritionReference != null

	// Caminho hierárquico de cada pasta (ex.: "Hortifruti / Frutas / Cítricas") — usado para
	// exibir a estrutura e permitir busca por qualquer parte do caminho no combobox.
	const folderOptions = useMemo(() => {
		const byId = new Map(folders.map((f) => [f.id, f]))
		const pathOf = (f: Folder): string => {
			const parts: string[] = []
			let cur: Folder | undefined = f
			const seen = new Set<string>()
			while (cur && !seen.has(cur.id)) {
				seen.add(cur.id)
				parts.unshift(cur.description ?? "Sem Nome")
				cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
			}
			return parts.join(" / ")
		}
		return folders.map((f) => ({ id: f.id, name: f.description ?? "Sem Nome", path: pathOf(f) })).sort((a, b) => a.path.localeCompare(b.path, "pt-BR"))
	}, [folders])

	// Histórico de versões (estilo Google Docs)
	const [historyOpen, setHistoryOpen] = useState(false)
	const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
	const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false)

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
				// Só reescreve os nutrientes manuais quando NÃO há tabela vinculada E o usuário
				// realmente editou a tabela. Vincular, ou desvincular sem editar, preserva as
				// linhas manuais antigas (elas voltam a aparecer ao remover o vínculo).
				const userEditedNutrients = Object.keys(nutrientOverrides).length > 0
				const nutrientsPayload =
					!nutritionReference && userEditedNutrients
						? syncedNutrients.map((n) => ({
								nutrient_id: n.id,
								nutrient_value: nutrientValues[n.id] !== "" ? Number(nutrientValues[n.id]) : null,
							}))
						: undefined

				// Salva identificação + nutrientes e registra UMA versão do insumo.
				await saveIngredientDetails({
					id: ingredient.id,
					description: validation.data.description,
					folderId: validation.data.folder_id,
					measureUnit: validation.data.measure_unit,
					correctionFactor: validation.data.correction_factor,
					ceafaId: validation.data.ceafa_id,
					nutritionReferenceFoodRevisionId: nutritionReference?.food_revision_id ?? null,
					nutrients: nutrientsPayload,
				})

				setNutrientOverrides({})
				setNutritionReferenceOverride(undefined)
				await queryClient.invalidateQueries({ queryKey: ["ingredients"] })
				toast.success("Insumo atualizado com sucesso!")
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err)
				toast.error(msg || "Erro ao atualizar insumo")
			}
		},
	})

	const isPending = isSaving

	const folder = folders.find((f) => f.id === ingredient.folder_id)

	// ── Estado derivado do histórico/preview ──────────────────────────────────
	const versionList = versions ?? []
	const selectedIndex = selectedVersionId ? versionList.findIndex((v) => v.id === selectedVersionId) : -1
	const selectedVersion = selectedIndex >= 0 ? versionList[selectedIndex] : null
	const previousVersion = selectedIndex >= 0 ? versionList[selectedIndex + 1] : undefined
	const isPreviewing = selectedVersion != null
	const previewDiff = selectedVersion ? computeIngredientDiff(previousVersion?.snapshot ?? null, selectedVersion.snapshot) : null

	const handleVersionChanged = () => {
		recordIngredientVersion(ingredient.id).catch(() => {
			/* registro de versão é best-effort — não bloqueia o fluxo do usuário */
		})
	}

	const confirmRestore = async () => {
		if (!selectedVersion) return
		try {
			await restoreIngredientVersion({ ingredientId: ingredient.id, versionId: selectedVersion.id })
			const snap = selectedVersion.snapshot.ingredient
			form.reset({
				description: snap.description ?? "",
				folder_id: snap.folder_id ?? null,
				measure_unit: snap.measure_unit ?? "",
				correction_factor: snap.correction_factor ?? 1.0,
				ceafa_id: snap.ceafa_id ?? null,
			})
			setNutrientOverrides({})
			setNutritionReferenceOverride(undefined)
			await queryClient.invalidateQueries({ queryKey: ["ingredients"] })
			toast.success(`Insumo restaurado para a versão v${selectedVersion.version_number}`)
			setRestoreConfirmOpen(false)
			setSelectedVersionId(null)
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			toast.error(msg || "Erro ao restaurar versão")
		}
	}

	const formatVersionStamp = (dateStr: string) =>
		new Date(dateStr).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

	// Registra um evento de revisão (conferência) — confirma que o insumo foi conferido.
	const handleReview = async () => {
		try {
			await recordIngredientReview(ingredient.id)
			toast.success("Revisão registrada")
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			toast.error(msg || "Erro ao registrar revisão")
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title={
					isPreviewing ? (
						<span className="text-heading leading-tight text-foreground">{selectedVersion?.snapshot.ingredient.description ?? "Insumo"}</span>
					) : (
						<form.Field name="description">
							{(field) => (
								<span className="group/title inline-flex max-w-full items-center gap-1.5">
									<input
										aria-label="Nome do insumo"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="Nome do insumo"
										className={cn(
											"text-heading leading-tight text-foreground bg-transparent",
											"field-sizing-content min-w-[10ch] max-w-full",
											"-mx-2 rounded-md px-2 py-0.5",
											"outline-none transition-colors hover:bg-muted/60 focus:bg-muted/60",
											"focus-visible:ring-[3px] focus-visible:ring-ring/50 placeholder:text-muted-foreground/60"
										)}
									/>
									<Pencil className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100 group-focus-within/title:opacity-100" />
								</span>
							)}
						</form.Field>
					)
				}
				description={folder?.description ?? undefined}
				onBack={() => window.history.back()}
			>
				<Button type="button" variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="gap-1.5">
					<History className="size-4" />
					Histórico
					{versionList.length > 0 && <span className="text-xs text-muted-foreground">({versionList.length})</span>}
				</Button>
				<Tooltip>
					<TooltipTrigger
						render={
							<Button type="button" variant="outline" size="sm" onClick={handleReview} disabled={isReviewing} className="gap-1.5">
								{isReviewing ? <Loader2 className="size-4 animate-spin" /> : <CircleCheck className="size-4" />}
								Revisado
							</Button>
						}
					/>
					<TooltipContent>Registrar conferência deste insumo (revisão pelos nutricionistas)</TooltipContent>
				</Tooltip>
			</PageHeader>

			{/* Status de revisão (conferência pelos nutricionistas) */}
			{!isPreviewing && (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<CalendarCheck className="size-4 shrink-0" />
					{lastReview ? (
						<span>
							Última revisão em <strong className="font-medium text-foreground">{formatVersionStamp(lastReview.reviewed_at)}</strong>
							{lastReview.reviewed_by_name ? ` por ${lastReview.reviewed_by_name}` : ""}
						</span>
					) : (
						<span>Este insumo ainda não foi revisado.</span>
					)}
				</div>
			)}

			{/* Banner de preview de versão histórica */}
			{isPreviewing && selectedVersion && (
				<div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-2 text-sm">
						<History className="size-4 shrink-0 text-amber-700 dark:text-amber-400" />
						<span className="text-amber-900 dark:text-amber-200">
							Visualizando <strong>v{selectedVersion.version_number}</strong> de {formatVersionStamp(selectedVersion.created_at)} por{" "}
							{selectedVersion.changed_by_name ?? "autor desconhecido"}
						</span>
					</div>
					<div className="flex shrink-0 gap-2">
						<Button type="button" variant="ghost" size="sm" onClick={() => setSelectedVersionId(null)} className="gap-1.5">
							<ArrowLeft className="size-4" />
							Voltar ao atual
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setRestoreConfirmOpen(true)}
							disabled={isRestoring || selectedIndex === 0}
							className="gap-1.5"
						>
							{isRestoring ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
							Restaurar esta versão
						</Button>
					</div>
				</div>
			)}

			{selectedVersion && previewDiff ? (
				<IngredientVersionPreview snapshot={selectedVersion.snapshot} diff={previewDiff} isBaseline={!previousVersion} />
			) : (
				<>
					<div className="max-w-5xl mx-auto space-y-8 pb-24">
						{/* Escopo do form: identificação + informação nutricional (salvos juntos pela barra inferior) */}
						<form
							id="ingredient-form"
							onSubmit={(e) => {
								e.preventDefault()
								e.stopPropagation()
								form.handleSubmit()
							}}
							className="space-y-6"
						>
							{/* Classificação e medida — o nome do insumo é editado no título da página */}
							<Card>
								<CardHeader>
									<CardTitle>Classificação e medida</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
										<form.Field name="measure_unit">
											{(field) => (
												<Field>
													<FieldLabel>Unidade de Medida</FieldLabel>
													<FieldContent>
														<Select value={field.state.value ?? "__NONE__"} onValueChange={(v) => field.handleChange(v === "__NONE__" || v == null ? "" : v)}>
															<SelectTrigger>
																<SelectValue placeholder="Selecione">
																	{field.state.value && field.state.value !== "__NONE__"
																		? (MEASURE_UNIT_LABELS[field.state.value] ?? field.state.value)
																		: undefined}
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
														<FieldDescription>Como o insumo é quantificado em receitas e planejamento.</FieldDescription>
													</FieldContent>
												</Field>
											)}
										</form.Field>

										<form.Field name="folder_id">
											{(field) => {
												const selected = field.state.value ? folderOptions.find((f) => f.id === field.state.value) : null
												return (
													<Field>
														<FieldLabel>Pasta (Categoria)</FieldLabel>
														<FieldContent>
															<Popover open={folderOpen} onOpenChange={setFolderOpen}>
																<PopoverTrigger
																	type="button"
																	role="combobox"
																	aria-expanded={folderOpen}
																	aria-controls="folder-combobox-popup"
																	className={cn(buttonVariants({ variant: "outline" }), "w-full justify-between font-normal")}
																>
																	<span className="truncate">{selected ? selected.path : "Selecione uma pasta..."}</span>
																	<ChevronsUpDown className="ml-2 size-4 shrink-0 text-muted-foreground" />
																</PopoverTrigger>
																<PopoverContent id="folder-combobox-popup" className="w-[400px] p-0" align="start">
																	<Command>
																		<CommandInput placeholder="Pesquisar pasta..." />
																		<CommandList>
																			<CommandEmpty>Nenhuma pasta encontrada.</CommandEmpty>
																			<CommandGroup>
																				<CommandItem
																					value="__NONE__ sem pasta"
																					onSelect={() => {
																						field.handleChange(null as unknown as string)
																						setFolderOpen(false)
																					}}
																				>
																					<Check className={cn("mr-2 size-4", field.state.value ? "opacity-0" : "opacity-100")} />
																					<span className="text-muted-foreground italic">Sem pasta</span>
																				</CommandItem>
																				{folderOptions.map((f) => {
																					const isSelected = field.state.value === f.id
																					return (
																						<CommandItem
																							key={f.id}
																							value={`${f.path} ${f.id}`}
																							onSelect={() => {
																								field.handleChange(f.id)
																								setFolderOpen(false)
																							}}
																							className={cn(isSelected && "font-medium text-accent-foreground")}
																						>
																							<Check className={cn("mr-2 size-4 shrink-0 text-accent-foreground", isSelected ? "opacity-100" : "opacity-0")} />
																							<span className="truncate">{f.path}</span>
																						</CommandItem>
																					)
																				})}
																			</CommandGroup>
																		</CommandList>
																	</Command>
																</PopoverContent>
															</Popover>
														</FieldContent>
													</Field>
												)
											}}
										</form.Field>
									</div>

									<form.Field name="correction_factor">
										{(field) => (
											<Field orientation="horizontal" className="border-t border-border/60 pt-4">
												<FieldContent>
													<FieldLabel htmlFor="correction_factor">Fator de Correção (FC)</FieldLabel>
													<FieldDescription>
														Parâmetro avançado do insumo genérico (padrão: 1.0). Itens de compra e produto têm fatores próprios.
													</FieldDescription>
												</FieldContent>
												<Input
													id="correction_factor"
													type="number"
													step="0.0001"
													value={field.state.value ?? ""}
													onChange={(e) => field.handleChange(Number(e.target.value))}
													placeholder="1.0000"
													className="w-28 shrink-0"
												/>
											</Field>
										)}
									</form.Field>
								</CardContent>
							</Card>

							{/* Informação Nutricional — CEAFA (alimento de referência) + tabela por 100 g */}
							<Card>
								<CardHeader>
									<CardTitle>Informação Nutricional</CardTitle>
									<CardDescription>
										Valores por 100 g do insumo. O %VD é calculado sobre os valores diários de referência. Deixe em branco para não informar.
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-5">
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
																				className={cn(field.state.value === ceafa.id && "font-medium text-accent-foreground")}
																			>
																				<Check
																					className={cn("mr-2 size-4 text-accent-foreground", field.state.value === ceafa.id ? "opacity-100" : "opacity-0")}
																				/>
																				<span className="truncate">{ceafa.description}</span>
																				<span className="ml-auto text-xs text-muted-foreground shrink-0">{ceafa.quantity}g</span>
																			</CommandItem>
																		))}
																	</CommandGroup>
																</CommandList>
															</Command>
														</PopoverContent>
													</Popover>
													<FieldDescription>Alimento de referência da base CEAFA usado para validar e comparar os valores nutricionais.</FieldDescription>
												</FieldContent>
											</Field>
										)}
									</form.Field>

									<Field>
										<FieldLabel>Tabela alimentar</FieldLabel>
										<FieldContent>
											<NutritionReferenceCombobox value={nutritionReference} onChange={setNutritionReferenceOverride} />
											<FieldDescription>
												Sem vínculo, os dados nutricionais são informados manualmente. Com vínculo, os valores vêm da tabela selecionada.
											</FieldDescription>
										</FieldContent>
									</Field>

									<NutrientsTable
										nutrients={syncedNutrients}
										values={nutrientValues}
										onChange={setNutrientValues}
										readOnly={nutritionReferenceLocked}
										reference={nutritionReference}
									/>
								</CardContent>
							</Card>
						</form>

						{/* Itens de Compra (purchase_item + CATMAT) — persistidos separadamente */}
						<PurchaseItemsManager ingredientId={ingredient.id} onChanged={handleVersionChanged} />

						{/* Itens de Produto (ingredient_item — estoque/GS1, vinculado a 1 item de compra) — persistidos separadamente */}
						<IngredientItemsManager ingredientId={ingredient.id} onChanged={handleVersionChanged} />
					</div>

					{/* Barra de ação do form — sempre acessível, escopo explícito */}
					<div className="sticky bottom-0 z-10 -mx-3 border-t border-border bg-background px-3 py-3 sm:-mx-6 sm:px-6">
						<div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<p className="text-caption text-muted-foreground">
								Salva identificação e informação nutricional. Itens de compra e produto são salvos separadamente.
							</p>
							<div className="flex justify-end gap-2">
								<Button type="button" variant="outline" onClick={() => window.history.back()}>
									Cancelar
								</Button>
								<Button type="submit" form="ingredient-form" disabled={isPending}>
									{isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
									Salvar Insumo
								</Button>
							</div>
						</div>
					</div>
				</>
			)}

			<IngredientHistorySheet
				open={historyOpen}
				onOpenChange={setHistoryOpen}
				versions={versions}
				isLoading={versionsLoading}
				selectedVersionId={selectedVersionId}
				onSelect={(id) => {
					setSelectedVersionId(id)
					if (id) setHistoryOpen(false)
				}}
			/>

			{/* Confirmação de restauração — dialog da aplicação (nunca window.confirm) */}
			<AlertDialog open={restoreConfirmOpen} onOpenChange={(open) => !open && setRestoreConfirmOpen(false)}>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Restaurar versão</AlertDialogTitle>
						<AlertDialogDescription>
							{selectedVersion ? (
								<>
									Restaurar o insumo para a versão <strong>v{selectedVersion.version_number}</strong> de {formatVersionStamp(selectedVersion.created_at)}? O
									estado atual será substituído — e mantido no histórico como uma nova versão.
								</>
							) : (
								"Restaurar o insumo para a versão selecionada?"
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isRestoring}>Cancelar</AlertDialogCancel>
						<AlertDialogAction onClick={confirmRestore} disabled={isRestoring}>
							{isRestoring ? <Loader2 className="size-4 mr-2 animate-spin" /> : <RotateCcw className="size-4 mr-2" />}
							Restaurar
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

// ============================================================================
// Nutrients sub-component
// ============================================================================

interface NutrientsTableProps {
	nutrients: Nutrient[]
	values: Record<string, string>
	onChange: Dispatch<SetStateAction<Record<string, string>>>
	readOnly?: boolean
	reference?: NutritionReferenceSummary | null
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

function NutrientsTable({ nutrients, values, onChange, readOnly = false, reference = null }: NutrientsTableProps) {
	if (nutrients.length === 0) {
		return <p className="text-caption text-muted-foreground">Nenhum nutriente configurado no sistema.</p>
	}

	// Ordena como num rótulo nutricional brasileiro: valor energético primeiro, depois display_order.
	const ordered = nutrients.toSorted((a, b) => {
		if (a.is_energy_value !== b.is_energy_value) return a.is_energy_value ? -1 : 1
		return (a.display_order ?? 999) - (b.display_order ?? 999)
	})

	return (
		<div>
			<div className="overflow-hidden rounded-lg">
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
							<NutrientRow key={n.id} nutrient={n} value={values[n.id] ?? ""} onChange={onChange} readOnly={readOnly} />
						))}
					</tbody>
				</table>
			</div>
			<p className="mt-3 text-caption text-muted-foreground">
				{reference
					? `Fonte: ${reference.source_name} ${reference.version_label}, ${reference.display_name}.`
					: "* Percentual de valores diários (%VD) com base em uma dieta de 2.000 kcal. Passe o mouse sobre o %VD para ver o cálculo."}
			</p>
		</div>
	)
}

interface NutrientRowProps {
	nutrient: Nutrient
	value: string
	onChange: Dispatch<SetStateAction<Record<string, string>>>
	readOnly?: boolean
}

function NutrientRow({ nutrient, value, onChange, readOnly = false }: NutrientRowProps) {
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
						disabled={readOnly}
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
