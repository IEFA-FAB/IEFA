import type { ProcurementNeed } from "@iefa/sisub-domain/types"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { AlertTriangle, ArrowLeft, ArrowRight, Calculator, CheckCircle2, Download, Save, Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { AtaItemsTable } from "@/components/features/local/ata/AtaItemsTable"
import { type AtaStep, AtaStepIndicator } from "@/components/features/local/ata/AtaStepIndicator"
import { DraftImportBadge } from "@/components/features/local/ata/DraftImportBadge"
import { KitchenTemplateSection } from "@/components/features/local/ata/KitchenTemplateSection"
import { PriceResearchModal } from "@/components/features/local/price-research/PriceResearchModal"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useAtaDraft, useCalculateAtaNeeds, useCreateAtaDraft, useFinalizeAtaDraft, useSaveAtaDraftItems, useUpdateAtaDraft } from "@/hooks/data/useAta"
import { useBulkPriceResearch } from "@/hooks/data/useBulkPriceResearch"
import { usePendingDraft } from "@/hooks/data/useKitchenDraft"
import { useMenuTemplates } from "@/hooks/data/useTemplates"
import { ataItemToNeed } from "@/lib/ata-utils"
import { fetchUnitKitchensFn } from "@/server/unit-kitchens.fn"
import type { AtaWizardState, KitchenSelectionState, TemplateSelection } from "@/types/domain/ata"

const searchSchema = z.object({
	step: z.coerce.number().min(1).max(4).optional().default(1),
	draft: z.string().uuid().optional(),
})

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/procurement/new")({
	validateSearch: searchSchema,
	beforeLoad: (opts) => requirePermission(opts, "unit", 2),
	component: NewAtaPage,
	head: () => ({
		meta: [{ title: "Nova Ata de Registro de Preços" }],
	}),
})

// ─── Hook para cozinhas da unidade ────────────────────────────────────────────

function useUnitKitchens(unitId: number | null) {
	return useQuery({
		queryKey: ["unit_kitchens", unitId],
		queryFn: () => fetchUnitKitchensFn({ data: { unitId: unitId as number } }),
		enabled: unitId !== null,
		staleTime: 10 * 60 * 1000,
	})
}

// ─── Seção de uma cozinha com rascunho ────────────────────────────────────────

function KitchenStepSection({
	kitchenState,
	selectionType,
	onUpdateSelection,
}: {
	kitchenState: KitchenSelectionState
	selectionType: "templateSelections" | "eventSelections"
	onUpdateSelection: (kitchenId: number, type: "templateSelections" | "eventSelections", selections: TemplateSelection[]) => void
}) {
	const { data: templates, isLoading } = useMenuTemplates(kitchenState.kitchenId)
	const { data: pendingDraft } = usePendingDraft(kitchenState.kitchenId)

	// Step "Cardápios Semanais" = weekly; Step "Eventos / Refeições Especiais" = event + exception.
	const filteredTemplates =
		templates?.filter((t) => {
			if (t.kitchen_id === null) return false
			const type = (t as typeof t & { template_type?: string }).template_type
			if (selectionType === "templateSelections") return type === "weekly" || !type
			return type === "event" || type === "exception"
		}) || []

	const handleImport = (_kitchenId: number, templateSels: TemplateSelection[], eventSels: TemplateSelection[]) => {
		onUpdateSelection(kitchenState.kitchenId, "templateSelections", templateSels)
		onUpdateSelection(kitchenState.kitchenId, "eventSelections", eventSels)
	}

	return (
		<div className="space-y-3">
			{pendingDraft && selectionType === "templateSelections" && <DraftImportBadge draft={pendingDraft} kitchenState={kitchenState} onImport={handleImport} />}
			<KitchenTemplateSection
				kitchenState={kitchenState}
				templates={filteredTemplates}
				isLoadingTemplates={isLoading}
				selectionType={selectionType}
				onUpdateSelection={onUpdateSelection}
			/>
		</div>
	)
}

// ─── Página principal do wizard ───────────────────────────────────────────────

function NewAtaPage() {
	const { unitId: unitIdStr } = useParams({ strict: false })
	const unitId = Number(unitIdStr)
	const navigate = useNavigate()
	const { step, draft: draftId } = useSearch({ from: "/_protected/_modules/unit/$unitId/procurement/new" })
	const currentStep = ((step as number) || 1) as AtaStep

	const { data: kitchens, isLoading: isLoadingKitchens } = useUnitKitchens(unitId)
	const { data: existingDraft, isLoading: isLoadingDraft } = useAtaDraft(draftId ?? null)

	const { mutate: createDraft, isPending: isCreatingDraft } = useCreateAtaDraft()
	const { mutate: updateDraft } = useUpdateAtaDraft()
	const { mutate: saveDraftItems, mutateAsync: saveDraftItemsAsync } = useSaveAtaDraftItems()
	const { mutate: finalizeDraft, isPending: isFinalizing } = useFinalizeAtaDraft()
	const { mutateAsync: calculateNeedsAsync, isPending: isCalculating } = useCalculateAtaNeeds()

	const draftCreatedRef = useRef(false)
	const draftRestoredRef = useRef(false)
	const descriptionSaveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

	useEffect(() => () => clearTimeout(descriptionSaveTimerRef.current), [])

	const [wizardState, setWizardState] = useState<AtaWizardState>({
		title: "",
		notes: "",
		kitchenSelections: [],
	})

	const [savedItems, setSavedItems] = useState<ProcurementNeed[]>([])
	const [priceResearchItem, setPriceResearchItem] = useState<ProcurementNeed | null>(null)
	const [priceOverrides, setPriceOverrides] = useState<Record<string, { price: number; researchId: string | null; researchItemId: string | null }>>({})
	const [descriptionOverrides, setDescriptionOverrides] = useState<Record<string, string>>({})

	// Criar draft se ainda não existe
	useEffect(() => {
		if (draftId || draftCreatedRef.current || isLoadingKitchens) return
		draftCreatedRef.current = true
		createDraft(unitId, {
			onSuccess: ({ id }) => {
				navigate({
					to: "/unit/$unitId/procurement/new",
					params: { unitId: unitIdStr as string },
					search: { step: 1, draft: id },
					replace: true,
				})
			},
		})
	}, [draftId, isLoadingKitchens, unitId, unitIdStr, navigate, createDraft])

	// Restaurar estado do wizard a partir do draft existente (one-time)
	useEffect(() => {
		if (!existingDraft || draftRestoredRef.current) return
		draftRestoredRef.current = true

		setWizardState({
			title: existingDraft.title === "Sem nome" ? "" : existingDraft.title,
			notes: existingDraft.notes || "",
			kitchenSelections: [],
		})

		if (existingDraft.kitchens?.length) {
			const restored: KitchenSelectionState[] = existingDraft.kitchens.map((k) => {
				const kWithDetails = k as typeof k & { kitchen?: { display_name?: string | null } }
				return {
					kitchenId: k.kitchen_id,
					kitchenName: kWithDetails.kitchen?.display_name || `Cozinha ${k.kitchen_id}`,
					deliveryNotes: k.delivery_notes || "",
					templateSelections: k.selections
						.filter((s) => {
							const sw = s as typeof s & { template?: { template_type?: string } }
							return sw.template?.template_type === "weekly" || !sw.template?.template_type
						})
						.map((s) => {
							const sw = s as typeof s & { template?: { name?: string | null } }
							return { templateId: s.template_id, templateName: sw.template?.name || "", repetitions: s.repetitions }
						}),
					eventSelections: k.selections
						.filter((s) => {
							const sw = s as typeof s & { template?: { template_type?: string } }
							return sw.template?.template_type === "event" || sw.template?.template_type === "exception"
						})
						.map((s) => {
							const sw = s as typeof s & { template?: { name?: string | null } }
							return { templateId: s.template_id, templateName: sw.template?.name || "", repetitions: s.repetitions }
						}),
				}
			})
			setWizardState((prev) => ({ ...prev, kitchenSelections: restored }))
		}

		const restoredStep = existingDraft.wizard_step
		if (restoredStep && restoredStep !== currentStep) {
			navigate({
				to: "/unit/$unitId/procurement/new",
				params: { unitId: unitIdStr as string },
				search: { step: restoredStep, draft: existingDraft.id },
				replace: true,
			})
		}
	}, [existingDraft, currentStep, unitIdStr, navigate])

	// Sincronizar savedItems com o banco sempre que existingDraft.items mudar — garante que
	// preços pesquisados persistem quando dados do cache ficam obsoletos entre sessões.
	// TanStack Query usa structural sharing, então esse efeito só roda quando os dados realmente mudam.
	useEffect(() => {
		if (!existingDraft?.items?.length) return
		setSavedItems(existingDraft.items.map(ataItemToNeed))
	}, [existingDraft?.items])

	// Merge de kitchenSelections com cozinhas carregadas
	const kitchenSelections: KitchenSelectionState[] =
		kitchens?.map((k) => {
			const existing = wizardState.kitchenSelections.find((ks) => ks.kitchenId === k.id)
			return (
				existing || {
					kitchenId: k.id,
					kitchenName: k.display_name || `Cozinha ${k.id}`,
					deliveryNotes: "",
					templateSelections: [],
					eventSelections: [],
				}
			)
		}) || []

	const handleUpdateSelection = (kitchenId: number, type: "templateSelections" | "eventSelections", selections: TemplateSelection[]) => {
		setWizardState((prev) => {
			const exists = prev.kitchenSelections.some((ks) => ks.kitchenId === kitchenId)
			const kitchenName = kitchens?.find((k) => k.id === kitchenId)?.display_name || `Cozinha ${kitchenId}`
			if (exists) {
				return {
					...prev,
					kitchenSelections: prev.kitchenSelections.map((ks) => (ks.kitchenId === kitchenId ? { ...ks, [type]: selections } : ks)),
				}
			}
			return {
				...prev,
				kitchenSelections: [
					...prev.kitchenSelections,
					{
						kitchenId,
						kitchenName,
						deliveryNotes: "",
						templateSelections: type === "templateSelections" ? selections : [],
						eventSelections: type === "eventSelections" ? selections : [],
					},
				],
			}
		})
	}

	const rawItems: ProcurementNeed[] = useMemo(
		() =>
			savedItems.map((item) => ({
				...item,
				item_description: item.ingredient_id in descriptionOverrides ? (descriptionOverrides[item.ingredient_id] ?? null) : (item.item_description ?? null),
			})),
		[savedItems, descriptionOverrides]
	)

	const {
		start: runBulkResearch,
		progress: bulkProgress,
		eligibleCount: bulkEligibleCount,
	} = useBulkPriceResearch(rawItems, draftId ?? undefined, (result) => {
		setPriceOverrides((prev) => ({
			...prev,
			[result.ingredientId]: {
				price: result.price,
				researchId: result.auditIds?.researchId ?? null,
				researchItemId: result.auditIds?.researchItemId ?? null,
			},
		}))
	})

	const handleBulkResearch = async () => {
		const results = await runBulkResearch()
		if (results.length === 0 || !draftId) return
		// Compute merged overrides from results (can't read stale priceOverrides state here)
		const mergedOverrides = { ...priceOverrides }
		for (const r of results) {
			mergedOverrides[r.ingredientId] = {
				price: r.price,
				researchId: r.auditIds?.researchId ?? null,
				researchItemId: r.auditIds?.researchItemId ?? null,
			}
		}
		const updatedItems = rawItems.map((item) => ({
			...item,
			unit_price: item.ingredient_id in mergedOverrides ? mergedOverrides[item.ingredient_id].price : item.unit_price,
		}))
		const researchLinks = Object.entries(mergedOverrides)
			.filter(([, v]) => v.researchId && v.researchItemId)
			.map(([ingredientId, v]) => ({ ingredientId, researchId: v.researchId as string, researchItemId: v.researchItemId as string }))
		saveDraftItems({ draftId, items: updatedItems, researchLinks })
	}
	const handleDescriptionChange = (ingredientId: string, _ataItemId: string | null | undefined, description: string) => {
		const nextOverrides = { ...descriptionOverrides, [ingredientId]: description }
		setDescriptionOverrides(nextOverrides)
		if (!draftId) return
		// Debounce: evita mutação por keystroke — captura closure dos valores atuais na última chamada
		clearTimeout(descriptionSaveTimerRef.current)
		descriptionSaveTimerRef.current = setTimeout(() => {
			const researchLinks = Object.entries(priceOverrides)
				.filter(([, v]) => v.researchId && v.researchItemId)
				.map(([ingId, v]) => ({ ingredientId: ingId, researchId: v.researchId as string, researchItemId: v.researchItemId as string }))
			const updatedItems = savedItems.map((item) => ({
				...item,
				item_description: item.ingredient_id in nextOverrides ? (nextOverrides[item.ingredient_id] ?? null) : (item.item_description ?? null),
				unit_price: item.ingredient_id in priceOverrides ? priceOverrides[item.ingredient_id].price : item.unit_price,
			}))
			saveDraftItems({ draftId: draftId as string, items: updatedItems, researchLinks })
		}, 800)
	}

	const displayItems: ProcurementNeed[] = rawItems.map((item) => ({
		...item,
		unit_price: item.ingredient_id in priceOverrides ? priceOverrides[item.ingredient_id].price : item.unit_price,
	}))

	const goToStep = (s: number, saveCurrent = false) => {
		if (saveCurrent && draftId) {
			updateDraft({
				draftId,
				kitchenSelections,
				wizardStep: s,
				title: wizardState.title || undefined,
				notes: wizardState.notes || undefined,
			})
		}
		navigate({
			to: "/unit/$unitId/procurement/new",
			params: { unitId: unitIdStr as string },
			search: { step: s, draft: draftId },
		})
	}

	const handleCalculate = async () => {
		const stateToCalc: AtaWizardState = { ...wizardState, kitchenSelections }
		let needs: ProcurementNeed[]
		try {
			needs = (await calculateNeedsAsync(stateToCalc)) as ProcurementNeed[]
		} catch {
			return // error toast handled by useCalculateAtaNeeds
		}
		if (draftId) {
			try {
				const result = await saveDraftItemsAsync({ draftId, items: needs })
				const idMap = new Map(result.savedIds.map((s) => [s.ingredientId, s.ataItemId]))
				setSavedItems(needs.map((item) => ({ ...item, ata_item_id: idMap.get(item.ingredient_id) ?? null })))
			} catch {
				setSavedItems(needs) // fallback: proceed without ata_item_id
			}
		} else {
			setSavedItems(needs)
		}
		goToStep(4)
	}

	const handleSave = () => {
		if (!draftId) return
		const researchLinks = Object.entries(priceOverrides)
			.filter(([, v]) => v.researchId && v.researchItemId)
			.map(([ingredientId, v]) => ({
				ingredientId,
				researchId: v.researchId as string,
				researchItemId: v.researchItemId as string,
			}))
		finalizeDraft(
			{ draftId, title: wizardState.title, notes: wizardState.notes || undefined, items: displayItems, researchLinks },
			{
				onSuccess: (ata) => {
					navigate({
						to: "/unit/$unitId/procurement/$ataId",
						params: { unitId: unitIdStr as string, ataId: ata.id },
					})
				},
			}
		)
	}

	const handleExportCSV = () => {
		const headers = ["Categoria", "CATMAT", "Descrição CATMAT", "Descrição Adicional", "Produto", "Quantidade", "Unidade", "Preço Un.", "Total Est."]
		const rows = displayItems.map((item) => [
			item.folder_description || "Sem categoria",
			item.catmat_item_codigo?.toString() || "",
			item.catmat_item_descricao || "",
			item.item_description || "",
			item.ingredient_name,
			item.total_quantity.toFixed(4),
			item.measure_unit || "UN",
			item.unit_price !== null ? item.unit_price.toFixed(4) : "",
			item.unit_price !== null ? (item.total_quantity * item.unit_price).toFixed(2) : "",
		])
		const csv = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n")
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
		const link = document.createElement("a")
		link.href = URL.createObjectURL(blob)
		link.download = `ata-${wizardState.title || "suprimentos"}-${new Date().toISOString().split("T")[0]}.csv`
		link.click()
	}

	const hasAnySelection = kitchenSelections.some((ks) => ks.templateSelections.length > 0 || ks.eventSelections.length > 0)

	if (isLoadingKitchens || (draftId && isLoadingDraft) || isCreatingDraft) {
		return (
			<div className="space-y-6">
				<div className="h-16 animate-pulse rounded bg-muted" aria-hidden="true" />
				<div className="h-48 animate-pulse rounded bg-muted" aria-hidden="true" />
			</div>
		)
	}

	return (
		<div className="space-y-6">
			<PageHeader title="Nova Ata de Registro de Preços" description="Configure os templates e calcule os quantitativos de aquisição." />

			{/* Indicador de steps */}
			<div className="flex items-center justify-center py-2">
				<AtaStepIndicator currentStep={currentStep} />
			</div>

			{/* ── Step 1: Cardápios Semanais ─────────────────────────────────── */}
			{currentStep === 1 && (
				<div className="space-y-4">
					<p className="text-sm text-muted-foreground">Selecione os cardápios semanais para cada cozinha e defina o número de repetições.</p>
					{kitchenSelections.length === 0 ? (
						<Card>
							<CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma cozinha associada a esta unidade.</CardContent>
						</Card>
					) : (
						<div className="space-y-4">
							{kitchenSelections.map((ks) => (
								<KitchenStepSection key={ks.kitchenId} kitchenState={ks} selectionType="templateSelections" onUpdateSelection={handleUpdateSelection} />
							))}
						</div>
					)}
					<div className="flex justify-end pt-2">
						<Button onClick={() => goToStep(2, true)} className="gap-2">
							Próximo: Eventos
							<ArrowRight className="size-4" aria-hidden="true" />
						</Button>
					</div>
				</div>
			)}

			{/* ── Step 2: Eventos ────────────────────────────────────────────── */}
			{currentStep === 2 && (
				<div className="space-y-4">
					<p className="text-sm text-muted-foreground">Selecione eventos e refeições especiais para cada cozinha.</p>
					{kitchenSelections.length === 0 ? (
						<Card>
							<CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma cozinha associada a esta unidade.</CardContent>
						</Card>
					) : (
						<div className="space-y-4">
							{kitchenSelections.map((ks) => (
								<KitchenStepSection key={ks.kitchenId} kitchenState={ks} selectionType="eventSelections" onUpdateSelection={handleUpdateSelection} />
							))}
						</div>
					)}
					<div className="flex justify-between pt-2">
						<Button variant="outline" onClick={() => goToStep(1, true)} className="gap-2">
							<ArrowLeft className="size-4" aria-hidden="true" />
							Cardápios
						</Button>
						<Button onClick={() => goToStep(3, true)} className="gap-2">
							Próximo: Resumo
							<ArrowRight className="size-4" aria-hidden="true" />
						</Button>
					</div>
				</div>
			)}

			{/* ── Step 3: Resumo e geração ────────────────────────────────────── */}
			{currentStep === 3 && (
				<div className="space-y-6">
					{/* Metadados da Ata */}
					<Card>
						<CardContent className="pt-6">
							<div className="space-y-4">
								<FieldGroup>
									<Field>
										<FieldLabel htmlFor="ata-title">Título da Ata *</FieldLabel>
										<Input
											id="ata-title"
											value={wizardState.title}
											onChange={(e) => setWizardState((prev) => ({ ...prev, title: e.target.value }))}
											placeholder="Ex: Ata de Registro de Preços nº 001/2026"
											required
										/>
									</Field>
								</FieldGroup>
								<FieldGroup>
									<Field>
										<FieldLabel htmlFor="ata-notes">Observações</FieldLabel>
										<Textarea
											id="ata-notes"
											value={wizardState.notes}
											onChange={(e) => setWizardState((prev) => ({ ...prev, notes: e.target.value }))}
											placeholder="Informações adicionais para o pregão..."
											rows={3}
										/>
									</Field>
								</FieldGroup>
							</div>
						</CardContent>
					</Card>

					{/* Resumo de seleções */}
					{hasAnySelection && (
						<Card>
							<CardContent className="pt-6">
								<p className="text-subheading mb-3">Seleções por cozinha:</p>
								<div className="space-y-3">
									{kitchenSelections.map((ks) => {
										const total = [...ks.templateSelections, ...ks.eventSelections]
										return (
											<div key={ks.kitchenId}>
												<p className="text-subheading">{ks.kitchenName}</p>
												{total.length === 0 ? (
													<p className="text-xs text-muted-foreground">Nenhuma seleção</p>
												) : (
													<p className="text-xs text-muted-foreground">{total.map((s) => `${s.templateName} × ${s.repetitions}`).join(", ")}</p>
												)}
											</div>
										)
									})}
								</div>
							</CardContent>
						</Card>
					)}

					{/* Calcular */}
					<div className="flex items-center justify-between pt-2">
						<Button variant="outline" onClick={() => goToStep(2)} className="gap-2">
							<ArrowLeft className="size-4" aria-hidden="true" />
							Eventos
						</Button>
						<Button size="lg" onClick={handleCalculate} disabled={!hasAnySelection || isCalculating} className="gap-2">
							<Calculator className="size-5" aria-hidden="true" />
							{isCalculating ? "Calculando..." : "Calcular Lista"}
						</Button>
					</div>
				</div>
			)}

			{/* ── Step 4: Revisão dos Itens de Compra ────────────────────── */}
			{currentStep === 4 &&
				(() => {
					const matchedCount = displayItems.filter((i) => i.purchase_item_id !== null).length
					const unmatchedItems = displayItems.filter((i) => i.purchase_item_id === null)
					return (
						<div className="space-y-6">
							{/* Resumo de mapeamento */}
							<div className="flex items-center gap-3 flex-wrap">
								<div className="flex items-center gap-2 text-sm">
									<CheckCircle2 className="size-4 text-green-600 shrink-0" aria-hidden="true" />
									<span>
										<strong>{matchedCount}</strong> de <strong>{displayItems.length}</strong> itens vinculados a um item de compra
									</span>
								</div>
								{unmatchedItems.length > 0 && (
									<div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
										<AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
										<span>{unmatchedItems.length} sem vínculo — salvarão sem CATMAT/preço</span>
									</div>
								)}
							</div>

							{/* Aviso para itens sem vínculo */}
							{unmatchedItems.length > 0 && (
								<div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-4 py-3 text-sm space-y-1.5">
									<p className="text-subheading text-amber-800 dark:text-amber-300">Insumos sem item de compra associado:</p>
									<ul className="list-disc list-inside space-y-0.5 text-muted-foreground text-xs">
										{unmatchedItems.map((i) => (
											<li key={i.ingredient_id}>{i.ingredient_name}</li>
										))}
									</ul>
									<p className="text-xs text-muted-foreground pt-1">
										Para vincular, acesse a ficha do insumo e configure o item de compra padrão (is_default). Você pode salvar agora e vincular depois.
									</p>
								</div>
							)}

							{/* Pesquisa automática de preços */}
							{bulkEligibleCount > 0 && (
								<div className="flex items-center gap-3 flex-wrap">
									<Button variant="outline" onClick={handleBulkResearch} disabled={bulkProgress.isRunning} className="gap-2">
										{bulkProgress.isRunning ? (
											<>
												<Spinner className="size-4" aria-hidden="true" />
												{bulkProgress.done}/{bulkProgress.total} itens...
											</>
										) : (
											<>
												<Search className="size-4" aria-hidden="true" />
												Pesquisar preços automaticamente ({bulkEligibleCount})
											</>
										)}
									</Button>
									{!bulkProgress.isRunning && bulkProgress.total > 0 && (
										<span className="text-xs text-muted-foreground">
											{bulkProgress.done - bulkProgress.errors} preços aplicados
											{bulkProgress.errors > 0 && ` · ${bulkProgress.errors} sem resultado`}
										</span>
									)}
								</div>
							)}

							{/* Tabela de itens */}
							<AtaItemsTable data={displayItems} onPesquisarPreco={(item) => setPriceResearchItem(item)} onUpdateDescription={handleDescriptionChange} />

							{/* Ações finais */}
							<div className="flex items-center justify-between pt-2">
								<Button variant="outline" onClick={() => goToStep(3)} className="gap-2">
									<ArrowLeft className="size-4" aria-hidden="true" />
									Resumo
								</Button>
								<div className="flex items-center gap-3">
									{displayItems.length > 0 && (
										<Button variant="outline" onClick={handleExportCSV} className="gap-2">
											<Download className="size-4" aria-hidden="true" />
											Exportar CSV
										</Button>
									)}
									<Button onClick={handleSave} disabled={!wizardState.title.trim() || displayItems.length === 0 || isFinalizing} className="gap-2">
										<Save className="size-4" aria-hidden="true" />
										{isFinalizing ? "Salvando..." : "Salvar ata"}
									</Button>
								</div>
							</div>
						</div>
					)
				})()}

			{priceResearchItem?.catmat_item_codigo && (
				<PriceResearchModal
					open={priceResearchItem !== null}
					onOpenChange={(open) => {
						if (!open) setPriceResearchItem(null)
					}}
					catmatCode={priceResearchItem.catmat_item_codigo}
					catmatDescription={priceResearchItem.catmat_item_descricao}
					onApplyPrice={(price, auditIds) => {
						const newOverrides = {
							...priceOverrides,
							[priceResearchItem.ingredient_id]: {
								price,
								researchId: auditIds?.researchId ?? null,
								researchItemId: auditIds?.researchItemId ?? null,
							},
						}
						setPriceOverrides(newOverrides)
						setPriceResearchItem(null)

						if (draftId) {
							const updatedItems = rawItems.map((item) => ({
								...item,
								unit_price: item.ingredient_id in newOverrides ? newOverrides[item.ingredient_id].price : item.unit_price,
							}))
							const researchLinks = Object.entries(newOverrides)
								.filter(([, v]) => v.researchId && v.researchItemId)
								.map(([ingredientId, v]) => ({
									ingredientId,
									researchId: v.researchId as string,
									researchItemId: v.researchItemId as string,
								}))
							saveDraftItems({ draftId, items: updatedItems, researchLinks })
						}
					}}
				/>
			)}
		</div>
	)
}
