import type { ProcurementAtaItem } from "@iefa/database/sisub"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { Archive, ArrowLeft, Download, Link2, Send } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { ArpSearchModal } from "@/components/features/local/arp/ArpSearchModal"
import { EmpenhoBalancePanel } from "@/components/features/local/arp/EmpenhoBalancePanel"
import { AtaItemsTable } from "@/components/features/local/ata/AtaItemsTable"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { useArpForAta } from "@/hooks/data/useArp"
import { useAtaDetails, useUpdateAtaStatus } from "@/hooks/data/useAta"
import { fetchUnitSettingsFn } from "@/server/unit-settings.fn"
import type { ProcurementNeed } from "@/services/ProcurementService"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/procurement/$ataId")({
	beforeLoad: ({ context }) => requirePermission(context, "unit", 1),
	component: AtaDetailPage,
	head: () => ({
		meta: [{ title: "Detalhes da Ata" }],
	}),
})

const STATUS_LABELS: Record<string, string> = {
	draft: "Rascunho",
	published: "Publicada",
	archived: "Arquivada",
}

const STATUS_VARIANTS: Record<string, "secondary" | "default" | "outline"> = {
	draft: "secondary",
	published: "default",
	archived: "outline",
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function ataItemToNeed(item: ProcurementAtaItem): ProcurementNeed {
	return {
		folder_id: item.folder_id,
		folder_description: item.folder_description,
		product_id: item.product_id || item.id,
		product_name: item.product_name,
		measure_unit: item.measure_unit,
		total_quantity: Number(item.total_quantity),
		catmat_item_codigo: item.catmat_item_codigo,
		catmat_item_descricao: item.catmat_item_descricao,
		unit_price: item.unit_price !== null ? Number(item.unit_price) : null,
		total_value: item.total_value !== null ? Number(item.total_value) : null,
	}
}

function AtaDetailPage() {
	const { unitId: unitIdStr, ataId } = useParams({ strict: false })
	const unitId = Number(unitIdStr)
	const [arpModalOpen, setArpModalOpen] = useState(false)

	const { data: ata, isLoading } = useAtaDetails(ataId || null)
	const { mutate: updateStatus, isPending: isUpdating } = useUpdateAtaStatus()
	const { data: arp, isLoading: isArpLoading } = useArpForAta(ataId || null)

	// UASG da unidade para pré-preencher o modal de busca
	const { data: unitSettings } = useQuery({
		queryKey: ["unit", "settings", unitId],
		queryFn: () => fetchUnitSettingsFn({ data: { unitId } }),
		enabled: Number.isFinite(unitId) && unitId > 0,
		staleTime: 10 * 60 * 1000,
	})

	const handleExportCSV = () => {
		if (!ata) return
		const headers = ["Categoria", "CATMAT", "Descrição CATMAT", "Produto", "Quantidade", "Unidade", "Preço Un.", "Total Est."]
		const rows = ata.items.map((item) => [
			item.folder_description || "Sem categoria",
			item.catmat_item_codigo || "",
			item.catmat_item_descricao || "",
			item.product_name,
			Number(item.total_quantity).toFixed(4),
			item.measure_unit || "UN",
			item.unit_price !== null ? Number(item.unit_price).toFixed(4) : "",
			item.total_value !== null ? Number(item.total_value).toFixed(2) : "",
		])
		const csv = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n")
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
		const link = document.createElement("a")
		link.href = URL.createObjectURL(blob)
		link.download = `ata-${ata.title}-${ata.created_at.split("T")[0]}.csv`
		link.click()
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
				<p className="text-muted-foreground">Ata não encontrada.</p>
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

	const needs = ata.items.map(ataItemToNeed)
	const grandTotal = ata.items.reduce((sum, item) => sum + (item.total_value !== null ? Number(item.total_value) : 0), 0)
	const hasPrices = ata.items.some((item) => item.total_value !== null)

	return (
		<div className="space-y-6">
			<PageHeader
				title={ata.title}
				description={`Criada em ${new Date(ata.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`}
			>
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						nativeButton={false}
						render={
							<Link to="/unit/$unitId/procurement" params={{ unitId: unitIdStr as string }}>
								<ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden="true" />
								Atas
							</Link>
						}
					/>
					<Button size="sm" variant="outline" onClick={handleExportCSV} className="gap-2">
						<Download className="h-4 w-4" aria-hidden="true" />
						Exportar CSV
					</Button>
					{ata.status === "draft" && (
						<Button size="sm" onClick={() => updateStatus({ ataId: ata.id, status: "published" })} disabled={isUpdating} className="gap-2">
							<Send className="h-4 w-4" aria-hidden="true" />
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
							<Archive className="h-4 w-4" aria-hidden="true" />
							Arquivar
						</Button>
					)}
				</div>
			</PageHeader>

			{/* Status + resumo */}
			<div className="flex items-center gap-3 flex-wrap">
				<Badge variant={STATUS_VARIANTS[ata.status] || "secondary"}>{STATUS_LABELS[ata.status] || ata.status}</Badge>
				{hasPrices && (
					<span className="text-sm text-muted-foreground">
						Total estimado: <strong className="text-foreground">{BRL.format(grandTotal)}</strong>
					</span>
				)}
				<span className="text-sm text-muted-foreground">
					{ata.items.length} {ata.items.length === 1 ? "item" : "itens"}
				</span>
			</div>

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
						<CardTitle className="text-sm font-semibold">Cozinhas Participantes</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{ata.kitchens.map((kitchenEntry) => (
								<div key={kitchenEntry.id}>
									<p className="text-sm font-medium">{kitchenEntry.kitchen.display_name || `Cozinha ${kitchenEntry.kitchen_id}`}</p>
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

			{/* Itens da Ata */}
			<AtaItemsTable data={needs} />

			{/* ─── ARP & Empenhos ──────────────────────────────────────────── */}
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-base font-semibold">ARP & Empenhos</h2>
						<p className="text-xs text-muted-foreground mt-0.5">
							Vincule a Ata de Registro de Preços do Compras.gov.br e registre os empenhos emitidos por item.
						</p>
					</div>
					{!arp && !isArpLoading && (
						<Button size="sm" variant="outline" className="gap-2" onClick={() => setArpModalOpen(true)}>
							<Link2 className="h-4 w-4" />
							Vincular ARP
						</Button>
					)}
				</div>

				{isArpLoading ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
						<Spinner className="h-4 w-4" />
						Verificando ARP vinculada...
					</div>
				) : arp && ataId ? (
					<>
						<div className="flex justify-end">
							<Button size="sm" variant="ghost" className="gap-2 text-xs" onClick={() => setArpModalOpen(true)}>
								<Link2 className="h-3.5 w-3.5" />
								Substituir ARP
							</Button>
						</div>
						<EmpenhoBalancePanel arp={arp} unitId={unitId} ataId={ataId} />
					</>
				) : (
					<Card>
						<CardContent className="py-10 text-center space-y-2">
							<p className="text-sm text-muted-foreground">Nenhuma ARP vinculada a esta ATA.</p>
							<p className="text-xs text-muted-foreground">
								Clique em <strong>Vincular ARP</strong> para buscar e importar a Ata de Registro de Preços correspondente no Compras.gov.br.
							</p>
						</CardContent>
					</Card>
				)}
			</div>

			{/* Modal de busca de ARP */}
			{ataId && <ArpSearchModal open={arpModalOpen} onOpenChange={setArpModalOpen} ataId={ataId} unitId={unitId} defaultUasg={unitSettings?.uasg} />}
		</div>
	)
}
