import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { PackagePlus, Truck } from "lucide-react"
import { useState } from "react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { ReceiptWithoutInvoiceDialog } from "@/components/features/storage/receiving/ReceiptWithoutInvoiceDialog"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { listNfeDocumentsFn } from "@/server/nfe.fn"
import { createReceiptFromNfeFn, listReceiptsFn } from "@/server/receiving.fn"

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/receiving/")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 1),
	loader: async ({ params }) => {
		const kitchenId = Number(params.kitchenId)
		const [receipts, nfeDocs] = await Promise.all([listReceiptsFn({ data: { kitchenId } }), listNfeDocumentsFn({ data: { kitchenId } })])
		return { receipts, nfeDocs }
	},
	component: ReceivingListPage,
})

const STATUS_LABEL: Record<string, { label: string; variant: "secondary" | "outline" | "destructive" }> = {
	draft: { label: "Rascunho", variant: "outline" },
	provisional: { label: "Provisório", variant: "outline" },
	definitive: { label: "Definitivo", variant: "secondary" },
	divergent: { label: "Divergente", variant: "destructive" },
	rejected: { label: "Rejeitado", variant: "destructive" },
}

/** Origem do recebimento na lista: a entrega sem nota precisa se distinguir da que veio com ela. */
const SOURCE_LABEL: Record<string, string> = {
	nfe: "NF-e",
	delivery_note: "Guia",
	ad_hoc: "Sem documento",
}

// TODO(db:types): regenerar os tipos após aplicar 20260926215000 e tirar este tipo local
type ReceiptListRow = {
	id: string
	status: string
	created_at: string
	definitive_at: string | null
	nfe_document_id: string | null
	source?: string | null
	delivery_note_number?: string | null
	supplier_name?: string | null
	rejected_at?: string | null
}

function ReceivingListPage() {
	const { receipts, nfeDocs } = Route.useLoaderData()
	const { kitchenId } = Route.useParams()
	const router = useRouter()
	const { can } = usePBAC()
	const [creating, setCreating] = useState<string | null>(null)
	const [withoutInvoice, setWithoutInvoice] = useState(false)
	const canReceive = can("storage", 2, { type: "kitchen", id: Number(kitchenId) })

	const receivedNfeIds = new Set(receipts.map((r: { nfe_document_id: string | null }) => r.nfe_document_id).filter(Boolean))
	const receivableNotes = nfeDocs.filter((doc) => !receivedNfeIds.has(doc.id))

	async function createFromNfe(nfeDocumentId: string) {
		setCreating(nfeDocumentId)
		try {
			const result = await createReceiptFromNfeFn({ data: { kitchenId: Number(kitchenId), nfeDocumentId } })
			toast.success(`Recebimento criado com ${result.itemsCount} itens${result.skipped > 0 ? ` (${result.skipped} sem vínculo, fora)` : ""}`)
			router.navigate({ to: "/storage/$kitchenId/receiving/$receiptId", params: { kitchenId, receiptId: result.receiptId } })
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao criar recebimento")
		} finally {
			setCreating(null)
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Recebimentos"
				description="Provisório → definitivo (Lei 14.133, art. 140). Só o definitivo movimenta o estoque e abate o saldo físico do empenho."
			>
				{canReceive && (
					<Button size="sm" variant="outline" onClick={() => setWithoutInvoice(true)}>
						<Truck data-icon="inline-start" aria-hidden="true" />
						Entrega sem NF-e
					</Button>
				)}
			</PageHeader>
			<ReceiptWithoutInvoiceDialog kitchenId={Number(kitchenId)} open={withoutInvoice} onOpenChange={setWithoutInvoice} />

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Notas aguardando recebimento</CardTitle>
				</CardHeader>
				<CardContent>
					{receivableNotes.length === 0 ? (
						<p className="text-sm text-muted-foreground py-4 text-center">Nenhuma NF-e importada aguardando recebimento.</p>
					) : (
						<div className="divide-y divide-border/50">
							{receivableNotes.map((doc) => (
								<div key={doc.id} className="flex items-center gap-3 py-2 text-xs">
									<span className="truncate">{doc.supplier_name ?? doc.access_key}</span>
									<Button
										size="sm"
										variant="outline"
										className="h-7 text-xs gap-1.5 ml-auto shrink-0"
										disabled={creating != null}
										onClick={() => createFromNfe(doc.id)}
									>
										{creating === doc.id ? <Spinner className="size-3" /> : <PackagePlus className="size-3.5" />}
										Iniciar recebimento
									</Button>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Histórico</CardTitle>
				</CardHeader>
				<CardContent>
					{receipts.length === 0 ? (
						<p className="text-sm text-muted-foreground py-4 text-center">Nenhum recebimento registrado.</p>
					) : (
						<div className="divide-y divide-border/50">
							{(receipts as ReceiptListRow[]).map((receipt) => {
								const meta = STATUS_LABEL[receipt.status] ?? STATUS_LABEL.draft
								const origin = [
									SOURCE_LABEL[receipt.source ?? "nfe"] ?? receipt.source,
									receipt.delivery_note_number,
									receipt.supplier_name,
									receipt.source !== "nfe" && receipt.source != null && !receipt.nfe_document_id ? "sem NF-e vinculada" : null,
								]
									.filter(Boolean)
									.join(" · ")
								return (
									<div key={receipt.id} className="flex items-center gap-3 py-2 text-xs">
										<Link
											to="/storage/$kitchenId/receiving/$receiptId"
											params={{ kitchenId, receiptId: receipt.id }}
											className="text-primary hover:underline"
											suppressHydrationWarning
										>
											{new Date(receipt.created_at).toLocaleString("pt-BR")}
										</Link>
										<span className="truncate text-caption text-muted-foreground">
											{origin}
											{receipt.rejected_at ? ` · recusado em ${new Date(receipt.rejected_at).toLocaleString("pt-BR")}` : ""}
										</span>
										<Badge variant={meta?.variant ?? "outline"} className="text-[10px] ml-auto">
											{meta?.label ?? receipt.status}
										</Badge>
									</div>
								)
							})}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
