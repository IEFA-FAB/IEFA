import {
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Label,
	ScrollArea,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@iefa/ui"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Calendar, ChevronRight, Loader2 } from "lucide-react"
import { useState } from "react"
import { useApplyTemplate, useMenuTemplates } from "@/hooks/data/useTemplates"
import { cn } from "@/lib/cn"

interface ApplyTemplateDialogProps {
	open: boolean
	onClose: () => void
	targetDates: string[] // ISO strings
	kitchenId: number
}

const WEEKDAYS = [
	{ value: 1, label: "Segunda-feira" },
	{ value: 2, label: "Terça-feira" },
	{ value: 3, label: "Quarta-feira" },
	{ value: 4, label: "Quinta-feira" },
	{ value: 5, label: "Sexta-feira" },
	{ value: 6, label: "Sábado" },
	{ value: 7, label: "Domingo" },
]

export function ApplyTemplateDialog({
	open,
	onClose,
	targetDates,
	kitchenId,
}: ApplyTemplateDialogProps) {
	const { data: templates, isLoading } = useMenuTemplates(kitchenId)
	const { mutate: applyTemplate, isPending } = useApplyTemplate()
	const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
	const [startDayOfWeek, setStartDayOfWeek] = useState<number>(1) // Monday

	// Calculate day mapping preview
	const dayMappings = targetDates.map((dateStr) => {
		const date = new Date(dateStr)
		const jsDay = date.getDay()
		const dateDayOfWeek = jsDay === 0 ? 7 : jsDay // 1-7
		const offset = dateDayOfWeek - startDayOfWeek
		const templateDay = ((offset + 7) % 7) + 1

		return {
			date: dateStr,
			realDay: dateDayOfWeek,
			templateDay,
		}
	})

	const handleApply = () => {
		if (!selectedTemplateId) return

		applyTemplate(
			{
				templateId: selectedTemplateId,
				targetDates,
				startDayOfWeek,
				kitchenId,
			},
			{
				onSuccess: () => {
					onClose()
					setSelectedTemplateId(null)
					setStartDayOfWeek(1)
				},
			}
		)
	}

	const getWeekdayLabel = (day: number) => {
		return WEEKDAYS.find((w) => w.value === day)?.label || ""
	}

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Aplicar Template</DialogTitle>
					<DialogDescription>
						Selecione um template e configure como ele será aplicado aos {targetDates.length} dias
						selecionados.
						<br />
						<span className="text-xs text-amber-600 font-medium">
							Atenção: Isso substituirá o planejamento existente para esses dias.
						</span>
					</DialogDescription>
				</DialogHeader>

				<div className="py-4 space-y-4">
					{/* Selected Dates */}
					<div className="bg-muted/50 p-3 rounded-md text-sm">
						<span className="font-semibold block mb-1">Dias selecionados:</span>
						<div className="flex flex-wrap gap-1">
							{targetDates.map((d) => (
								<Badge key={d} variant="outline" className="bg-background">
									{format(new Date(d), "dd/MM (EEE)", { locale: ptBR })}
								</Badge>
							))}
						</div>
					</div>

					{/* Template Selection */}
					<div className="space-y-2">
						<Label className="text-sm font-medium">Templates Disponíveis</Label>
						{isLoading ? (
							<div className="flex justify-center p-4">
								<Loader2 className="animate-spin text-muted-foreground" />
							</div>
						) : (
							<ScrollArea className="h-32 border rounded-md">
								<div className="p-2 space-y-2">
									{templates?.length === 0 && (
										<p className="text-center text-sm text-muted-foreground py-4">
											Nenhum template encontrado.
										</p>
									)}
									{templates?.map((tpl) => (
										<Button
											key={tpl.id}
											onClick={() => setSelectedTemplateId(tpl.id)}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													setSelectedTemplateId(tpl.id)
												}
											}}
											className={cn(
												"p-3 rounded-md border cursor-pointer hover:bg-accent transition-colors flex items-center justify-between",
												selectedTemplateId === tpl.id
													? "border-primary bg-primary/5 ring-1 ring-primary"
													: ""
											)}
										>
											<div>
												<p className="font-medium text-sm">{tpl.name}</p>
												{tpl.description && (
													<p className="text-xs text-muted-foreground truncate max-w-[250px]">
														{tpl.description}
													</p>
												)}
												<p className="text-xs text-muted-foreground">
													{tpl.recipe_count || 0} receita
													{tpl.recipe_count !== 1 ? "s" : ""}
												</p>
											</div>
											{selectedTemplateId === tpl.id && (
												<Calendar className="w-4 h-4 text-primary" />
											)}
										</Button>
									))}
								</div>
							</ScrollArea>
						)}
					</div>

					{/* Start Day Selection */}
					{selectedTemplateId && (
						<div className="space-y-2">
							<Label htmlFor="start-day" className="text-sm font-medium">
								Dia inicial do template
							</Label>
							<Select
								value={startDayOfWeek.toString()}
								onValueChange={(v) => {
									if (v) setStartDayOfWeek(Number.parseInt(v, 10))
								}}
							>
								<SelectTrigger id="start-day">
									<SelectValue placeholder="Selecione o dia" />
								</SelectTrigger>
								<SelectContent>
									{WEEKDAYS.map((day) => (
										<SelectItem key={day.value} value={day.value.toString()}>
											{day.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								O primeiro dia do template ({getWeekdayLabel(1)}) será aplicado aos dias
								selecionados que caírem neste dia da semana.
							</p>
						</div>
					)}

					{/* Mapping Preview */}
					{selectedTemplateId && dayMappings.length > 0 && (
						<div className="space-y-2">
							<Label className="text-sm font-medium">Preview do Mapeamento</Label>
							<div className="border rounded-md p-3 space-y-2 bg-muted/20 max-h-48 overflow-y-auto">
								{dayMappings.map((mapping) => (
									<div key={mapping.date} className="flex items-center gap-2 text-sm">
										<Badge variant="outline" className="w-24 justify-center">
											{format(new Date(mapping.date), "dd/MM", {
												locale: ptBR,
											})}
										</Badge>
										<span className="text-xs text-muted-foreground">
											({getWeekdayLabel(mapping.realDay)})
										</span>
										<ChevronRight className="w-3 h-3 text-muted-foreground" />
										<span className="text-xs font-medium">
											Dia {mapping.templateDay} do template
										</span>
									</div>
								))}
							</div>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button onClick={handleApply} disabled={!selectedTemplateId || isPending}>
						{isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
						Aplicar Template
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
