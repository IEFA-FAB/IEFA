import type { WorkforceNoteKind } from "@iefa/sisub-domain"
import { WORKFORCE_NOTE_KINDS } from "@iefa/sisub-domain"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import * as React from "react"
import { NOTE_KIND_LABELS } from "@/components/features/workforce/labels"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { addWorkforceNoteFn } from "@/server/workforce.fn"

interface AddWorkforceNoteDialogProps {
	surveyId: string
	ranchoId: number
	ranchoName: string
	queryKey: readonly unknown[]
}

/**
 * Registro de observação do rancho.
 *
 * O aviso sobre identificação nominal não é decorativo: a matriz de origem nomeava
 * militares e citava condição de saúde, dado pessoal sensível (LGPD art. 5º II). A
 * importação despersonalizou o histórico; o formulário existe para não reintroduzir
 * o problema pela porta da frente.
 */
export function AddWorkforceNoteDialog({ surveyId, ranchoId, ranchoName, queryKey }: AddWorkforceNoteDialogProps) {
	const queryClient = useQueryClient()
	const [open, setOpen] = React.useState(false)
	const [kind, setKind] = React.useState<WorkforceNoteKind>("leave")
	const [quantity, setQuantity] = React.useState("")
	const [detail, setDetail] = React.useState("")

	const add = useMutation({
		mutationFn: () =>
			addWorkforceNoteFn({
				data: { surveyId, ranchoId, kind, quantity: quantity.trim() === "" ? null : Number(quantity), detail: detail.trim() },
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey })
			setOpen(false)
			setQuantity("")
			setDetail("")
			toast.success("Observação registrada")
		},
		onError: (e: Error) => toast.error("Erro ao registrar", { description: e.message }),
	})

	function submit() {
		if (detail.trim() === "") {
			toast.error("Descreva a observação")
			return
		}
		const parsed = quantity.trim() === "" ? null : Number(quantity)
		if (parsed !== null && (!Number.isInteger(parsed) || parsed < 0)) {
			toast.error("Quantidade inválida", { description: "Use um número inteiro não negativo, ou deixe em branco." })
			return
		}
		add.mutate()
	}

	return (
		<>
			<Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
				<Plus className="size-3.5" aria-hidden="true" />
				Observação
			</Button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Observação — {ranchoName}</DialogTitle>
						<DialogDescription>Afastamento, desvio de função, terceirizado e critério de contagem entram aqui e afetam o efetivo disponível.</DialogDescription>
					</DialogHeader>

					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="note-kind">Tipo</FieldLabel>
							<Select value={kind} onValueChange={(v) => setKind(v as WorkforceNoteKind)}>
								<SelectTrigger id="note-kind">
									<SelectValue>{NOTE_KIND_LABELS[kind]}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{WORKFORCE_NOTE_KINDS.map((k) => (
										<SelectItem key={k} value={k}>
											{NOTE_KIND_LABELS[k]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldDescription>Afastamento e desvio de função descontam do efetivo disponível; os demais são contexto.</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor="note-quantity">Militares afetados</FieldLabel>
							<Input id="note-quantity" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Opcional" />
						</Field>

						<Field>
							<FieldLabel htmlFor="note-detail">Descrição</FieldLabel>
							<Input
								id="note-detail"
								value={detail}
								onChange={(e) => setDetail(e.target.value)}
								placeholder="Ex.: 2 militares afastados por licença-maternidade"
							/>
							<FieldDescription>Não identifique o militar pelo nome — descreva o fato e o quadro.</FieldDescription>
						</Field>
					</FieldGroup>

					<DialogFooter>
						<Button variant="outline" onClick={() => setOpen(false)}>
							Cancelar
						</Button>
						<Button disabled={add.isPending} onClick={submit}>
							Registrar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
