import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { DEFERRAL_REASON_MIN_LENGTH } from "@/lib/receipt-invoice-gate"
import { finalizeReceiptFn, refuseReceiptFn } from "@/server/receiving.fn"

/**
 * Recusa do recebimento inteiro (art. 140, § 1º): nada entra no estoque, e a decisão fica com
 * o motivo, quem e quando. Evento irreversível: ação nomeada, com confirmação.
 */
export function RefuseReceiptDialog({
	receiptId,
	open,
	onOpenChange,
	onDone,
}: {
	receiptId: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onDone: () => void
}) {
	const reasonId = useId()
	const [reason, setReason] = useState("")
	const [saving, setSaving] = useState(false)
	const valid = reason.trim().length >= 5

	async function refuse() {
		setSaving(true)
		try {
			await refuseReceiptFn({ data: { receiptId, reason: reason.trim() } })
			toast.success("Recebimento recusado. Nada entrou no estoque.")
			onOpenChange(false)
			onDone()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Não foi possível recusar")
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Recusar a entrega inteira</DialogTitle>
					<DialogDescription>
						Nada entra no estoque e o recebimento não sustenta liquidação. Para recusar só uma linha, use a recusa na conferência. Não se desfaz.
					</DialogDescription>
				</DialogHeader>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor={reasonId}>Motivo</FieldLabel>
						<Textarea
							id={reasonId}
							value={reason}
							maxLength={500}
							rows={3}
							placeholder="Carne fora da temperatura em todas as caixas; fornecedor avisado para nova entrega."
							onChange={(e) => setReason(e.target.value)}
						/>
						<FieldDescription>Vai no termo de recusa, com quem recusou e quando.</FieldDescription>
					</Field>
				</FieldGroup>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancelar
					</Button>
					<Button variant="destructive" disabled={!valid || saving} onClick={refuse}>
						{saving && <Spinner data-icon="inline-start" />}
						Recusar recebimento
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

/**
 * Efetivar com a consulta da NF-e pendente: a SEFAZ está fora do ar e a carne está na porta.
 * O estoque entra; a pendência fica registrada, e a liquidação continua exigindo a consulta.
 */
export function FinalizeWithPendingCheckDialog({
	receiptId,
	problem,
	open,
	onOpenChange,
	onDone,
}: {
	receiptId: string
	problem: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onDone: (movements: number) => void
}) {
	const reasonId = useId()
	const [reason, setReason] = useState("")
	const [saving, setSaving] = useState(false)
	const valid = reason.trim().length >= DEFERRAL_REASON_MIN_LENGTH

	async function finalize() {
		setSaving(true)
		try {
			const result = await finalizeReceiptFn({ data: { receiptId, invoiceCheckDeferral: { reason: reason.trim() } } })
			onOpenChange(false)
			onDone(result.movements)
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Falha na efetivação")
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Efetivar com a consulta da NF-e pendente</DialogTitle>
					<DialogDescription>{problem}</DialogDescription>
				</DialogHeader>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor={reasonId}>Por que a consulta não pôde ser feita</FieldLabel>
						<Textarea
							id={reasonId}
							value={reason}
							maxLength={300}
							rows={2}
							placeholder="Portal da SEFAZ fora do ar desde as 10h"
							onChange={(e) => setReason(e.target.value)}
						/>
						<FieldDescription>
							O estoque entra agora. A pendência aparece em "A caminho" até a consulta ser registrada, e a liquidação continua exigindo a consulta recente.
						</FieldDescription>
					</Field>
				</FieldGroup>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancelar
					</Button>
					<Button disabled={!valid || saving} onClick={finalize}>
						{saving && <Spinner data-icon="inline-start" />}
						Efetivar com pendência
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
