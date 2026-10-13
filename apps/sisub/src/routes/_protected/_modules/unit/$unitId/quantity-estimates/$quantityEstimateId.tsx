import { toBrasiliaCivilDate } from "@iefa/sisub-domain/civil-date"
import type { ProcurementNeed } from "@iefa/sisub-domain/types"
import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { ArpSearchModal } from "@/components/features/local/arp/ArpSearchModal"
import { type PriceResearchAuditIds, PriceResearchModal } from "@/components/features/local/price-research/PriceResearchModal"
import { AnnexDocumentsCard } from "@/components/features/local/procurement/AnnexDocumentsCard"
import { QuantityEstimateItemsTable } from "@/components/features/local/quantity-estimate/QuantityEstimateItemsTable"
import {
	type QuantityEstimateItemLimitsPatch,
	QuantityEstimateLimitsSection,
} from "@/components/features/local/quantity-estimate/QuantityEstimateLimitsSection"
import {
	ArpSection,
	BulkResearchBar,
	ParticipatingKitchensCard,
	QuantityEstimateHeaderActions,
	QuantityEstimateStatusBar,
	StaleQuantitiesNotice,
} from "@/components/features/unit/quantity-estimate/QuantityEstimateDetailSections"
import {
	buildAnnexSettings,
	isJustificationMissing,
	selectAnnexRows,
	summarizePrices,
} from "@/components/features/unit/quantity-estimate/quantity-estimate-detail"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "@/components/ui/toast"
import { useArpForQuantityEstimate } from "@/hooks/data/useArp"
import { bulkFindingsNotice, useBulkPriceResearch } from "@/hooks/data/useBulkPriceResearch"
import {
	useQuantityEstimateDetails,
	useUpdateQuantityEstimateItemDescription,
	useUpdateQuantityEstimateLimits,
	useUpdateQuantityEstimateStatus,
} from "@/hooks/data/useQuantityEstimate"
import { useUnitSettings } from "@/hooks/data/useUnitSettings"
import { downloadCsv } from "@/lib/csv"
import { annexItemUnit, buildAnnexCsv, type QuantityEstimateAnnexSettings } from "@/lib/quantity-estimate-annex"
import { quantityEstimateItemToNeed } from "@/lib/quantity-estimate-utils"
import { queryKeys } from "@/lib/query-keys"
import { updateQuantityEstimateItemPricesFn } from "@/server/quantity-estimate.fn"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/quantity-estimates/$quantityEstimateId")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	component: QuantityEstimateDetailPage,
})

function QuantityEstimateDetailPage() {
	const { unitId: unitIdStr, quantityEstimateId } = useParams({ strict: false })
	const unitId = Number(unitIdStr)
	const { can } = usePBAC()
	const [arpModalOpen, setArpModalOpen] = useState(false)
	const [priceResearchItem, setPriceResearchItem] = useState<ProcurementNeed | null>(null)

	const queryClient = useQueryClient()
	const { data: quantityEstimate, isLoading } = useQuantityEstimateDetails(quantityEstimateId || null)
	useCrumbLabel(quantityEstimate?.title)
	const { mutate: updateStatus, isPending: isUpdating } = useUpdateQuantityEstimateStatus()
	const { mutate: updateItemDescription } = useUpdateQuantityEstimateItemDescription()
	const { mutate: updateQuantityLimits } = useUpdateQuantityEstimateLimits()
	const { data: arp, isLoading: isArpLoading } = useArpForQuantityEstimate(quantityEstimateId || null)

	// UASG da unidade para pré-preencher o modal de busca
	const { data: unitSettings } = useUnitSettings(unitId)

	const handleDescriptionChange = (_ingredientId: string, quantityEstimateItemId: string | null | undefined, description: string) => {
		if (!quantityEstimateItemId || !quantityEstimateId) return
		updateItemDescription({ quantityEstimateId, quantityEstimateItemId, description })
	}

	const needs = useMemo(() => quantityEstimate?.items.map(quantityEstimateItemToNeed) ?? [], [quantityEstimate?.items])

	const annexSettings = useMemo<QuantityEstimateAnnexSettings | null>(() => buildAnnexSettings(quantityEstimate), [quantityEstimate])
	// Rascunho calcula na hora; concluído mostra o que o snapshot congelou (ver `selectAnnexRows`).
	const annexRows = useMemo(() => selectAnnexRows(quantityEstimate, needs, annexSettings), [quantityEstimate, needs, annexSettings])

	const handleExportCSV = () => {
		if (!quantityEstimate) return
		downloadCsv(
			`anexo-quantitativos-${quantityEstimate.title}-${toBrasiliaCivilDate(quantityEstimate.created_at) ?? ""}.csv`,
			buildAnnexCsv(annexRows, quantityEstimate.max_quantity_justification, { confidential: Boolean(quantityEstimate.is_budget_confidential) })
		)
	}

	// A trava real é do servidor na conclusão; aqui só evita o clique que já sabemos que falha.
	const justificationMissing = isJustificationMissing(quantityEstimate, annexRows)

	const handleItemLimitsChange = (quantityEstimateItemId: string, patch: QuantityEstimateItemLimitsPatch) => {
		if (!quantityEstimateId) return
		updateQuantityLimits({ quantityEstimateId, items: [{ quantityEstimateItemId, ...patch }] })
	}
	const {
		start: runBulkResearch,
		progress: bulkProgress,
		eligibleCount: bulkEligibleCount,
	} = useBulkPriceResearch(needs, quantityEstimateId, async (result) => {
		if (!result.quantityEstimateItemId || !quantityEstimateId) return
		await updateQuantityEstimateItemPricesFn({
			data: {
				quantityEstimateId,
				updates: [{ quantityEstimateItemId: result.quantityEstimateItemId as string, price: result.price }],
				researchLinks: [
					{
						quantityEstimateItemId: result.quantityEstimateItemId as string,
						researchId: result.auditIds.researchId,
						researchItemId: result.auditIds.researchItemId,
					},
				],
			},
		})
	})

	// Aplicação manual de um preço vindo do modal (item único). O vínculo da memória
	// de cálculo já foi gravado pelo próprio modal via quantityEstimateId/quantityEstimateItemId; researchLinks
	// aqui é reforço para o caso de o item ter sido relinkado no meio do caminho.
	const handleApplyPrice = async (item: ProcurementNeed, price: number, auditIds: PriceResearchAuditIds) => {
		const quantityEstimateItemId = item.quantity_estimate_item_id
		if (!quantityEstimateId || !quantityEstimateItemId) return
		try {
			await updateQuantityEstimateItemPricesFn({
				data: {
					quantityEstimateId,
					updates: [{ quantityEstimateItemId, price }],
					researchLinks: [{ quantityEstimateItemId, researchId: auditIds.researchId, researchItemId: auditIds.researchItemId }],
				},
			})
			queryClient.invalidateQueries({ queryKey: queryKeys.quantityEstimate.details(quantityEstimateId) })
			toast.success("Preço aplicado ao item.")
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Não foi possível aplicar o preço.")
		}
	}

	const handleBulkResearch = async () => {
		if (!quantityEstimateId) return
		const results = await runBulkResearch()
		if (results.length === 0) return
		queryClient.invalidateQueries({ queryKey: queryKeys.quantityEstimate.details(quantityEstimateId) })
		toast.success(
			`${results.length} preço${results.length !== 1 ? "s" : ""} pesquisado${results.length !== 1 ? "s" : ""} e aplicado${results.length !== 1 ? "s" : ""}.`
		)
		const notice = bulkFindingsNotice(results)
		if (notice) toast.warning(notice)
	}

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div className="h-16 animate-pulse rounded bg-muted" />
				<div className="h-64 animate-pulse rounded bg-muted" />
			</div>
		)
	}

	if (!quantityEstimate) {
		return (
			<div className="py-12 text-center">
				<p className="text-muted-foreground">Anexo quantitativo não encontrado.</p>
				<Button
					variant="outline"
					size="sm"
					className="mt-4"
					nativeButton={false}
					render={
						<Link to="/unit/$unitId/quantity-estimates" params={{ unitId: unitIdStr as string }}>
							Voltar
						</Link>
					}
				/>
			</div>
		)
	}

	const { hasPrices, grandTotal } = summarizePrices(quantityEstimate.items)

	return (
		<div className="space-y-6">
			<PageHeader
				title={quantityEstimate.title}
				description={`Criado em ${new Date(quantityEstimate.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`}
			>
				<QuantityEstimateHeaderActions
					unitIdStr={unitIdStr as string}
					status={quantityEstimate.status}
					isUpdating={isUpdating}
					justificationMissing={justificationMissing}
					onExport={handleExportCSV}
					onComplete={() => updateStatus({ quantityEstimateId: quantityEstimate.id, status: "completed" })}
					onArchive={() => updateStatus({ quantityEstimateId: quantityEstimate.id, status: "archived" })}
				/>
			</PageHeader>

			{/* Status + resumo */}
			<QuantityEstimateStatusBar quantityEstimate={quantityEstimate} hasPrices={hasPrices} grandTotal={grandTotal} />

			<StaleQuantitiesNotice quantityEstimate={quantityEstimate} />

			{quantityEstimate.notes && (
				<Card>
					<CardContent className="pt-4 pb-4">
						<p className="text-sm text-muted-foreground whitespace-pre-wrap">{quantityEstimate.notes}</p>
					</CardContent>
				</Card>
			)}

			{/* Cozinhas participantes */}
			<ParticipatingKitchensCard kitchens={quantityEstimate.kitchens} />

			{/* Pesquisa automática de preços */}
			<BulkResearchBar eligibleCount={bulkEligibleCount} progress={bulkProgress} onRun={handleBulkResearch} />

			{/* Itens do anexo */}
			<QuantityEstimateItemsTable data={needs} onPesquisarPreco={(item) => setPriceResearchItem(item)} onUpdateDescription={handleDescriptionChange} />

			{annexRows.length > 0 && (
				<AnnexDocumentsCard
					unitId={unitIdStr as string}
					quantityEstimateId={quantityEstimate.id}
					rows={annexRows}
					isBudgetConfidential={Boolean(quantityEstimate.is_budget_confidential)}
					canEdit={can("unit", 2, { type: "unit", id: unitId })}
					onDownloadCsv={handleExportCSV}
				/>
			)}

			{annexSettings && annexRows.length > 0 && (
				<QuantityEstimateLimitsSection
					rows={annexRows}
					settings={annexSettings}
					editable={quantityEstimate.status === "draft"}
					onSettingsChange={(patch) => quantityEstimateId && updateQuantityLimits({ quantityEstimateId, ...patch })}
					onItemChange={handleItemLimitsChange}
				/>
			)}

			{/* ─── ARP & Empenhos ──────────────────────────────────────────── */}
			<ArpSection arp={arp} isArpLoading={isArpLoading} unitId={unitId} quantityEstimateId={quantityEstimateId} onOpenArpModal={() => setArpModalOpen(true)} />

			{/* Modal de busca de ARP */}
			{quantityEstimateId && (
				<ArpSearchModal
					open={arpModalOpen}
					onOpenChange={setArpModalOpen}
					quantityEstimateId={quantityEstimateId}
					unitId={unitId}
					defaultUasg={unitSettings?.uasg}
				/>
			)}

			{priceResearchItem?.catmat_item_codigo && (
				<PriceResearchModal
					open={priceResearchItem !== null}
					onOpenChange={(open) => {
						if (!open) setPriceResearchItem(null)
					}}
					catmatCode={priceResearchItem.catmat_item_codigo}
					catmatDescription={priceResearchItem.catmat_item_descricao}
					quantityEstimateId={quantityEstimateId}
					quantityEstimateItemId={priceResearchItem.quantity_estimate_item_id ?? undefined}
					targetUnit={annexItemUnit(priceResearchItem)}
					onApplyPrice={(price, auditIds) => handleApplyPrice(priceResearchItem, price, auditIds)}
				/>
			)}
		</div>
	)
}
