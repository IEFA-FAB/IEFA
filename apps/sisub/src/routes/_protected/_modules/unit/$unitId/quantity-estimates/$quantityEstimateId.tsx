import { toBrasiliaCivilDate } from "@iefa/sisub-domain/civil-date"
import type { ProcurementNeed } from "@iefa/sisub-domain/types"
import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { AlertTriangle, Archive, ArrowLeft, Download, Link2, Lock, Search, Send } from "lucide-react"
import { useMemo, useState } from "react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { ArpSearchModal } from "@/components/features/local/arp/ArpSearchModal"
import { EmpenhoBalancePanel } from "@/components/features/local/arp/EmpenhoBalancePanel"
import { type PriceResearchAuditIds, PriceResearchModal } from "@/components/features/local/price-research/PriceResearchModal"
import { AnnexDocumentsCard } from "@/components/features/local/procurement/AnnexDocumentsCard"
import { QuantityEstimateItemsTable } from "@/components/features/local/quantity-estimate/QuantityEstimateItemsTable"
import {
	type QuantityEstimateItemLimitsPatch,
	QuantityEstimateLimitsSection,
} from "@/components/features/local/quantity-estimate/QuantityEstimateLimitsSection"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
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
import { annexItemUnit, buildAnnexCsv, buildDraftAnnexRows, buildSnapshotAnnexRows, type QuantityEstimateAnnexSettings } from "@/lib/quantity-estimate-annex"
import { quantityEstimateItemToNeed } from "@/lib/quantity-estimate-utils"
import { queryKeys } from "@/lib/query-keys"
import { updateQuantityEstimateItemPricesFn } from "@/server/quantity-estimate.fn"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/quantity-estimates/$quantityEstimateId")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	component: QuantityEstimateDetailPage,
})

const STATUS_LABELS: Record<string, string> = {
	draft: "Rascunho",
	completed: "Concluído",
	archived: "Arquivado",
}

const STATUS_VARIANTS: Record<string, "secondary" | "default" | "outline"> = {
	draft: "secondary",
	completed: "default",
	archived: "outline",
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

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

	const annexSettings = useMemo<QuantityEstimateAnnexSettings | null>(
		() =>
			quantityEstimate
				? {
						validityMonths: quantityEstimate.validity_months,
						maxIncreasePercent: quantityEstimate.max_increase_percent,
						maxQuantityJustification: quantityEstimate.max_quantity_justification,
						minQuotePercent: Number(quantityEstimate.min_quote_percent ?? 100),
					}
				: null,
		[quantityEstimate]
	)
	// Rascunho calcula na hora; concluído mostra o que o snapshot congelou — nunca recalcula
	// um documento concluído com a regra ou a conservação de hoje.
	const annexRows = useMemo(() => {
		if (!quantityEstimate || !annexSettings) return []
		if (quantityEstimate.status === "draft") return buildDraftAnnexRows(needs, annexSettings)
		return quantityEstimate.meta.snapshot ? buildSnapshotAnnexRows(quantityEstimate.meta.snapshot.components, quantityEstimate.items) : []
	}, [quantityEstimate, needs, annexSettings])

	const handleExportCSV = () => {
		if (!quantityEstimate) return
		downloadCsv(
			`anexo-quantitativos-${quantityEstimate.title}-${toBrasiliaCivilDate(quantityEstimate.created_at) ?? ""}.csv`,
			buildAnnexCsv(annexRows, quantityEstimate.max_quantity_justification, { confidential: Boolean(quantityEstimate.is_budget_confidential) })
		)
	}

	// A trava real é do servidor na conclusão; aqui só evita o clique que já sabemos que falha.
	const justificationMissing =
		quantityEstimate?.status === "draft" &&
		annexRows.some((r) => r.warnings.includes("increase_requires_justification")) &&
		!quantityEstimate.max_quantity_justification?.trim()

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

	const hasPrices = quantityEstimate.items.some((item) => item.unit_price !== null)
	const grandTotal = quantityEstimate.items.reduce(
		(sum, item) => sum + (item.unit_price !== null ? Number(item.estimated_quantity) * Number(item.unit_price) : 0),
		0
	)

	return (
		<div className="space-y-6">
			<PageHeader
				title={quantityEstimate.title}
				description={`Criado em ${new Date(quantityEstimate.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`}
			>
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						nativeButton={false}
						render={
							<Link to="/unit/$unitId/quantity-estimates" params={{ unitId: unitIdStr as string }}>
								<ArrowLeft className="size-4 mr-1.5" aria-hidden="true" />
								Anexos
							</Link>
						}
					/>
					<Button size="sm" variant="outline" onClick={handleExportCSV} className="gap-2">
						<Download className="size-4" aria-hidden="true" />
						Exportar CSV
					</Button>
					{quantityEstimate.status === "draft" && (
						<Button
							size="sm"
							onClick={() => updateStatus({ quantityEstimateId: quantityEstimate.id, status: "completed" })}
							disabled={isUpdating || justificationMissing}
							title={justificationMissing ? "Preencha a justificativa da quantidade máxima nos limites de quantidade" : undefined}
							className="gap-2"
						>
							<Send className="size-4" aria-hidden="true" />
							Concluir anexo
						</Button>
					)}
					{quantityEstimate.status === "completed" && (
						<Button
							size="sm"
							variant="outline"
							onClick={() => updateStatus({ quantityEstimateId: quantityEstimate.id, status: "archived" })}
							disabled={isUpdating}
							className="gap-2 text-muted-foreground"
						>
							<Archive className="size-4" aria-hidden="true" />
							Arquivar
						</Button>
					)}
				</div>
			</PageHeader>

			{/* Status + resumo */}
			<div className="flex items-center gap-3 flex-wrap">
				<Badge variant={STATUS_VARIANTS[quantityEstimate.status] || "secondary"}>{STATUS_LABELS[quantityEstimate.status] || quantityEstimate.status}</Badge>
				{quantityEstimate.status !== "draft" && quantityEstimate.meta.snapshot && (
					<Badge variant="outline" className="gap-1.5">
						<Lock className="size-3" aria-hidden="true" />
						Composição congelada
					</Badge>
				)}
				{quantityEstimate.meta.price_research.is_expired && (
					<Badge
						variant="outline"
						className="gap-1.5 border-warning/50 text-warning"
						title={`Política interna: pesquisa com mais de ${quantityEstimate.meta.price_research.validity_days} dias deve ser refeita antes de divulgar o edital. Os preços do sistema oficial são de contratações de até 1 ano antes da pesquisa.`}
					>
						<AlertTriangle className="size-3" aria-hidden="true" />
						Pesquisa feita há mais de {quantityEstimate.meta.price_research.validity_days} dias
					</Badge>
				)}
				{hasPrices && (
					<span className="text-sm text-muted-foreground">
						Total estimado: <strong className="text-foreground">{BRL.format(grandTotal)}</strong>
					</span>
				)}
				<span className="text-sm text-muted-foreground">
					{quantityEstimate.items.length} {quantityEstimate.items.length === 1 ? "item" : "itens"}
				</span>
			</div>

			{quantityEstimate.status === "draft" && quantityEstimate.meta.is_stale && (
				<Card className="border-warning/30 bg-warning/10">
					<CardContent className="flex items-start gap-3 py-4">
						<AlertTriangle className="size-5 shrink-0 text-warning" aria-hidden="true" />
						<div className="text-sm">
							<p className="font-medium text-foreground">Quantitativos desatualizados</p>
							<p className="text-foreground">
								Um cardápio ou evento deste anexo foi editado após o último cálculo. Refaça o cálculo dos quantitativos para refletir a composição atual antes
								de concluir.
							</p>
						</div>
					</CardContent>
				</Card>
			)}

			{quantityEstimate.notes && (
				<Card>
					<CardContent className="pt-4 pb-4">
						<p className="text-sm text-muted-foreground whitespace-pre-wrap">{quantityEstimate.notes}</p>
					</CardContent>
				</Card>
			)}

			{/* Cozinhas participantes */}
			{quantityEstimate.kitchens.length > 0 && (
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-subheading">Cozinhas Participantes</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{quantityEstimate.kitchens.map((kitchenEntry) => (
								<div key={kitchenEntry.id}>
									<p className="text-subheading">{kitchenEntry.kitchen.display_name || `Cozinha ${kitchenEntry.kitchen_id}`}</p>
									{kitchenEntry.delivery_notes && <p className="text-xs text-muted-foreground mt-0.5">{kitchenEntry.delivery_notes}</p>}
									<div className="flex flex-wrap gap-1.5 mt-2">
										{kitchenEntry.selections.map((sel) => (
											<Badge key={sel.id} variant="secondary" className="text-xs font-normal">
												{sel.template.name} × {sel.repetitions}
											</Badge>
										))}
									</div>
									<Separator className="mt-3" />
								</div>
							))}
						</div>
					</CardContent>
				</Card>
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
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-heading">ARP & Empenhos</h2>
						<p className="text-xs text-muted-foreground mt-0.5">
							Depois da licitação homologada, vincule a Ata de Registro de Preços do Compras.gov.br e registre os empenhos emitidos por item.
						</p>
					</div>
					{!arp && !isArpLoading && (
						<Button size="sm" variant="outline" className="gap-2" onClick={() => setArpModalOpen(true)}>
							<Link2 className="size-4" />
							Vincular ARP
						</Button>
					)}
				</div>

				{isArpLoading ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
						<Spinner className="size-4" />
						Verificando ARP vinculada...
					</div>
				) : arp && quantityEstimateId ? (
					<>
						<div className="flex justify-end">
							<Button size="sm" variant="ghost" className="gap-2 text-xs" onClick={() => setArpModalOpen(true)}>
								<Link2 className="size-3.5" />
								Substituir ARP
							</Button>
						</div>
						<EmpenhoBalancePanel arp={arp} unitId={unitId} quantityEstimateId={quantityEstimateId} />
					</>
				) : (
					<Card>
						<CardContent className="py-10 text-center space-y-2">
							<p className="text-sm text-muted-foreground">Nenhuma ARP vinculada a este anexo.</p>
							<p className="text-xs text-muted-foreground">
								Clique em <strong>Vincular ARP</strong> para buscar e importar a Ata de Registro de Preços homologada no Compras.gov.br.
							</p>
						</CardContent>
					</Card>
				)}
			</div>

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
