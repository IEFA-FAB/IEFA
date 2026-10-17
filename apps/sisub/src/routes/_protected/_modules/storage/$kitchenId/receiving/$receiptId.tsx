import { isReceiptEditable } from "@iefa/sisub-domain"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { ArrowLeft, Printer } from "lucide-react"
import { useState } from "react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { FinalizeWithPendingCheckDialog, RefuseReceiptDialog } from "@/components/features/storage/receiving/ReceiptDecisionDialogs"
import { ReceiptDesignationNotice } from "@/components/features/storage/receiving/ReceiptDesignationNotice"
import {
	ConservationTally,
	DeferredInvoiceCheckAlert,
	FiscalPendingCard,
	type FiscalResolution,
	InvoiceProblemAlert,
	ReceiptPrintHeader,
	ReceiptStageActions,
	RejectedReceiptAlert,
} from "@/components/features/storage/receiving/ReceiptDetailSections"
import { ReceiptDocumentsCard } from "@/components/features/storage/receiving/ReceiptDocumentsCard"
import { ItemCard, type ReceiptItemRow } from "@/components/features/storage/receiving/ReceiptItemCard"
import {
	describeReceiptHeader,
	describeReceiptSource,
	isAwaitingDefinitive,
	resolveNeedsDesignation,
	tallyConservation,
} from "@/components/features/storage/receiving/receipt-detail"
import { ScanConference } from "@/components/features/storage/receiving/ScanConference"
import { scannerPropsFrom } from "@/components/features/storage/scan/ScanInput"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import {
	fetchReceiptContextFn,
	fetchReceiptFn,
	finalizeReceiptFn,
	listScanEventsFn,
	resolveFiscalPendingFn,
	setReceiptProvisionalFn,
} from "@/server/receiving.fn"
import { fetchScannerProfileFn } from "@/server/scanner.fn"

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/receiving/$receiptId")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 1),
	loader: async ({ params }) => {
		// o perfil calibrado do leitor vem junto: sem prefixo/sufixo/substituto do
		// GS, etiqueta GS1 lida nesta estação chega com lote e validade grudados
		const [receipt, scannerProfile, scanEvents, context] = await Promise.all([
			fetchReceiptFn({ data: { receiptId: params.receiptId } }),
			fetchScannerProfileFn({ data: { kitchenId: Number(params.kitchenId) } }),
			listScanEventsFn({ data: { receiptId: params.receiptId } }),
			// designação de quem olha, situação da nota e documentos ligados
			fetchReceiptContextFn({ data: { receiptId: params.receiptId } }),
		])
		return { receipt, scannerProfile, scanEvents, context }
	},
	component: ReceiptDetailPage,
})

function ReceiptDetailPage() {
	const { receipt, scannerProfile, scanEvents, context } = Route.useLoaderData()
	// A tela não tem número próprio; a listagem identifica o recebimento pela data de abertura
	useCrumbLabel(`Recebimento de ${new Date(receipt.created_at).toLocaleDateString("pt-BR")}`)
	const { kitchenId } = Route.useParams()
	const router = useRouter()
	const { can } = usePBAC()
	const [busy, setBusy] = useState(false)
	const [refusing, setRefusing] = useState(false)
	const [deferring, setDeferring] = useState(false)

	const items: ReceiptItemRow[] = receipt.items
	const editable = isReceiptEditable(receipt.status)
	const sourceText = describeReceiptSource(receipt)
	const kitchenScope = { type: "kitchen" as const, id: Number(kitchenId) }
	const canLink = can("storage", 2, kitchenScope)
	const canDecide = can("storage", 3, kitchenScope)
	const awaitingDefinitive = isAwaitingDefinitive(receipt)
	// A nota que a SEFAZ não confirmou ainda: o definitivo pode entrar com a consulta pendente.
	const invoiceBlocked = context.invoice?.problem != null
	const needsDesignation = resolveNeedsDesignation(receipt.status, awaitingDefinitive, context.designation)

	async function toProvisional() {
		setBusy(true)
		try {
			await setReceiptProvisionalFn({ data: { receiptId: receipt.id } })
			toast.success("Recebimento provisório registrado — estoque ainda não movimentado")
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha")
		} finally {
			setBusy(false)
		}
	}

	async function toDefinitive() {
		if (invoiceBlocked) {
			if (context.invoice?.cancelled || context.invoice?.refused) {
				toast.error(context.invoice.problem ?? "NF-e cancelada")
				return
			}
			setDeferring(true)
			return
		}
		setBusy(true)
		try {
			const result = await finalizeReceiptFn({ data: { receiptId: receipt.id } })
			toast.success(`Recebimento definitivo: ${result.movements} lote(s)/movimento(s) criados`)
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha na efetivação")
		} finally {
			setBusy(false)
		}
	}

	async function resolveFiscalPending(resolution: FiscalResolution, reference: string) {
		// trava os três botões enquanto viaja: duplo clique mandava duas resoluções
		setBusy(true)
		try {
			await resolveFiscalPendingFn({ data: { receiptId: receipt.id, resolution, reference } })
			toast.success("Pendência fiscal resolvida")
			await router.invalidate()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro ao resolver a pendência")
		} finally {
			setBusy(false)
		}
	}

	const conservationTally = tallyConservation(items)

	return (
		<div className="space-y-6">
			<div className="print:hidden">
				<PageHeader title="Conferência de Recebimento" description={describeReceiptHeader(receipt, sourceText)}>
					<Button variant="ghost" size="sm" render={<Link to="/storage/$kitchenId/receiving" params={{ kitchenId }} />} nativeButton={false}>
						<ArrowLeft className="size-4" />
						Voltar
					</Button>
					<Button variant="outline" size="sm" onClick={() => window.print()}>
						<Printer className="size-4" />
						Termo de Recebimento
					</Button>
					<ReceiptStageActions
						status={receipt.status}
						awaitingDefinitive={awaitingDefinitive}
						canRefuse={editable && canDecide}
						isInvoiceRefused={context.invoice?.refused === true}
						busy={busy}
						onProvisional={toProvisional}
						onDefinitive={toDefinitive}
						onRefuse={() => setRefusing(true)}
					/>
				</PageHeader>
			</div>

			{needsDesignation && (
				<ReceiptDesignationNotice
					stage={needsDesignation}
					unitId={context.unitId}
					canDesignate={context.canDesignate}
					empenhoId={receipt.empenho_id}
					onDesignated={() => router.invalidate()}
				/>
			)}

			{/* NF-e recusada com o recebimento aberto aparece já no rascunho: o próximo passo é concluir a recusa */}
			{(awaitingDefinitive || (editable && context.invoice?.refused)) && <InvoiceProblemAlert invoice={context.invoice} canRefuse={editable && canDecide} />}

			{receipt.status === "rejected" && receipt.notes && <RejectedReceiptAlert receipt={receipt} />}

			{receipt.invoice_check_deferred_at && (
				<DeferredInvoiceCheckAlert deferredAt={receipt.invoice_check_deferred_at} reason={receipt.invoice_check_deferred_reason} />
			)}

			{receipt.status !== "rejected" && (
				<ReceiptDocumentsCard
					receiptId={receipt.id}
					kitchenId={Number(kitchenId)}
					source={context.source}
					supplier={{ name: receipt.supplier_name, document: receipt.supplier_document }}
					documents={{ nfe: context.invoice, supplyOrder: context.supplyOrder, empenho: context.empenho, liquidated: context.liquidated }}
					invoiceExpected={receipt.invoice_expected}
					canLink={canLink}
					onLinked={() => router.invalidate()}
				/>
			)}

			<RefuseReceiptDialog receiptId={receipt.id} open={refusing} onOpenChange={setRefusing} onDone={() => router.invalidate()} />
			{context.invoice?.problem && !context.invoice.cancelled && !context.invoice.refused && (
				<FinalizeWithPendingCheckDialog
					receiptId={receipt.id}
					problem={context.invoice.problem}
					open={deferring}
					onOpenChange={setDeferring}
					onDone={(movements) => {
						toast.success(`Recebimento definitivo com a consulta da NF-e pendente: ${movements} lote(s)/movimento(s) criados`)
						router.invalidate()
					}}
				/>
			)}

			{/* Cabeçalho do termo (só na impressão) */}
			<ReceiptPrintHeader receipt={receipt} sourceText={sourceText} />

			<ConservationTally tally={conservationTally} />

			<ScanConference
				receiptId={receipt.id}
				editable={editable}
				lines={items.map((item) => ({
					id: item.id,
					description: item.description,
					measure_unit: item.measure_unit,
					invoiced_qty_base: item.invoiced_qty_base,
					received_qty_base: item.received_qty_base,
					divergence_reason: item.divergence_reason,
				}))}
				events={scanEvents as never[]}
				scannerProps={scannerPropsFrom(scannerProfile)}
			/>

			{receipt.fiscal_pending && <FiscalPendingCard pendingValue={receipt.fiscal_pending_value} busy={busy} onResolve={resolveFiscalPending} />}

			<div className="space-y-4">
				{items.map((item) => (
					// A chave leva a quantidade: o cartão guarda a quantidade em estado local, e
					// depois de uma leitura ele seguia mostrando — e "Salvar" regravava — o número
					// de antes, apagando o que a leitura contou.
					<ItemCard key={`${item.id}:${item.received_qty_base}`} item={item} editable={editable} onSaved={() => router.invalidate()} />
				))}
			</div>
		</div>
	)
}
