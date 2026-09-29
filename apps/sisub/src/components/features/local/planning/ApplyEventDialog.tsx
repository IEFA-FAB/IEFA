import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarPlus, Loader2, Plus, X } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useApplyEventTemplate, useTemplate } from "@/hooks/data/useTemplates"
import { hasInvalidHeadcount, occasionHeadcountDraft, occasionHeadcountRows, occasionHeadcountsPayload } from "@/lib/apply-headcounts"
import { ApplyHeadcountFields, HEADCOUNT_PENDING_HINT } from "./ApplyHeadcountFields"

interface ApplyEventDialogProps {
	open: boolean
	onClose: () => void
	templateId: string
	templateName: string
	templateType: "event" | "apoio"
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
	// Efetivo por refeição (kits, no apoio): nasce com o do cardápio; no modelo global, vazio.
	const { data: template, isLoading: isTemplateLoading } = useTemplate(open ? templateId : null)
	const occasionMeals = template?.id === templateId ? template.event_meals : []
	const isGlobalTemplate = template?.id === templateId && template.kitchen_id == null
	const [headcountDraft, setHeadcountDraft] = useState<Record<string, string>>({})
	const [draftTemplateId, setDraftTemplateId] = useState<string | null>(null)
	// Preenche ao chegar o cardápio (ajuste durante o render, não em efeito).
	if (open && template?.id === templateId && draftTemplateId !== templateId) {
		setDraftTemplateId(templateId)
		setHeadcountDraft(occasionHeadcountDraft(template.event_meals, template.kitchen_id == null))
	}
	const isHeadcountInvalid = hasInvalidHeadcount(headcountDraft)

	const handleClose = () => {
		onClose()
		setDates([])
		setDraftDate("")
		setDraftTemplateId(null)
		setHeadcountDraft({})
	}

	const typeLabel = templateType === "event" ? "evento" : "apoio"

	const addDate = () => {
		if (!draftDate || dates.includes(draftDate)) return
		setDates([...dates, draftDate].toSorted())
		setDraftDate("")
	}

	const handleApply = () => {
		if (dates.length === 0 || isHeadcountInvalid) return
		applyEvent(
			{ templateId, kitchenId, dates, headcounts: occasionHeadcountsPayload(occasionMeals, headcountDraft) },
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
						planejamento rotineiro. Cada preparação entra com {templateType === "apoio" ? "os kits" : "o efetivo"} informado abaixo para a refeição dela.
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

					<ApplyHeadcountFields
						idPrefix="event-headcount"
						legend={templateType === "apoio" ? "Kits por refeição" : "Efetivo por refeição"}
						description={
							<>
								{isGlobalTemplate
									? `Modelo global: ele só tem as proporções. ${templateType === "apoio" ? "Os kits informados valem" : "O efetivo informado vale"} para todas as datas.`
									: `Vem ${templateType === "apoio" ? "com os kits" : "com o efetivo"} do ${typeLabel}; o que mudar aqui vale só nesta aplicação.`}{" "}
								{HEADCOUNT_PENDING_HINT}
							</>
						}
						rows={occasionHeadcountRows(occasionMeals)}
						draft={headcountDraft}
						onChange={(id, raw) => setHeadcountDraft((prev) => ({ ...prev, [id]: raw }))}
						unit={templateType === "apoio" ? "kits" : "comensais"}
						placeholderFor={() => "a definir"}
						isLoading={isTemplateLoading}
					/>

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
					<Button onClick={handleApply} disabled={dates.length === 0 || isPending || isHeadcountInvalid}>
						{isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <CalendarPlus className="size-4 mr-2" />}
						Aplicar ({dates.length})
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
