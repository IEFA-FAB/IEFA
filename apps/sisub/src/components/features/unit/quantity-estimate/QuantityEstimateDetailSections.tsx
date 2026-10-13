/**
 * Partes de apresentação do detalhe do anexo quantitativo
 * (`unit/$unitId/quantity-estimates/$quantityEstimateId`). Estado e gravações ficam na página.
 */

import { Link } from "@tanstack/react-router"
import { AlertTriangle, Archive, ArrowLeft, Download, Link2, Lock, Search, Send } from "lucide-react"
import { EmpenhoBalancePanel } from "@/components/features/local/arp/EmpenhoBalancePanel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import type { useArpForQuantityEstimate } from "@/hooks/data/useArp"
import type { useBulkPriceResearch } from "@/hooks/data/useBulkPriceResearch"
import type { QuantityEstimateWithDetails } from "@/types/domain/quantity-estimate"
import { BRL, STATUS_LABELS, STATUS_VARIANTS } from "./quantity-estimate-detail"

type Arp = NonNullable<ReturnType<typeof useArpForQuantityEstimate>["data"]>
type BulkProgress = ReturnType<typeof useBulkPriceResearch>["progress"]

/** Voltar, exportar e as transições de estado do anexo. */
export function QuantityEstimateHeaderActions({
	unitIdStr,
	status,
	isUpdating,
	justificationMissing,
	onExport,
	onComplete,
	onArchive,
}: {
	unitIdStr: string
	status: string
	isUpdating: boolean
	justificationMissing: boolean
	onExport: () => void
	onComplete: () => void
	onArchive: () => void
}) {
	return (
		<div className="flex items-center gap-2">
			<Button
				size="sm"
				variant="outline"
				nativeButton={false}
				render={
					<Link to="/unit/$unitId/quantity-estimates" params={{ unitId: unitIdStr }}>
						<ArrowLeft className="size-4 mr-1.5" aria-hidden="true" />
						Anexos
					</Link>
				}
			/>
			<Button size="sm" variant="outline" onClick={onExport}>
				<Download className="size-4" aria-hidden="true" />
				Exportar CSV
			</Button>
			{status === "draft" && (
				<Button
					size="sm"
					onClick={onComplete}
					disabled={isUpdating || justificationMissing}
					title={justificationMissing ? "Preencha a justificativa da quantidade máxima nos limites de quantidade" : undefined}
				>
					<Send className="size-4" aria-hidden="true" />
					Concluir anexo
				</Button>
			)}
			{status === "completed" && (
				<Button size="sm" variant="outline" onClick={onArchive} disabled={isUpdating} className="text-muted-foreground">
					<Archive className="size-4" aria-hidden="true" />
					Arquivar
				</Button>
			)}
		</div>
	)
}

/** Status + resumo */
export function QuantityEstimateStatusBar({
	quantityEstimate,
	hasPrices,
	grandTotal,
}: {
	quantityEstimate: QuantityEstimateWithDetails
	hasPrices: boolean
	grandTotal: number
}) {
	return (
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
	)
}

/** Rascunho com cardápio ou evento editado depois do último cálculo. */
export function StaleQuantitiesNotice({ quantityEstimate }: { quantityEstimate: QuantityEstimateWithDetails }) {
	if (!(quantityEstimate.status === "draft" && quantityEstimate.meta.is_stale)) return null
	return (
		<Card className="border-warning/30 bg-warning/10">
			<CardContent className="flex items-start gap-3 py-4">
				<AlertTriangle className="size-5 shrink-0 text-warning" aria-hidden="true" />
				<div className="text-sm">
					<p className="font-medium text-foreground">Quantitativos desatualizados</p>
					<p className="text-foreground">
						Um cardápio ou evento deste anexo foi editado após o último cálculo. Refaça o cálculo dos quantitativos para refletir a composição atual antes de
						concluir.
					</p>
				</div>
			</CardContent>
		</Card>
	)
}

/** Cozinhas participantes */
export function ParticipatingKitchensCard({ kitchens }: { kitchens: QuantityEstimateWithDetails["kitchens"] }) {
	if (!(kitchens.length > 0)) return null
	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle>Cozinhas Participantes</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					{kitchens.map((kitchenEntry) => (
						<div key={kitchenEntry.id}>
							<p className="text-subheading">{kitchenEntry.kitchen.display_name || `Cozinha ${kitchenEntry.kitchen_id}`}</p>
							{kitchenEntry.delivery_notes && <p className="text-xs text-muted-foreground mt-0.5">{kitchenEntry.delivery_notes}</p>}
							<div className="flex flex-wrap gap-1.5 mt-2">
								{kitchenEntry.selections.map((sel) => (
									<Badge key={sel.id} variant="secondary" className="font-normal">
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
	)
}

/** Pesquisa automática de preços */
export function BulkResearchBar({ eligibleCount, progress, onRun }: { eligibleCount: number; progress: BulkProgress; onRun: () => void }) {
	if (!(eligibleCount > 0)) return null
	return (
		<div className="flex items-center gap-3 flex-wrap">
			<Button variant="outline" onClick={onRun} disabled={progress.isRunning}>
				{progress.isRunning ? (
					<>
						<Spinner className="size-4" aria-hidden="true" />
						{progress.done}/{progress.total} itens...
					</>
				) : (
					<>
						<Search className="size-4" aria-hidden="true" />
						Pesquisar preços automaticamente ({eligibleCount})
					</>
				)}
			</Button>
			{!progress.isRunning && progress.total > 0 && (
				<span className="text-xs text-muted-foreground">
					{progress.done - progress.errors} preços aplicados
					{progress.errors > 0 && ` · ${progress.errors} sem resultado`}
				</span>
			)}
		</div>
	)
}

/** ARP & Empenhos */
export function ArpSection({
	arp,
	isArpLoading,
	unitId,
	quantityEstimateId,
	onOpenArpModal,
}: {
	arp: Arp | null | undefined
	isArpLoading: boolean
	unitId: number
	quantityEstimateId: string | undefined
	onOpenArpModal: () => void
}) {
	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-heading">ARP & Empenhos</h2>
					<p className="text-xs text-muted-foreground mt-0.5">
						Depois da licitação homologada, vincule a Ata de Registro de Preços do Compras.gov.br e registre os empenhos emitidos por item.
					</p>
				</div>
				{!arp && !isArpLoading && (
					<Button size="sm" variant="outline" onClick={onOpenArpModal}>
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
						<Button size="sm" variant="ghost" className="text-xs" onClick={onOpenArpModal}>
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
	)
}
