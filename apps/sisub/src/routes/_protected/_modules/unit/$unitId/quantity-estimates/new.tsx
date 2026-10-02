import { DEFAULT_MAX_INCREASE_PERCENT, DEFAULT_MIN_QUOTE_PERCENT, type SegmentExclusion } from "@iefa/sisub-domain"
import { getBrasiliaToday } from "@iefa/sisub-domain/civil-date"
import type { ProcurementNeed } from "@iefa/sisub-domain/types"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { AlertTriangle, ArrowLeft, ArrowRight, Calculator, CheckCircle2, Download, Save, Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { PriceResearchModal } from "@/components/features/local/price-research/PriceResearchModal"
import { SegmentChoice, SegmentExclusionNotice } from "@/components/features/local/procurement/SegmentChoice"
import { DemandForecastImportBadge } from "@/components/features/local/quantity-estimate/DemandForecastImportBadge"
import { KitchenTemplateSection } from "@/components/features/local/quantity-estimate/KitchenTemplateSection"
import { QuantityEstimateItemsTable } from "@/components/features/local/quantity-estimate/QuantityEstimateItemsTable"
import {
	type QuantityEstimateItemLimitsPatch,
	type QuantityEstimateLimitSettingsPatch,
	QuantityEstimateLimitsSection,
} from "@/components/features/local/quantity-estimate/QuantityEstimateLimitsSection"
import { type QuantityEstimateStep, QuantityEstimateStepIndicator } from "@/components/features/local/quantity-estimate/QuantityEstimateStepIndicator"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { bulkFindingsNotice, useBulkPriceResearch } from "@/hooks/data/useBulkPriceResearch"
import { usePendingDemandForecast, useRecordDemandForecastImport } from "@/hooks/data/useDemandForecast"
import {
	useCalculateQuantityEstimateNeeds,
	useCreateQuantityEstimateDraft,
	useFinalizeQuantityEstimateDraft,
	useQuantityEstimateDraft,
	useSaveQuantityEstimateDraftItems,
	useUpdateQuantityEstimateDraft,
	useUpdateQuantityEstimateLimits,
} from "@/hooks/data/useQuantityEstimate"
import { useSegmentationOverview } from "@/hooks/data/useSegments"
import { useMenuTemplates } from "@/hooks/data/useTemplates"
import { downloadCsv } from "@/lib/csv"
import { annexItemUnit, buildAnnexCsv, buildDraftAnnexRows } from "@/lib/quantity-estimate-annex"
import { quantityEstimateItemToNeed } from "@/lib/quantity-estimate-utils"
import { fetchUnitKitchensFn } from "@/server/unit-kitchens.fn"
import type { KitchenSelectionState, QuantityEstimateWizardState, SelectionBucket, TemplateSelection } from "@/types/domain/quantity-estimate"

const searchSchema = z.object({
	step: z.coerce.number().min(1).max(5).optional().default(1),
	draft: z.uuid().optional(),
})

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/quantity-estimates/new")({
	validateSearch: searchSchema,
	beforeLoad: (opts) => requirePermission(opts, "unit", 2),
	component: NewQuantityEstimatePage,
})

/** Vigência típica de uma ARP (Lei 14.133/2021, Art. 84: até 1 ano, prorrogável). */
const DEFAULT_VALIDITY_MONTHS = 12

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

/** Regime de produção que alimenta cada bucket do wizard. */
const TEMPLATE_TYPE_BY_BUCKET: Record<SelectionBucket, string> = {
	templateSelections: "weekly",
	eventSelections: "event",
	supportMenuSelections: "apoio",
}

function KitchenStepSection({
	kitchenState,
	selectionType,
	validityMonths,
	quantityEstimateId,
	onUpdateSelection,
}: {
	kitchenState: KitchenSelectionState
	selectionType: SelectionBucket
	validityMonths: number
	/** Rascunho do anexo: a importação da previsão fica registrada nele. */
	quantityEstimateId: string | null
	onUpdateSelection: (kitchenId: number, type: SelectionBucket, selections: TemplateSelection[]) => void
}) {
	const { data: templates, isLoading } = useMenuTemplates(kitchenState.kitchenId)
	const { data: pendingForecast } = usePendingDemandForecast(kitchenState.kitchenId)
	const { mutate: recordImport } = useRecordDemandForecastImport(kitchenState.kitchenId)

	// Um passo por template_type. Template sem tipo (legado) conta como weekly.
	const expectedType = TEMPLATE_TYPE_BY_BUCKET[selectionType]
	const filteredTemplates =
		templates?.filter((t) => {
			if (t.kitchen_id === null) return false
			const type = (t as typeof t & { template_type?: string }).template_type
			return type === expectedType || (expectedType === "weekly" && !type)
		}) || []

	const handleImport = (_kitchenId: number, templateSels: TemplateSelection[], eventSels: TemplateSelection[], supportMenuSels: TemplateSelection[]) => {
		onUpdateSelection(kitchenState.kitchenId, "templateSelections", templateSels)
		onUpdateSelection(kitchenState.kitchenId, "eventSelections", eventSels)
		onUpdateSelection(kitchenState.kitchenId, "supportMenuSelections", supportMenuSels)
		if (pendingForecast && quantityEstimateId) recordImport({ forecastId: pendingForecast.id, quantityEstimateId })
	}

	return (
		<div className="space-y-3">
			{pendingForecast && selectionType === "templateSelections" && (
				<DemandForecastImportBadge forecast={pendingForecast} kitchenState={kitchenState} quantityEstimateId={quantityEstimateId} onImport={handleImport} />
			)}
			<KitchenTemplateSection
				kitchenState={kitchenState}
				templates={filteredTemplates}
				isLoadingTemplates={isLoading}
				selectionType={selectionType}
				validityMonths={validityMonths}
				onUpdateSelection={onUpdateSelection}
			/>
		</div>
	)
}

// ─── Página principal do wizard ───────────────────────────────────────────────

function NewQuantityEstimatePage() {
	const { unitId: unitIdStr } = useParams({ strict: false })
	const unitId = Number(unitIdStr)
	const navigate = useNavigate()
	const { step, draft: draftId } = useSearch({ from: "/_protected/_modules/unit/$unitId/quantity-estimates/new" })
	const currentStep = ((step as number) || 1) as QuantityEstimateStep

	const { data: kitchens, isLoading: isLoadingKitchens } = useUnitKitchens(unitId)
	const { data: existingDraft, isLoading: isLoadingDraft } = useQuantityEstimateDraft(draftId ?? null)

	const { mutate: createDraft, isPending: isCreatingDraft } = useCreateQuantityEstimateDraft()
	const { mutate: updateDraft } = useUpdateQuantityEstimateDraft()
	const { mutate: saveDraftItems, mutateAsync: saveDraftItemsAsync } = useSaveQuantityEstimateDraftItems()
	const { mutate: finalizeDraft, isPending: isFinalizing } = useFinalizeQuantityEstimateDraft()
	const { mutateAsync: calculateNeedsAsync, isPending: isCalculating } = useCalculateQuantityEstimateNeeds()
	const { mutate: updateQuantityLimits } = useUpdateQuantityEstimateLimits()

	const draftCreatedRef = useRef(false)
	const draftRestoredRef = useRef(false)
	const descriptionSaveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

	useEffect(() => () => clearTimeout(descriptionSaveTimerRef.current), [])

	const [wizardState, setWizardState] = useState<QuantityEstimateWizardState>({
		title: "",
		notes: "",
		validityMonths: DEFAULT_VALIDITY_MONTHS,
		kitchenSelections: [],
	})

	const [savedItems, setSavedItems] = useState<ProcurementNeed[]>([])
	// Itens do cálculo que ficaram para outras contratações (só no anexo de uma contratação).
	const [segmentExclusion, setSegmentExclusion] = useState<SegmentExclusion | null>(null)
	const { data: segmentation } = useSegmentationOverview(unitId)
	const segments = segmentation?.segments ?? []
	// Acréscimo padrão e justificativa do anexo de quantitativos; a vigência vem do próprio wizard.
	const [limitSettings, setLimitSettings] = useState<{ maxIncreasePercent: number; maxQuantityJustification: string | null; minQuotePercent: number } | null>(
		null
	)
	const [priceResearchItem, setPriceResearchItem] = useState<ProcurementNeed | null>(null)
	const [priceOverrides, setPriceOverrides] = useState<Record<string, { price: number; researchId: string | null; researchItemId: string | null }>>({})
	const [descriptionOverrides, setDescriptionOverrides] = useState<Record<string, string>>({})

	// O save da descrição é debounced em 800ms; sem estes refs o timer gravaria os
	// preços/itens do render em que a tecla foi digitada, regredindo no banco um
	// preço aplicado dentro da janela (modal ou pesquisa em lote).
	const priceOverridesRef = useRef(priceOverrides)
	priceOverridesRef.current = priceOverrides
	const savedItemsRef = useRef(savedItems)
	savedItemsRef.current = savedItems

	// Criar draft se ainda não existe
	useEffect(() => {
		if (draftId || draftCreatedRef.current || isLoadingKitchens) return
		draftCreatedRef.current = true
		createDraft(unitId, {
			onSuccess: ({ id }) => {
				navigate({
					to: "/unit/$unitId/quantity-estimates/new",
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

		const restoredValidity = (existingDraft as typeof existingDraft & { validity_months?: number | null }).validity_months ?? DEFAULT_VALIDITY_MONTHS
		setLimitSettings({
			maxIncreasePercent: existingDraft.max_increase_percent,
			maxQuantityJustification: existingDraft.max_quantity_justification,
			minQuotePercent: Number(existingDraft.min_quote_percent ?? DEFAULT_MIN_QUOTE_PERCENT),
		})

		setWizardState({
			title: existingDraft.title === "Sem nome" ? "" : existingDraft.title,
			notes: existingDraft.notes || "",
			validityMonths: restoredValidity,
			kitchenSelections: [],
			segmentId: existingDraft.segment_id ?? null,
		})

		if (existingDraft.kitchens?.length) {
			// Cada seleção volta para o bucket do seu template_type; sem tipo (legado) = weekly.
			const bucketOf = (s: unknown): SelectionBucket => {
				const type = (s as { template?: { template_type?: string } }).template?.template_type
				if (type === "event") return "eventSelections"
				if (type === "apoio") return "supportMenuSelections"
				return "templateSelections"
			}
			const restored: KitchenSelectionState[] = existingDraft.kitchens.map((k) => {
				const kWithDetails = k as typeof k & { kitchen?: { display_name?: string | null } }
				const buckets: Record<SelectionBucket, TemplateSelection[]> = { templateSelections: [], eventSelections: [], supportMenuSelections: [] }
				for (const s of k.selections) {
					const sw = s as typeof s & { template?: { name?: string | null; expected_monthly_occurrences?: number | null } }
					const bucket = bucketOf(s)
					buckets[bucket].push({
						templateId: s.template_id,
						templateName: sw.template?.name || "",
						repetitions: s.repetitions,
						// Preserva a base mensal da exceção para reprojetar quando a vigência mudar.
						// Sem o dado no payload, deriva da própria persistência (reps / meses).
						...(bucket === "supportMenuSelections" && {
							monthlyOccurrences: sw.template?.expected_monthly_occurrences ?? Math.max(1, Math.round(s.repetitions / Math.max(1, restoredValidity))),
						}),
					})
				}
				return {
					kitchenId: k.kitchen_id,
					kitchenName: kWithDetails.kitchen?.display_name || `Cozinha ${k.kitchen_id}`,
					deliveryNotes: k.delivery_notes || "",
					...buckets,
				}
			})
			setWizardState((prev) => ({ ...prev, kitchenSelections: restored }))
		}

		const restoredStep = existingDraft.wizard_step
		if (restoredStep && restoredStep !== currentStep) {
			navigate({
				to: "/unit/$unitId/quantity-estimates/new",
				params: { unitId: unitIdStr as string },
				search: { step: restoredStep, draft: existingDraft.id },
				replace: true,
			})
		}
	}, [existingDraft, currentStep, unitIdStr, navigate])

	// Sincronizar savedItems com o banco sempre que existingDraft.items mudar — garante que
	// preços pesquisados persistem quando dados do cache ficam obsoletos entre sessões.
	// TanStack Query usa structural sharing, então esse efeito só roda quando os dados realmente mudam.
	// Merge (não replace): handleCalculate também escreve savedItems com quantity_estimate_item_id enriquecido;
	// um eco do server sem esse id não pode regredir o estado local (perderia os links de pesquisa).
	useEffect(() => {
		if (!existingDraft?.items?.length) return
		setSavedItems((prev) => {
			const prevById = new Map(prev.map((p) => [p.ingredient_id, p]))
			return (existingDraft.items ?? []).map((it) => {
				const need = quantityEstimateItemToNeed(it)
				const local = prevById.get(need.ingredient_id)
				return need.quantity_estimate_item_id == null && local?.quantity_estimate_item_id != null
					? { ...need, quantity_estimate_item_id: local.quantity_estimate_item_id }
					: need
			})
		})
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
					supportMenuSelections: [],
				}
			)
		}) || []

	const handleUpdateSelection = (kitchenId: number, type: SelectionBucket, selections: TemplateSelection[]) => {
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
						supportMenuSelections: type === "supportMenuSelections" ? selections : [],
					},
				],
			}
		})
	}

	/**
	 * A vigência é o multiplicador das exceções, então mexer nela reprojeta todas as
	 * seleções de exceção já feitas. Weekly/event não têm base mensal e ficam intactos.
	 */
	const handleValidityMonthsChange = (months: number) => {
		setWizardState((prev) => ({
			...prev,
			validityMonths: months,
			kitchenSelections: prev.kitchenSelections.map((ks) => ({
				...ks,
				supportMenuSelections: ks.supportMenuSelections.map((s) => ({ ...s, repetitions: (s.monthlyOccurrences ?? 1) * months })),
			})),
		}))
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
				researchId: result.auditIds.researchId,
				researchItemId: result.auditIds.researchItemId,
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
				researchId: r.auditIds.researchId,
				researchItemId: r.auditIds.researchItemId,
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
		const notice = bulkFindingsNotice(results)
		if (notice) toast.warning(notice)
	}
	const handleDescriptionChange = (ingredientId: string, _ataItemId: string | null | undefined, description: string) => {
		const nextOverrides = { ...descriptionOverrides, [ingredientId]: description }
		setDescriptionOverrides(nextOverrides)
		if (!draftId) return
		// Debounce: evita mutação por keystroke — captura closure dos valores atuais na última chamada
		clearTimeout(descriptionSaveTimerRef.current)
		descriptionSaveTimerRef.current = setTimeout(() => {
			const currentPrices = priceOverridesRef.current
			const researchLinks = Object.entries(currentPrices)
				.filter(([, v]) => v.researchId && v.researchItemId)
				.map(([ingId, v]) => ({ ingredientId: ingId, researchId: v.researchId as string, researchItemId: v.researchItemId as string }))
			const updatedItems = savedItemsRef.current.map((item) => ({
				...item,
				item_description: item.ingredient_id in nextOverrides ? (nextOverrides[item.ingredient_id] ?? null) : (item.item_description ?? null),
				unit_price: item.ingredient_id in currentPrices ? currentPrices[item.ingredient_id].price : item.unit_price,
			}))
			saveDraftItems({ draftId: draftId as string, items: updatedItems, researchLinks })
		}, 800)
	}

	const displayItems: ProcurementNeed[] = useMemo(
		() =>
			rawItems.map((item) => ({
				...item,
				unit_price: item.ingredient_id in priceOverrides ? priceOverrides[item.ingredient_id].price : item.unit_price,
			})),
		[rawItems, priceOverrides]
	)

	const goToStep = (s: number, saveCurrent = false) => {
		if (saveCurrent && draftId) {
			updateDraft({
				draftId,
				kitchenSelections,
				wizardStep: s,
				title: wizardState.title || undefined,
				notes: wizardState.notes || undefined,
				validityMonths: wizardState.validityMonths,
				segmentId: wizardState.segmentId ?? null,
			})
		}
		navigate({
			to: "/unit/$unitId/quantity-estimates/new",
			params: { unitId: unitIdStr as string },
			search: { step: s, draft: draftId },
		})
	}

	const handleCalculate = async () => {
		const stateToCalc: QuantityEstimateWizardState = { ...wizardState, kitchenSelections }
		let needs: ProcurementNeed[]
		try {
			const result = await calculateNeedsAsync(stateToCalc)
			needs = result.items
			setSegmentExclusion(result.excluded)
		} catch {
			return // error toast handled by useCalculateQuantityEstimateNeeds
		}
		// Recalcular muda o ALVO, não as escolhas feitas sobre ele: o item que continua na lista
		// mantém o id (e com ele a pesquisa de preço), a descrição adicional e os limites do anexo.
		const previousByIngredient = new Map(savedItemsRef.current.map((item) => [item.ingredient_id, item]))
		needs = needs.map((need) => {
			const previous = previousByIngredient.get(need.ingredient_id)
			if (!previous) return need
			return {
				...need,
				quantity_estimate_item_id: previous.quantity_estimate_item_id ?? null,
				item_description: previous.item_description ?? null,
				max_increase_percent: previous.max_increase_percent ?? null,
				// Ciclo já gravado no anexo vence o padrão do insumo que o cálculo trouxe.
				delivery_cycle: previous.delivery_cycle ?? need.delivery_cycle,
				min_order_quantity: previous.min_order_quantity ?? null,
			}
		})
		if (draftId) {
			try {
				const result = await saveDraftItemsAsync({ draftId, items: needs })
				const idMap = new Map(result.savedIds.map((s) => [s.ingredientId, s.quantityEstimateItemId]))
				setSavedItems(needs.map((item) => ({ ...item, quantity_estimate_item_id: idMap.get(item.ingredient_id) ?? item.quantity_estimate_item_id ?? null })))
			} catch {
				setSavedItems(needs) // fallback: proceed without quantity_estimate_item_id
			}
		} else {
			setSavedItems(needs)
		}
		goToStep(5)
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
				onSuccess: (quantityEstimate) => {
					navigate({
						to: "/unit/$unitId/quantity-estimates/$quantityEstimateId",
						params: { unitId: unitIdStr as string, quantityEstimateId: quantityEstimate.id },
					})
				},
			}
		)
	}

	const annexSettings = useMemo(
		() => ({
			validityMonths: wizardState.validityMonths,
			maxIncreasePercent: limitSettings?.maxIncreasePercent ?? DEFAULT_MAX_INCREASE_PERCENT,
			maxQuantityJustification: limitSettings?.maxQuantityJustification ?? null,
			minQuotePercent: limitSettings?.minQuotePercent ?? DEFAULT_MIN_QUOTE_PERCENT,
		}),
		[wizardState.validityMonths, limitSettings]
	)
	const annexRows = useMemo(() => buildDraftAnnexRows(displayItems, annexSettings), [displayItems, annexSettings])
	const justificationMissing = annexRows.some((r) => r.warnings.includes("increase_requires_justification")) && !annexSettings.maxQuantityJustification?.trim()

	const handleExportCSV = () => {
		downloadCsv(
			`anexo-quantitativos-${wizardState.title || "suprimentos"}-${getBrasiliaToday()}.csv`,
			buildAnnexCsv(annexRows, annexSettings.maxQuantityJustification)
		)
	}

	const handleLimitSettingsChange = (patch: QuantityEstimateLimitSettingsPatch) => {
		if (!draftId) return
		setLimitSettings({
			maxIncreasePercent: patch.maxIncreasePercent ?? annexSettings.maxIncreasePercent,
			maxQuantityJustification: patch.maxQuantityJustification !== undefined ? patch.maxQuantityJustification : annexSettings.maxQuantityJustification,
			minQuotePercent: patch.minQuotePercent ?? annexSettings.minQuotePercent,
		})
		updateQuantityLimits({ quantityEstimateId: draftId, ...patch })
	}

	const handleItemLimitsChange = (quantityEstimateItemId: string, patch: QuantityEstimateItemLimitsPatch) => {
		if (!draftId) return
		// Estado local primeiro: os saves de itens (descrição, preço) regravam a linha inteira
		// a partir de savedItems, e não podem devolver a escolha antiga ao banco.
		setSavedItems((prev) =>
			prev.map((item) =>
				item.quantity_estimate_item_id === quantityEstimateItemId
					? {
							...item,
							...(patch.maxIncreasePercent !== undefined && { max_increase_percent: patch.maxIncreasePercent }),
							...(patch.deliveryCycle !== undefined && { delivery_cycle: patch.deliveryCycle }),
							...(patch.minOrderQuantity !== undefined && { min_order_quantity: patch.minOrderQuantity }),
						}
					: item
			)
		)
		updateQuantityLimits({ quantityEstimateId: draftId, items: [{ quantityEstimateItemId, ...patch }] })
	}

	const hasAnySelection = kitchenSelections.some(
		(ks) => ks.templateSelections.length > 0 || ks.eventSelections.length > 0 || ks.supportMenuSelections.length > 0
	)

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
			<PageHeader title="Novo Anexo Quantitativo do TR" description="Configure os templates e calcule os quantitativos de aquisição do Termo de Referência." />

			{/* Indicador de steps */}
			<div className="flex items-center justify-center py-2">
				<QuantityEstimateStepIndicator currentStep={currentStep} />
			</div>

			{/* ── Step 1: Cardápios Semanais ─────────────────────────────────── */}
			{currentStep === 1 && (
				<div className="space-y-4">
					<SegmentChoice
						unitId={unitIdStr as string}
						segments={segments}
						loaded={segmentation != null}
						value={wizardState.segmentId ?? null}
						onChange={(segment) => {
							setWizardState((prev) => ({ ...prev, segmentId: segment?.id ?? null }))
							// A vigência do anexo nasce da vigência da contratação (e reprojeta os apoios).
							if (segment) handleValidityMonthsChange(segment.validityMonths)
						}}
					/>
					<p className="text-sm text-muted-foreground">Selecione os cardápios semanais para cada cozinha e defina o número de repetições.</p>
					{kitchenSelections.length === 0 ? (
						<Card>
							<CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma cozinha associada a esta unidade.</CardContent>
						</Card>
					) : (
						<div className="space-y-4">
							{kitchenSelections.map((ks) => (
								<KitchenStepSection
									key={ks.kitchenId}
									kitchenState={ks}
									selectionType="templateSelections"
									validityMonths={wizardState.validityMonths}
									quantityEstimateId={draftId ?? null}
									onUpdateSelection={handleUpdateSelection}
								/>
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
					<p className="text-sm text-muted-foreground">
						Selecione os eventos pontuais de cada cozinha e informe quantas vezes cada um ocorre durante a vigência prevista do anexo.
					</p>
					{kitchenSelections.length === 0 ? (
						<Card>
							<CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma cozinha associada a esta unidade.</CardContent>
						</Card>
					) : (
						<div className="space-y-4">
							{kitchenSelections.map((ks) => (
								<KitchenStepSection
									key={ks.kitchenId}
									kitchenState={ks}
									selectionType="eventSelections"
									validityMonths={wizardState.validityMonths}
									quantityEstimateId={draftId ?? null}
									onUpdateSelection={handleUpdateSelection}
								/>
							))}
						</div>
					)}
					<div className="flex justify-between pt-2">
						<Button variant="outline" onClick={() => goToStep(1, true)} className="gap-2">
							<ArrowLeft className="size-4" aria-hidden="true" />
							Cardápios
						</Button>
						<Button onClick={() => goToStep(3, true)} className="gap-2">
							Próximo: Cardápios de Apoio
							<ArrowRight className="size-4" aria-hidden="true" />
						</Button>
					</div>
				</div>
			)}

			{/* ── Step 3: Cardápios de apoio ────────────────────────────────── */}
			{currentStep === 3 && (
				<div className="space-y-4">
					<p className="text-sm text-muted-foreground">
						Produções fora da rotina que não são eventos — lanches de bordo e de apoio, coffee breaks, cafés de reunião. A quantidade vem das ocorrências
						mensais cadastradas nos Cardápios de Apoio da cozinha, projetadas pela vigência prevista do anexo.
					</p>

					<Card>
						<CardContent className="pt-6">
							<FieldGroup>
								<Field>
									<FieldLabel htmlFor="quantity-estimate-validity">Vigência prevista do anexo (meses)</FieldLabel>
									<Input
										id="quantity-estimate-validity"
										type="number"
										min={1}
										max={120}
										value={wizardState.validityMonths}
										onChange={(e) => {
											const n = Number.parseInt(e.target.value, 10)
											if (Number.isFinite(n) && n >= 1 && n <= 120) handleValidityMonthsChange(n)
										}}
										className="w-28 tabular-nums"
									/>
									<p className="text-xs text-muted-foreground">
										Multiplica as ocorrências mensais de cada cardápio de apoio. Alterar aqui reprojeta as seleções já feitas.
									</p>
								</Field>
							</FieldGroup>
						</CardContent>
					</Card>

					{kitchenSelections.length === 0 ? (
						<Card>
							<CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma cozinha associada a esta unidade.</CardContent>
						</Card>
					) : (
						<div className="space-y-4">
							{kitchenSelections.map((ks) => (
								<KitchenStepSection
									key={ks.kitchenId}
									kitchenState={ks}
									selectionType="supportMenuSelections"
									validityMonths={wizardState.validityMonths}
									quantityEstimateId={draftId ?? null}
									onUpdateSelection={handleUpdateSelection}
								/>
							))}
						</div>
					)}
					<div className="flex justify-between pt-2">
						<Button variant="outline" onClick={() => goToStep(2, true)} className="gap-2">
							<ArrowLeft className="size-4" aria-hidden="true" />
							Eventos
						</Button>
						<Button onClick={() => goToStep(4, true)} className="gap-2">
							Próximo: Resumo
							<ArrowRight className="size-4" aria-hidden="true" />
						</Button>
					</div>
				</div>
			)}

			{/* ── Step 4: Resumo e geração ────────────────────────────────────── */}
			{currentStep === 4 && (
				<div className="space-y-6">
					{/* Metadados do anexo */}
					<Card>
						<CardContent className="pt-6">
							<div className="space-y-4">
								<FieldGroup>
									<Field>
										<FieldLabel htmlFor="quantity-estimate-title">Título do anexo *</FieldLabel>
										<Input
											id="quantity-estimate-title"
											value={wizardState.title}
											onChange={(e) => setWizardState((prev) => ({ ...prev, title: e.target.value }))}
											placeholder="Ex: Anexo Quantitativo do TR — Pregão 2026"
											required
										/>
									</Field>
								</FieldGroup>
								<FieldGroup>
									<Field>
										<FieldLabel htmlFor="quantity-estimate-notes">Observações</FieldLabel>
										<Textarea
											id="quantity-estimate-notes"
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
										const total = [...ks.templateSelections, ...ks.eventSelections, ...ks.supportMenuSelections]
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
						<Button variant="outline" onClick={() => goToStep(3)} className="gap-2">
							<ArrowLeft className="size-4" aria-hidden="true" />
							Cardápios de Apoio
						</Button>
						<Button size="lg" onClick={handleCalculate} disabled={!hasAnySelection || isCalculating} className="gap-2">
							<Calculator className="size-5" aria-hidden="true" />
							{isCalculating ? "Calculando..." : "Calcular Lista"}
						</Button>
					</div>
				</div>
			)}

			{/* ── Step 5: Revisão dos Itens de Compra ────────────────────── */}
			{currentStep === 5 &&
				(() => {
					const matchedCount = displayItems.filter((i) => i.purchase_item_id !== null).length
					const unmatchedItems = displayItems.filter((i) => i.purchase_item_id === null)
					return (
						<div className="space-y-6">
							{/* Resumo de mapeamento */}
							<div className="flex items-center gap-3 flex-wrap">
								<div className="flex items-center gap-2 text-sm">
									<CheckCircle2 className="size-4 text-success shrink-0" aria-hidden="true" />
									<span>
										<strong>{matchedCount}</strong> de <strong>{displayItems.length}</strong> itens vinculados a um item de compra
									</span>
								</div>
								{unmatchedItems.length > 0 && (
									<div className="flex items-center gap-2 text-sm text-warning">
										<AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
										<span>{unmatchedItems.length} sem vínculo — salvarão sem CATMAT/preço</span>
									</div>
								)}
							</div>

							{segmentExclusion && (
								<SegmentExclusionNotice
									exclusion={segmentExclusion}
									segmentName={segments.find((s) => s.id === wizardState.segmentId)?.name ?? "esta contratação planejada"}
									unitId={unitIdStr as string}
								/>
							)}

							{/* Aviso para itens sem vínculo */}
							{unmatchedItems.length > 0 && (
								<div className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm space-y-1.5">
									<p className="text-subheading text-warning">Insumos sem item de compra associado:</p>
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
							<QuantityEstimateItemsTable
								data={displayItems}
								onPesquisarPreco={(item) => setPriceResearchItem(item)}
								onUpdateDescription={handleDescriptionChange}
							/>

							{displayItems.length > 0 && (
								<QuantityEstimateLimitsSection
									rows={annexRows}
									settings={annexSettings}
									editable
									onSettingsChange={handleLimitSettingsChange}
									onItemChange={handleItemLimitsChange}
								/>
							)}

							{/* Ações finais */}
							<div className="flex items-center justify-between pt-2">
								<Button variant="outline" onClick={() => goToStep(4)} className="gap-2">
									<ArrowLeft className="size-4" aria-hidden="true" />
									Resumo
								</Button>
								<div className="flex items-center gap-3">
									{justificationMissing && <span className="text-xs text-warning">Preencha a justificativa do acréscimo nos limites de quantidade</span>}
									{displayItems.length > 0 && (
										<Button variant="outline" onClick={handleExportCSV} className="gap-2">
											<Download className="size-4" aria-hidden="true" />
											Exportar CSV
										</Button>
									)}
									<Button
										onClick={handleSave}
										disabled={!wizardState.title.trim() || displayItems.length === 0 || isFinalizing || justificationMissing}
										className="gap-2"
									>
										<Save className="size-4" aria-hidden="true" />
										{isFinalizing ? "Salvando..." : "Salvar anexo"}
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
					// Sem estes dois, a memória de cálculo nasce órfã (quantity_estimate_id/quantity_estimate_item_id nulos)
					// e o escopo da chave de idempotência vira global por CATMAT — duas unidades
					// pesquisando o mesmo item no mesmo dia compartilhariam o registro.
					quantityEstimateId={draftId}
					quantityEstimateItemId={priceResearchItem.quantity_estimate_item_id ?? undefined}
					targetUnit={annexItemUnit(priceResearchItem)}
					onApplyPrice={(price, auditIds) => {
						const newOverrides = {
							...priceOverrides,
							[priceResearchItem.ingredient_id]: {
								price,
								researchId: auditIds.researchId,
								researchItemId: auditIds.researchItemId,
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
