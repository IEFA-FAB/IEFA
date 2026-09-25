import type { ProcurementNeed } from "@iefa/sisub-domain/types"
import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { AlertTriangle, Archive, ArrowLeft, Download, Link2, Lock, Search, Send } from "lucide-react"
import { useMemo, useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { ArpSearchModal } from "@/components/features/local/arp/ArpSearchModal"
import { EmpenhoBalancePanel } from "@/components/features/local/arp/EmpenhoBalancePanel"
import { AtaItemsTable } from "@/components/features/local/ata/AtaItemsTable"
import { type AtaItemLimitsPatch, AtaQuantityLimitsSection } from "@/components/features/local/ata/AtaQuantityLimitsSection"
import { type PriceResearchAuditIds, PriceResearchModal } from "@/components/features/local/price-research/PriceResearchModal"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { useArpForAta } from "@/hooks/data/useArp"
import { useAtaDetails, useUpdateAtaItemDescription, useUpdateAtaQuantityLimits, useUpdateAtaStatus } from "@/hooks/data/useAta"
import { useBulkPriceResearch } from "@/hooks/data/useBulkPriceResearch"
import { useUnitSettings } from "@/hooks/data/useUnitSettings"
import { type AtaAnnexSettings, buildAnnexCsv, buildDraftAnnexRows, buildSnapshotAnnexRows, downloadCsv } from "@/lib/ata-annex"
import { ataItemToNeed } from "@/lib/ata-utils"
import { queryKeys } from "@/lib/query-keys"
import { updateAtaItemPricesFn } from "@/server/ata.fn"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/procurement/$ataId")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	component: AtaDetailPage,
})

const STATUS_LABELS: Record<string, string> = {
	draft: "Rascunho",
	published: "Publicado",
	archived: "Arquivado",
}

const STATUS_VARIANTS: Record<string, "secondary" | "default" | "outline"> = {
	draft: "secondary",
	published: "default",
	archived: "outline",
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function AtaDetailPage() {
	const { unitId: unitIdStr, ataId } = useParams({ strict: false })
	const unitId = Number(unitIdStr)
	const [arpModalOpen, setArpModalOpen] = useState(false)
	const [priceResearchItem, setPriceResearchItem] = useState<ProcurementNeed | null>(null)

	const queryClient = useQueryClient()
	const { data: ata, isLoading } = useAtaDetails(ataId || null)
	useCrumbLabel(ata?.title)
	const { mutate: updateStatus, isPending: isUpdating } = useUpdateAtaStatus()
	const { mutate: updateItemDescription } = useUpdateAtaItemDescription()
	const { mutate: updateQuantityLimits } = useUpdateAtaQuantityLimits()
	const { data: arp, isLoading: isArpLoading } = useArpForAta(ataId || null)

	// UASG da unidade para pré-preencher o modal de busca
	const { data: unitSettings } = useUnitSettings(unitId)

	const handleDescriptionChange = (_ingredientId: string, ataItemId: string | null | undefined, description: string) => {
		if (!ataItemId || !ataId) return
		updateItemDescription({ ataId, ataItemId, description })
	}

	const needs = useMemo(() => ata?.items.map(ataItemToNeed) ?? [], [ata?.items])

	const annexSettings = useMemo<AtaAnnexSettings | null>(
		() => (ata ? { validityMonths: ata.validity_months, maxMarginPercent: ata.max_margin_percent, marginJustification: ata.margin_justification } : null),
		[ata]
	)
	// Rascunho calcula na hora; publicado mostra o que o snapshot congelou — nunca recalcula
	// um documento publicado com a regra ou a conservação de hoje.
	const annexRows = useMemo(() => {
		if (!ata || !annexSettings) return []
		if (ata.status === "draft") return buildDraftAnnexRows(needs, annexSettings)
		return ata.meta.snapshot ? buildSnapshotAnnexRows(ata.meta.snapshot.components, ata.items) : []
	}, [ata, needs, annexSettings])

	const handleExportCSV = () => {
		if (!ata) return
		downloadCsv(`anexo-quantitativos-${ata.title}-${ata.created_at.split("T")[0]}.csv`, buildAnnexCsv(annexRows, ata.margin_justification))
	}

	// A trava real é do servidor na publicação; aqui só evita o clique que já sabemos que falha.
	const justificationMissing =
		ata?.status === "draft" && annexRows.some((r) => r.warnings.includes("margin_requires_justification")) && !ata.margin_justification?.trim()

	const handleItemLimitsChange = (ataItemId: string, patch: AtaItemLimitsPatch) => {
		if (!ataId) return
		updateQuantityLimits({ ataId, items: [{ ataItemId, ...patch }] })
	}
	const {
		start: runBulkResearch,
		progress: bulkProgress,
		eligibleCount: bulkEligibleCount,
	} = useBulkPriceResearch(needs, ataId, async (result) => {
		if (!result.ataItemId || !ataId) return
		await updateAtaItemPricesFn({
			data: {
				ataId,
				updates: [{ ataItemId: result.ataItemId as string, price: result.price }],
				researchLinks: result.auditIds
					? [{ ataItemId: result.ataItemId as string, researchId: result.auditIds.researchId, researchItemId: result.auditIds.researchItemId }]
					: undefined,
			},
		})
	})

	// Aplicação manual de um preço vindo do modal (item único). O vínculo da memória
	// de cálculo já foi gravado pelo próprio modal via ataId/ataItemId; researchLinks
	// aqui é reforço para o caso de o item ter sido relinkado no meio do caminho.
	const handleApplyPrice = async (item: ProcurementNeed, price: number, auditIds: PriceResearchAuditIds | null) => {
		const ataItemId = item.ata_item_id
		if (!ataId || !ataItemId) return
		try {
			await updateAtaItemPricesFn({
				data: {
					ataId,
					updates: [{ ataItemId, price }],
					researchLinks: auditIds ? [{ ataItemId, researchId: auditIds.researchId, researchItemId: auditIds.researchItemId }] : undefined,
				},
			})
			queryClient.invalidateQueries({ queryKey: queryKeys.ata.details(ataId) })
			toast.success("Preço aplicado ao item.")
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Não foi possível aplicar o preço.")
		}
	}

	const handleBulkResearch = async () => {
		if (!ataId) return
		const results = await runBulkResearch()
		if (results.length === 0) return
		queryClient.invalidateQueries({ queryKey: queryKeys.ata.details(ataId) })
		toast.success(
			`${results.length} preço${results.length !== 1 ? "s" : ""} pesquisado${results.length !== 1 ? "s" : ""} e aplicado${results.length !== 1 ? "s" : ""}.`
		)
	}

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div className="h-16 animate-pulse rounded bg-muted" />
				<div className="h-64 animate-pulse rounded bg-muted" />
			</div>
		)
	}

	if (!ata) {
		return (
			<div className="py-12 text-center">
				<p className="text-muted-foreground">Anexo quantitativo não encontrado.</p>
				<Button
					variant="outline"
					size="sm"
					className="mt-4"
					nativeButton={false}
					render={
						<Link to="/unit/$unitId/procurement" params={{ unitId: unitIdStr as string }}>
							Voltar
						</Link>
					}
				/>
			</div>
		)
	}

	const hasPrices = ata.items.some((item) => item.unit_price !== null)
	const grandTotal = ata.items.reduce((sum, item) => sum + (item.unit_price !== null ? Number(item.total_quantity) * Number(item.unit_price) : 0), 0)

	return (
		<div className="space-y-6">
			<PageHeader
				title={ata.title}
				description={`Criado em ${new Date(ata.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`}
			>
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						nativeButton={false}
						render={
							<Link to="/unit/$unitId/procurement" params={{ unitId: unitIdStr as string }}>
								<ArrowLeft className="size-4 mr-1.5" aria-hidden="true" />
								Anexos
							</Link>
						}
					/>
					<Button size="sm" variant="outline" onClick={handleExportCSV} className="gap-2">
						<Download className="size-4" aria-hidden="true" />
						Exportar CSV
					</Button>
					{ata.status === "draft" && (
						<Button
							size="sm"
							onClick={() => updateStatus({ ataId: ata.id, status: "published" })}
							disabled={isUpdating || justificationMissing}
							title={justificationMissing ? "Preencha a justificativa da margem nos limites de quantidade" : undefined}
							className="gap-2"
						>
							<Send className="size-4" aria-hidden="true" />
							Publicar
						</Button>
					)}
					{ata.status === "published" && (
						<Button
							size="sm"
							variant="outline"
							onClick={() => updateStatus({ ataId: ata.id, status: "archived" })}
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
				<Badge variant={STATUS_VARIANTS[ata.status] || "secondary"}>{STATUS_LABELS[ata.status] || ata.status}</Badge>
				{ata.status !== "draft" && ata.meta.snapshot && (
					<Badge variant="outline" className="gap-1.5">
						<Lock className="size-3" aria-hidden="true" />
						Composição congelada
					</Badge>
				)}
				{ata.meta.price_research.is_expired && (
					<Badge variant="outline" className="gap-1.5 border-warning/50 text-warning">
						<AlertTriangle className="size-3" aria-hidden="true" />
						Pesquisa vencida (&gt; {ata.meta.price_research.validity_days}d)
					</Badge>
				)}
				{hasPrices && (
					<span className="text-sm text-muted-foreground">
						Total estimado: <strong className="text-foreground">{BRL.format(grandTotal)}</strong>
					</span>
				)}
				<span className="text-sm text-muted-foreground">
					{ata.items.length} {ata.items.length === 1 ? "item" : "itens"}
				</span>
			</div>

			{ata.status === "draft" && ata.meta.is_stale && (
				<Card className="border-warning/30 bg-warning/10">
					<CardContent className="flex items-start gap-3 py-4">
						<AlertTriangle className="size-5 shrink-0 text-warning" aria-hidden="true" />
						<div className="text-sm">
							<p className="font-medium text-foreground">Quantitativos desatualizados</p>
							<p className="text-foreground">
								Um cardápio ou evento deste anexo foi editado após o último cálculo. Refaça o cálculo dos quantitativos para refletir a composição atual antes
								de publicar.
							</p>
						</div>
					</CardContent>
				</Card>
			)}

			{ata.notes && (
				<Card>
					<CardContent className="pt-4 pb-4">
						<p className="text-sm text-muted-foreground whitespace-pre-wrap">{ata.notes}</p>
					</CardContent>
				</Card>
			)}

			{/* Cozinhas participantes */}
			{ata.kitchens.length > 0 && (
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-subheading">Cozinhas Participantes</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{ata.kitchens.map((kitchenEntry) => (
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
			<AtaItemsTable data={needs} onPesquisarPreco={(item) => setPriceResearchItem(item)} onUpdateDescription={handleDescriptionChange} />

			{annexSettings && annexRows.length > 0 && (
				<AtaQuantityLimitsSection
					rows={annexRows}
					settings={annexSettings}
					editable={ata.status === "draft"}
					onSettingsChange={(patch) => ataId && updateQuantityLimits({ ataId, ...patch })}
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
				) : arp && ataId ? (
					<>
						<div className="flex justify-end">
							<Button size="sm" variant="ghost" className="gap-2 text-xs" onClick={() => setArpModalOpen(true)}>
								<Link2 className="size-3.5" />
								Substituir ARP
							</Button>
						</div>
						<EmpenhoBalancePanel arp={arp} unitId={unitId} ataId={ataId} />
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
			{ataId && <ArpSearchModal open={arpModalOpen} onOpenChange={setArpModalOpen} ataId={ataId} unitId={unitId} defaultUasg={unitSettings?.uasg} />}

			{priceResearchItem?.catmat_item_codigo && (
				<PriceResearchModal
					open={priceResearchItem !== null}
					onOpenChange={(open) => {
						if (!open) setPriceResearchItem(null)
					}}
					catmatCode={priceResearchItem.catmat_item_codigo}
					catmatDescription={priceResearchItem.catmat_item_descricao}
					ataId={ataId}
					ataItemId={priceResearchItem.ata_item_id ?? undefined}
					onApplyPrice={(price, auditIds) => handleApplyPrice(priceResearchItem, price, auditIds)}
				/>
			)}
		</div>
	)
}
