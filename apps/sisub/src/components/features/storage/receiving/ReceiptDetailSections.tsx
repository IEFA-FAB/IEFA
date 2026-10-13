/**
 * Partes de apresentação da conferência de recebimento (`storage/$kitchenId/receiving/$receiptId`).
 * O estado e as gravações ficam na página.
 */

import { CONSERVATION_LABELS, type ConservationClass } from "@iefa/sisub-domain"
import { Ban, CheckCheck, ClipboardCheck, TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { fetchReceiptContextFn, fetchReceiptFn } from "@/server/receiving.fn"
import { getReceiptPrintTitle } from "./receipt-detail"

type Receipt = Awaited<ReturnType<typeof fetchReceiptFn>>
type ReceiptContext = Awaited<ReturnType<typeof fetchReceiptContextFn>>

export type FiscalResolution = "return_nfe" | "replacement_nfe" | "glosa"

/** Ações de etapa do cabeçalho: provisório, efetivação e recusa. */
export function ReceiptStageActions({
	status,
	awaitingDefinitive,
	canRefuse,
	busy,
	onProvisional,
	onDefinitive,
	onRefuse,
}: {
	status: string
	awaitingDefinitive: boolean
	canRefuse: boolean
	busy: boolean
	onProvisional: () => void
	onDefinitive: () => void
	onRefuse: () => void
}) {
	return (
		<>
			{status === "draft" && (
				<Button size="sm" disabled={busy} onClick={onProvisional}>
					{busy ? <Spinner className="size-4" /> : <ClipboardCheck className="size-4" />}
					Recebimento provisório
				</Button>
			)}
			{/* Efetivação é única: recebimento `divergent` JÁ efetivado mostrava o botão, que sempre falhava */}
			{awaitingDefinitive && (
				<Button size="sm" disabled={busy} onClick={onDefinitive}>
					{busy ? <Spinner className="size-4" /> : <CheckCheck className="size-4" />}
					Efetivar definitivo
				</Button>
			)}
			{canRefuse && (
				<Button size="sm" variant="destructive" disabled={busy} onClick={onRefuse}>
					<Ban data-icon="inline-start" aria-hidden="true" />
					Recusar entrega
				</Button>
			)}
		</>
	)
}

/** Consulta da NF-e com problema enquanto o definitivo não entrou. */
export function InvoiceProblemAlert({ invoice }: { invoice: ReceiptContext["invoice"] }) {
	if (!invoice?.problem) return null
	return (
		<Alert variant={invoice.cancelled ? "destructive" : "default"} className="print:hidden">
			<TriangleAlert aria-hidden="true" />
			<AlertTitle>{invoice.cancelled ? "NF-e cancelada na SEFAZ" : "Consulta da NF-e pendente"}</AlertTitle>
			<AlertDescription>
				{invoice.cancelled
					? `${invoice.problem}. Recuse a entrega ou peça a nota substituta ao fornecedor.`
					: `${invoice.problem}. Se a SEFAZ está fora do ar, efetive com a consulta pendente: o estoque entra agora e a liquidação continua exigindo a consulta.`}
			</AlertDescription>
		</Alert>
	)
}

export function RejectedReceiptAlert({ receipt }: { receipt: Receipt }) {
	return (
		<Alert variant="destructive">
			<Ban aria-hidden="true" />
			<AlertTitle>
				Entrega recusada{receipt.rejected_at ? ` em ${new Date(receipt.rejected_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}
			</AlertTitle>
			<AlertDescription>{receipt.notes}</AlertDescription>
		</Alert>
	)
}

export function DeferredInvoiceCheckAlert({ deferredAt, reason }: { deferredAt: string; reason: string | null }) {
	return (
		<Alert className="print:hidden">
			<TriangleAlert aria-hidden="true" />
			<AlertTitle>Efetivado com a consulta da NF-e pendente</AlertTitle>
			<AlertDescription>
				{`Em ${new Date(deferredAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}: ${reason ?? ""}. Registre a consulta na SEFAZ (NF-e) — sem ela, não há liquidação.`}
			</AlertDescription>
		</Alert>
	)
}

/** Cabeçalho do termo (só na impressão) */
export function ReceiptPrintHeader({ receipt, sourceText }: { receipt: Receipt; sourceText: string }) {
	return (
		<div className="hidden print:block">
			<h1 className="text-heading">{getReceiptPrintTitle(receipt.status)}</h1>
			<p className="text-xs">Recebimento {receipt.id}</p>
			<p className="text-caption">Origem: {sourceText}</p>
			{receipt.provisional_at && <p className="text-xs">Provisório em: {new Date(receipt.provisional_at).toLocaleString("pt-BR")}</p>}
			{receipt.definitive_at && <p className="text-xs">Definitivo em: {new Date(receipt.definitive_at).toLocaleString("pt-BR")}</p>}
			{receipt.rejected_at && <p className="text-xs">Recusado em: {new Date(receipt.rejected_at).toLocaleString("pt-BR")}</p>}
		</div>
	)
}

export function ConservationTally({ tally }: { tally: Record<string, number> }) {
	if (!(Object.keys(tally).length > 0)) return null
	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="text-caption text-muted-foreground">Conservação exigida nesta entrega:</span>
			{Object.entries(tally).map(([cls, count]) => (
				<Badge key={cls} variant="secondary">
					{CONSERVATION_LABELS[cls as ConservationClass]} · {count} item(ns)
				</Badge>
			))}
		</div>
	)
}

/** Chegou menos do que a nota faturou: a pendência se resolve por documento, não por edição. */
export function FiscalPendingCard({
	pendingValue,
	busy,
	onResolve,
}: {
	pendingValue: number | string | null
	busy: boolean
	onResolve: (resolution: FiscalResolution, reference: string) => Promise<void>
}) {
	return (
		<Card className="border-warning print:hidden">
			<CardContent className="space-y-2 pt-4">
				<p className="text-sm">
					<strong>Pendência fiscal:</strong> chegou menos do que a nota faturou
					{pendingValue != null && ` (R$ ${Number(pendingValue).toFixed(2)})`}. Carta de correção não altera quantidade nem valor — resolva com NF-e de
					devolução do fornecedor, nota substituta ou glosa registrada. Até lá, este recebimento não é liquidável.
				</p>
				<div className="flex flex-wrap gap-2">
					{(
						[
							["return_nfe", "NF-e de devolução"],
							["replacement_nfe", "Nota substituta"],
							["glosa", "Glosa"],
						] as const
					).map(([resolution, label]) => (
						<Button
							key={resolution}
							type="button"
							size="sm"
							variant="outline"
							disabled={busy}
							onClick={async () => {
								const reference = window.prompt(resolution === "glosa" ? "Referência da glosa (processo/documento)" : "Chave de acesso da NF-e (44 caracteres)")
								if (!reference) return
								await onResolve(resolution, reference)
							}}
						>
							{label}
						</Button>
					))}
				</div>
			</CardContent>
		</Card>
	)
}
