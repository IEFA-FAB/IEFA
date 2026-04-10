import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { AlertTriangle, ArrowLeft, ArrowRight, Calculator, Download, Save } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { AtaItemsTable } from "@/components/features/local/ata/AtaItemsTable"
import { type AtaStep, AtaStepIndicator } from "@/components/features/local/ata/AtaStepIndicator"
import { DraftImportBadge } from "@/components/features/local/ata/DraftImportBadge"
import { KitchenTemplateSection } from "@/components/features/local/ata/KitchenTemplateSection"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCalculateAtaNeeds, useCreateAta } from "@/hooks/data/useAta"
import { usePendingDraft } from "@/hooks/data/useKitchenDraft"
import { useMenuTemplates } from "@/hooks/data/useTemplates"
import { fetchUnitKitchensFn } from "@/server/unit-kitchens.fn"
import type { ProcurementNeed } from "@/services/ProcurementService"
import type { AtaWizardState, KitchenSelectionState, TemplateSelection } from "@/types/domain/ata"

const searchSchema = z.object({
	step: z.coerce.number().min(1).max(3).optional().default(1),
})

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/procurement/new")({
	beforeLoad: ({ context }) => requirePermission(context, "unit", 2),
	validateSearch: searchSchema,
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

	const filterType = selectionType === "templateSelections" ? "weekly" : "event"
	const filteredTemplates =
		templates?.filter((t) => {
			const type = (t as typeof t & { template_type?: string }).template_type
			return t.kitchen_id !== null && (type === filterType || (!type && filterType === "weekly"))
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
	const { step } = useSearch({ from: "/_protected/_modules/unit/$unitId/procurement/new" })
	const currentStep = ((step as number) || 1) as AtaStep

	const { data: kitchens, isLoading: isLoadingKitchens } = useUnitKitchens(unitId)

	// Estado do wizard
	const [wizardState, setWizardState] = useState<AtaWizardState>({
		title: "",
		notes: "",
		kitchenSelections: [],
	})

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

	const { mutate: calculateNeeds, data: calculatedItems, isPending: isCalculating } = useCalculateAtaNeeds()
	const { mutate: createAta, isPending: isCreating } = useCreateAta()
	const [savedItems, setSavedItems] = useState<ProcurementNeed[]>([])
	const displayItems: ProcurementNeed[] = (calculatedItems as ProcurementNeed[] | undefined) || savedItems

	const handleCalculate = () => {
		const stateToCalc: AtaWizardState = { ...wizardState, kitchenSelections }
		calculateNeeds(stateToCalc, {
			onSuccess: (items) => setSavedItems(items as ProcurementNeed[]),
		})
	}

	const handleSave = () => {
		const stateToSave: AtaWizardState = { ...wizardState, kitchenSelections }
		createAta(
			{ unitId, wizardState: stateToSave, items: displayItems },
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
		const headers = ["Categoria", "CATMAT", "Descrição CATMAT", "Produto", "Quantidade", "Unidade", "Preço Un.", "Total Est."]
		const rows = displayItems.map((item) => [
			item.folder_description || "Sem categoria",
			item.catmat_item_codigo?.toString() || "",
			item.catmat_item_descricao || "",
			item.product_name,
			item.total_quantity.toFixed(4),
			item.measure_unit || "UN",
			item.unit_price !== null ? item.unit_price.toFixed(4) : "",
			item.total_value !== null ? item.total_value.toFixed(2) : "",
		])
		const csv = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n")
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
		const link = document.createElement("a")
		link.href = URL.createObjectURL(blob)
		link.download = `ata-${wizardState.title || "suprimentos"}-${new Date().toISOString().split("T")[0]}.csv`
		link.click()
	}

	const goToStep = (s: number) => {
		navigate({
			to: "/unit/$unitId/procurement/new",
			params: { unitId: unitIdStr as string },
			search: { step: s },
		})
	}

	const hasAnySelection = kitchenSelections.some((ks) => ks.templateSelections.length > 0 || ks.eventSelections.length > 0)

	if (isLoadingKitchens) {
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
						<Button onClick={() => goToStep(2)} className="gap-2">
							Próximo: Eventos
							<ArrowRight className="h-4 w-4" aria-hidden="true" />
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
						<Button variant="outline" onClick={() => goToStep(1)} className="gap-2">
							<ArrowLeft className="h-4 w-4" aria-hidden="true" />
							Cardápios
						</Button>
						<Button onClick={() => goToStep(3)} className="gap-2">
							Próximo: Resumo
							<ArrowRight className="h-4 w-4" aria-hidden="true" />
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
								<p className="text-sm font-medium mb-3">Seleções por cozinha:</p>
								<div className="space-y-3">
									{kitchenSelections.map((ks) => {
										const total = [...ks.templateSelections, ...ks.eventSelections]
										return (
											<div key={ks.kitchenId}>
												<p className="text-sm font-medium">{ks.kitchenName}</p>
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
					<div className="flex justify-center">
						<Button size="lg" onClick={handleCalculate} disabled={!hasAnySelection || isCalculating} className="gap-2">
							<Calculator className="h-5 w-5" aria-hidden="true" />
							{isCalculating ? "Calculando..." : "Calcular Lista"}
						</Button>
					</div>

					{/* Aviso pós-cálculo: resultado vazio */}
					{!isCalculating && savedItems.length === 0 && calculatedItems !== undefined && (
						<div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm" role="alert">
							<AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
							<div>
								<p className="font-medium text-destructive">Nenhum item calculado</p>
								<p className="text-muted-foreground mt-0.5">
									Verifique se as preparações dos cardápios selecionados têm previsão de comensais configurada. O indicador{" "}
									<span className="font-medium">X/Y com comensais</span> nos steps 1 e 2 mostra quais estão incompletas.
								</p>
							</div>
						</div>
					)}

					{/* Tabela de itens */}
					<AtaItemsTable data={displayItems} isLoading={isCalculating} />

					{/* Ações finais */}
					<div className="flex items-center justify-between pt-2">
						<Button variant="outline" onClick={() => goToStep(2)} className="gap-2">
							<ArrowLeft className="h-4 w-4" aria-hidden="true" />
							Eventos
						</Button>
						<div className="flex items-center gap-3">
							{displayItems.length > 0 && (
								<Button variant="outline" onClick={handleExportCSV} className="gap-2">
									<Download className="h-4 w-4" aria-hidden="true" />
									Exportar CSV
								</Button>
							)}
							<Button onClick={handleSave} disabled={!wizardState.title.trim() || displayItems.length === 0 || isCreating} className="gap-2">
								<Save className="h-4 w-4" aria-hidden="true" />
								{isCreating ? "Salvando..." : "Salvar ata"}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
