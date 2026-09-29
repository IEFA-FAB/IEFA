import { AlertTriangle } from "lucide-react"
import { useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useReplaceDayWithTemplate } from "@/hooks/data/usePlanningAdjustments"
import { useApplyEventTemplate, useMenuTemplates, useTemplate } from "@/hooks/data/useTemplates"
import { hasInvalidHeadcount, occasionHeadcountDraft, occasionHeadcountRows, occasionHeadcountsPayload } from "@/lib/apply-headcounts"
import { ApplyHeadcountFields, OCCASION_HEADCOUNT_PENDING_HINT } from "./ApplyHeadcountFields"

/**
 * Põe um evento ou apoio NESTE dia, direto do agendamento — o evento que surgiu, a viagem que
 * apareceu hoje. `mode="replace"` é a contingência: o dia INTEIRO vira o cardápio escolhido
 * (faltou luz, faltou água), com o planejado indo para a lixeira.
 *
 * Padrão de lanche não aparece: ele entra na produção pelo aceite do pedido.
 */
export function DayOccasionDialog({
	open,
	onOpenChange,
	mode,
	kitchenId,
	date,
	dateLabel,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	mode: "add" | "replace"
	kitchenId: number
	/** yyyy-MM-dd */
	date: string
	dateLabel: string
}) {
	const { data: templates } = useMenuTemplates(kitchenId)
	const [templateId, setTemplateId] = useState("")
	const { mutate: applyEvent, isPending: isApplying } = useApplyEventTemplate()
	const { mutate: replaceDay, isPending: isReplacing } = useReplaceDayWithTemplate()
	// Efetivo por refeição digitado (texto do campo) e o cardápio de onde ele foi preenchido.
	const [headcountDraft, setHeadcountDraft] = useState<Record<string, string>>({})
	const [draftTemplateId, setDraftTemplateId] = useState<string | null>(null)

	useEffect(() => {
		if (open) {
			setTemplateId("")
			setDraftTemplateId(null)
			setHeadcountDraft({})
		}
	}, [open])

	const occasions = (templates ?? []).filter((t) => (t.template_type === "event" || t.template_type === "apoio") && t.snack_family == null)
	const events = occasions.filter((t) => t.template_type === "event")
	const apoios = occasions.filter((t) => t.template_type === "apoio")
	const selected = occasions.find((t) => t.id === templateId)
	const isReplace = mode === "replace"
	const isPending = isApplying || isReplacing

	// Efetivo por refeição (kits, no apoio), no "aplicar neste dia" e na troca do dia: nasce com o
	// do cardápio e fica vazio no modelo global.
	const { data: template, isLoading: isTemplateLoading } = useTemplate(templateId ? templateId : null)
	const templateReady = template != null && template.id === templateId
	const occasionMeals = templateReady ? template.event_meals : []
	const isGlobalTemplate = templateReady && template.kitchen_id == null
	const isApoio = selected?.template_type === "apoio"
	// Preenche ao chegar o cardápio escolhido (ajuste durante o render, não em efeito).
	if (templateReady && draftTemplateId !== templateId) {
		setDraftTemplateId(templateId)
		setHeadcountDraft(occasionHeadcountDraft(template.event_meals, template.kitchen_id == null))
	}
	const isHeadcountInvalid = hasInvalidHeadcount(headcountDraft)

	const submit = () => {
		if (!templateId || isHeadcountInvalid) return
		const done = { onSuccess: () => onOpenChange(false) }
		const headcounts = occasionHeadcountsPayload(occasionMeals, headcountDraft)
		if (isReplace) replaceDay({ kitchenId, date, templateId, headcounts }, done)
		else applyEvent({ kitchenId, templateId, dates: [date], headcounts }, done)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{isReplace ? "Trocar o cardápio do dia" : "Aplicar evento ou cardápio de apoio"}</DialogTitle>
					<DialogDescription className="capitalize">{dateLabel}</DialogDescription>
				</DialogHeader>

				{isReplace ? (
					<Alert variant="destructive">
						<AlertTriangle />
						<AlertTitle>O dia inteiro será trocado</AlertTitle>
						<AlertDescription>
							Tudo o que está planejado para este dia vai para a lixeira (dá para restaurar) e o cardápio escolhido entra no lugar. Produção de pedido de lanche
							aceito continua. Use para falta de luz, de água, pane de equipamento.
						</AlertDescription>
					</Alert>
				) : null}

				<Field>
					<FieldLabel htmlFor="day-occasion">{isReplace ? "Cardápio de contingência" : "Evento ou cardápio de apoio"}</FieldLabel>
					<Select value={templateId} onValueChange={(value) => setTemplateId(value ?? "")}>
						<SelectTrigger id="day-occasion">
							<SelectValue>{selected?.name ?? "Escolha…"}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{events.length > 0 && (
								<SelectGroup>
									<SelectLabel>Eventos</SelectLabel>
									{events.map((t) => (
										<SelectItem key={t.id} value={t.id}>
											{t.name}
											{t.kitchen_id == null ? " (modelo global)" : ""}
										</SelectItem>
									))}
								</SelectGroup>
							)}
							{apoios.length > 0 && (
								<SelectGroup>
									<SelectLabel>Cardápios de Apoio</SelectLabel>
									{apoios.map((t) => (
										<SelectItem key={t.id} value={t.id}>
											{t.name}
											{t.kitchen_id == null ? " (modelo global)" : ""}
										</SelectItem>
									))}
								</SelectGroup>
							)}
						</SelectContent>
					</Select>
					<FieldDescription>
						{isReplace
							? "Tenha um cardápio de apoio de contingência pronto (refeição fria, sem cocção) para escolher aqui na hora."
							: "Soma ao que o dia já tem, sem apagar a rotina. Aplicar de novo o mesmo cardápio não duplica."}
					</FieldDescription>
					{occasions.length === 0 && <p className="text-sm text-muted-foreground">Nenhum evento ou cardápio de apoio cadastrado para esta cozinha.</p>}
				</Field>

				{templateId && (
					<ApplyHeadcountFields
						idPrefix="day-occasion-headcount"
						legend={isApoio ? "Kits por refeição" : "Efetivo por refeição"}
						description={
							<>
								{isGlobalTemplate
									? "Modelo global: ele só tem as proporções."
									: `Vem ${isApoio ? "com os kits" : "com o efetivo"} do cardápio; o que mudar aqui vale só neste dia.`}{" "}
								{OCCASION_HEADCOUNT_PENDING_HINT}
							</>
						}
						rows={occasionHeadcountRows(occasionMeals)}
						draft={headcountDraft}
						onChange={(id, raw) => setHeadcountDraft((prev) => ({ ...prev, [id]: raw }))}
						unit={isApoio ? "kits" : "comensais"}
						placeholderFor={() => "a definir"}
						isLoading={isTemplateLoading}
					/>
				)}

				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
						Cancelar
					</Button>
					<Button type="button" variant={isReplace ? "destructive" : "default"} disabled={!templateId || isPending || isHeadcountInvalid} onClick={submit}>
						{isReplace ? "Trocar o dia" : "Aplicar neste dia"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
