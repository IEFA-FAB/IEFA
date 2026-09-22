import { Loader2, XCircle } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { useCancelMySnackRequest } from "@/hooks/data/useSnackRequests"

interface CancelSnackRequestDialogProps {
	requestId: string
	missionDescription: string
	size?: "sm" | "default"
}

/**
 * Cancelamento pelo requisitante — só enquanto a produção não começou (`requesterCanCancel`).
 * O motivo é opcional para quem pede, mas vai para a linha do tempo que a cozinha lê.
 */
export function CancelSnackRequestDialog({ requestId, missionDescription, size = "sm" }: CancelSnackRequestDialogProps) {
	const [open, setOpen] = useState(false)
	const [reason, setReason] = useState("")
	const { mutate, isPending } = useCancelMySnackRequest()

	const confirm = () => {
		const trimmed = reason.trim()
		mutate(
			{ requestId, reason: trimmed ? trimmed : undefined },
			{
				onSuccess: () => {
					setOpen(false)
					setReason("")
				},
			}
		)
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				render={
					<Button variant="outline" size={size} disabled={isPending}>
						<XCircle className="size-4" aria-hidden />
						Cancelar pedido
					</Button>
				}
			/>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Cancelar o pedido de lanche?</DialogTitle>
					<DialogDescription>
						{missionDescription ? `Missão: ${missionDescription}. ` : ""}A cozinha deixa de preparar os kits. Se a missão for remarcada, será preciso um pedido
						novo.
					</DialogDescription>
				</DialogHeader>
				<Field>
					<FieldLabel htmlFor={`cancel-reason-${requestId}`}>Motivo (opcional)</FieldLabel>
					<Textarea
						id={`cancel-reason-${requestId}`}
						value={reason}
						maxLength={500}
						onChange={(e) => setReason(e.target.value)}
						placeholder="Ex.: missão cancelada pelo comando"
					/>
					<FieldDescription>Fica registrado na linha do tempo do pedido.</FieldDescription>
				</Field>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
						Voltar
					</Button>
					<Button variant="destructive" onClick={confirm} disabled={isPending}>
						{isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
						Cancelar pedido
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
