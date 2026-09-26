import { AlertTriangle } from "lucide-react"
import { useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useReplaceDayWithTemplate } from "@/hooks/data/usePlanningAdjustments"
import { useApplyEventTemplate, useMenuTemplates } from "@/hooks/data/useTemplates"

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

	useEffect(() => {
		if (open) setTemplateId("")
	}, [open])

	const occasions = (templates ?? []).filter((t) => (t.template_type === "event" || t.template_type === "exception") && t.snack_family == null)
	const events = occasions.filter((t) => t.template_type === "event")
	const apoios = occasions.filter((t) => t.template_type === "exception")
	const selected = occasions.find((t) => t.id === templateId)
	const isReplace = mode === "replace"
	const isPending = isApplying || isReplacing

	const submit = () => {
		if (!templateId) return
		const done = { onSuccess: () => onOpenChange(false) }
		if (isReplace) replaceDay({ kitchenId, date, templateId }, done)
		else applyEvent({ kitchenId, templateId, dates: [date] }, done)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{isReplace ? "Trocar o cardápio do dia" : "Aplicar evento ou apoio"}</DialogTitle>
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
					<FieldLabel htmlFor="day-occasion">{isReplace ? "Cardápio de contingência" : "Evento ou apoio"}</FieldLabel>
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
									<SelectLabel>Apoios</SelectLabel>
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
							? "Tenha um apoio de contingência pronto (refeição fria, sem cocção) para escolher aqui na hora."
							: "Soma ao que o dia já tem, sem apagar a rotina. Aplicar de novo o mesmo cardápio não duplica."}
					</FieldDescription>
					{occasions.length === 0 && <p className="text-sm text-muted-foreground">Nenhum evento ou apoio cadastrado para esta cozinha.</p>}
				</Field>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
						Cancelar
					</Button>
					<Button type="button" variant={isReplace ? "destructive" : "default"} disabled={!templateId || isPending} onClick={submit}>
						{isReplace ? "Trocar o dia" : "Aplicar neste dia"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
