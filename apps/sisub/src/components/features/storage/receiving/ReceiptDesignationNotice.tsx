import { DEFINITIVE_RECEIPT_ROLES, designationMissingMessage, PROVISIONAL_RECEIPT_ROLES, type ReceiptStage } from "@iefa/sisub-domain"
import { UserPlus, UserX } from "lucide-react"
import { useState } from "react"
import { DesignationForm } from "@/components/features/unit/designations/DesignationForm"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/**
 * Falta designação para o próximo ato do recebimento. A conferência física já está registrada
 * e fica; o que espera é a confirmação (provisório, art. 140, II, a) ou a efetivação
 * (definitivo, alínea b). Quem tem `unit:2` designa ali mesmo; os demais leem quem designa.
 */
export function ReceiptDesignationNotice({
	stage,
	unitId,
	canDesignate,
	empenhoId,
	onDesignated,
}: {
	stage: ReceiptStage
	unitId: number
	canDesignate: boolean
	empenhoId: string | null
	onDesignated: () => void
}) {
	const [open, setOpen] = useState(false)
	return (
		<Alert className="print:hidden">
			<UserX aria-hidden="true" />
			<AlertTitle>{stage === "provisional" ? "Sem fiscal designado para esta entrega" : "Sem gestor ou comissão designada para o definitivo"}</AlertTitle>
			<AlertDescription>{designationMissingMessage(stage, canDesignate)}</AlertDescription>
			{canDesignate && (
				<AlertAction>
					<Button size="sm" onClick={() => setOpen(true)}>
						<UserPlus data-icon="inline-start" aria-hidden="true" />
						Designar agora
					</Button>
				</AlertAction>
			)}
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Designar agora</DialogTitle>
						<DialogDescription>
							Registre o ato que designou {stage === "provisional" ? "o fiscal" : "o gestor ou a comissão"}. Depois de gravar, confirme o recebimento — a
							conferência não é refeita.
						</DialogDescription>
					</DialogHeader>
					<DesignationForm
						unitId={unitId}
						preset={{
							roles: stage === "provisional" ? PROVISIONAL_RECEIPT_ROLES : DEFINITIVE_RECEIPT_ROLES,
							role: stage === "provisional" ? "fiscal_tecnico" : "gestor",
							empenhoId,
						}}
						onSaved={() => {
							setOpen(false)
							onDesignated()
						}}
					/>
				</DialogContent>
			</Dialog>
		</Alert>
	)
}
