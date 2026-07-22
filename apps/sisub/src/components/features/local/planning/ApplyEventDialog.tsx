import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarPlus, Loader2, Plus, X } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useApplyEventTemplate } from "@/hooks/data/useTemplates"

interface ApplyEventDialogProps {
	open: boolean
	onClose: () => void
	templateId: string
	templateName: string
	templateType: "event" | "exception"
	kitchenId: number
}

/** Parse "YYYY-MM-DD" como data no fuso local (evita o shift UTC do `new Date(str)`). */
function parseLocalDate(dateStr: string): Date {
	const [y, m, d] = dateStr.split("-").map(Number)
	return new Date(y, m - 1, d)
}

/**
 * Materializa um evento/exceção em datas concretas do calendário de produção.
 * Aditivo: soma as preparações ao cardápio existente do dia, sem substituir a rotina.
 */
export function ApplyEventDialog({ open, onClose, templateId, templateName, templateType, kitchenId }: ApplyEventDialogProps) {
	const { mutate: applyEvent, isPending } = useApplyEventTemplate()
	const [draftDate, setDraftDate] = useState("")
	const [dates, setDates] = useState<string[]>([])

	const handleClose = () => {
		onClose()
		setDates([])
		setDraftDate("")
	}

	const typeLabel = templateType === "event" ? "evento" : "exceção"

	const addDate = () => {
		if (!draftDate || dates.includes(draftDate)) return
		setDates([...dates, draftDate].toSorted())
		setDraftDate("")
	}

	const handleApply = () => {
		if (dates.length === 0) return
		applyEvent(
			{ templateId, kitchenId, dates },
			{
				onSuccess: () => handleClose(),
			}
		)
	}

	return (
		<Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Aplicar ao Calendário</DialogTitle>
					<DialogDescription>
						As preparações de <span className="text-foreground">{templateName}</span> serão somadas ao cardápio dos dias escolhidos, sem substituir o
						planejamento rotineiro. Cada preparação entra com o efetivo definido no {typeLabel}.
					</DialogDescription>
				</DialogHeader>

				<div className="py-4 space-y-4">
					<div className="space-y-2">
						<Label htmlFor="event-date" className="text-subheading">
							Datas de produção
						</Label>
						<div className="flex gap-2">
							<Input id="event-date" type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} className="flex-1" />
							<Button variant="outline" onClick={addDate} disabled={!draftDate || dates.includes(draftDate)}>
								<Plus className="size-4" />
								Adicionar
							</Button>
						</div>
					</div>

					{dates.length > 0 ? (
						<div className="flex flex-wrap gap-1.5">
							{dates.map((d) => (
								<Badge key={d} variant="outline" className="gap-1 pr-1">
									{format(parseLocalDate(d), "dd/MM/yyyy (EEE)", { locale: ptBR })}
									<button
										type="button"
										aria-label={`Remover ${d}`}
										className="rounded-sm hover:bg-accent p-0.5"
										onClick={() => setDates(dates.filter((x) => x !== d))}
									>
										<X className="size-3" />
									</button>
								</Badge>
							))}
						</div>
					) : (
						<p className="text-sm text-muted-foreground">Nenhuma data adicionada ainda.</p>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={handleClose}>
						Cancelar
					</Button>
					<Button onClick={handleApply} disabled={dates.length === 0 || isPending}>
						{isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <CalendarPlus className="size-4 mr-2" />}
						Aplicar ({dates.length})
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
