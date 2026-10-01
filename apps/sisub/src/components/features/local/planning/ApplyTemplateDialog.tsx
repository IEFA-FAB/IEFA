import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Calendar, ChevronRight, Loader2 } from "lucide-react"
import { useState } from "react"
import { QueryErrorState } from "@/components/features/shared/QueryErrorState"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Item, ItemGroup } from "@/components/ui/item"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useApplyTemplate, useMenuTemplates, useTemplate } from "@/hooks/data/useTemplates"
import { hasInvalidHeadcount, weeklyHeadcountRows, weeklyHeadcountsPayload } from "@/lib/apply-headcounts"
import { cn } from "@/lib/cn"
import { getWeekdayLabel, WEEKDAYS } from "@/lib/weekdays"
import { ApplyHeadcountFields, HEADCOUNT_PENDING_HINT } from "./ApplyHeadcountFields"

interface ApplyTemplateDialogProps {
	open: boolean
	onClose: () => void
	targetDates: string[] // ISO strings
	kitchenId: number
	/** Datas (YYYY-MM-DD) que já têm planejamento ativo — usado para o aviso de conflito. */
	plannedDates?: string[]
	/** Template já escolhido na paleta — sem ele o usuário escolhia duas vezes o mesmo cardápio. */
	initialTemplateId?: string | null
}

/** Parse "YYYY-MM-DD" como data no fuso local (evita o shift UTC do `new Date(str)`). */
function parseLocalDate(dateStr: string): Date {
	const [y, m, d] = dateStr.split("-").map(Number)
	return new Date(y, m - 1, d)
}

export function ApplyTemplateDialog({ open, onClose, targetDates, kitchenId, plannedDates, initialTemplateId = null }: ApplyTemplateDialogProps) {
	const { data: allTemplates, isLoading, isError, refetch, isRefetching } = useMenuTemplates(kitchenId)
	// Só semanais: evento e exceção têm aplicador próprio, e escolhê-los aqui terminava em erro
	// do servidor DEPOIS de o usuário já ter montado as datas.
	const templates = allTemplates?.filter((t) => t.template_type === "weekly")
	const { mutate: applyTemplate, isPending } = useApplyTemplate()
	const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialTemplateId)
	const [startDayOfWeek, setStartDayOfWeek] = useState<number>(1) // Monday
	const [conflictMode, setConflictMode] = useState<"replace" | "skip">("skip")
	// Efetivo desta aplicação por tipo de refeição (texto do campo). Vazio usa o do cardápio; no
	// modelo global, que só tem %, vazio é "a definir".
	const [headcountDraft, setHeadcountDraft] = useState<Record<string, string>>({})
	const { data: selectedTemplate, isLoading: isTemplateLoading } = useTemplate(selectedTemplateId)
	const headcountRows = selectedTemplate ? weeklyHeadcountRows(selectedTemplate) : []
	const isGlobalTemplate = selectedTemplate != null && selectedTemplate.kitchen_id == null
	const hasRowWithoutBase = isGlobalTemplate || headcountRows.some((row) => row.templateHint == null)
	const isHeadcountInvalid = hasInvalidHeadcount(headcountDraft)

	const selectTemplate = (id: string) => {
		if (id === selectedTemplateId) return
		setSelectedTemplateId(id)
		setHeadcountDraft({})
	}

	const plannedSet = new Set(plannedDates ?? [])
	const conflictDates = targetDates.filter((d) => plannedSet.has(d))

	// Calculate day mapping preview. Parse "YYYY-MM-DD" como data de calendário local
	// (não UTC): `new Date("YYYY-MM-DD")` é meia-noite UTC e desloca o dia da semana em
	// fusos negativos. Aqui o weekday casa com o servidor (que itera em UTC).
	const dayMappings = targetDates.map((dateStr) => {
		const date = parseLocalDate(dateStr)
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
		if (!selectedTemplateId || isHeadcountInvalid) return

		applyTemplate(
			{
				templateId: selectedTemplateId,
				targetDates,
				startDayOfWeek,
				kitchenId,
				conflictMode,
				headcounts: weeklyHeadcountsPayload(headcountDraft),
			},
			{
				onSuccess: () => {
					onClose()
					setSelectedTemplateId(null)
					setStartDayOfWeek(1)
					setConflictMode("skip")
					setHeadcountDraft({})
				},
			}
		)
	}

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Aplicar Template</DialogTitle>
					<DialogDescription>
						Selecione um template e configure como ele será aplicado aos {targetDates.length} dias selecionados.
						{conflictDates.length > 0 && (
							<>
								<br />
								<span className="text-caption text-warning">
									{conflictDates.length} {conflictDates.length === 1 ? "dia já possui" : "dias já possuem"} planejamento — escolha abaixo o que fazer com eles.
								</span>
							</>
						)}
					</DialogDescription>
				</DialogHeader>

				<div className="py-4 space-y-4">
					{/* Selected Dates */}
					<div className="bg-muted/50 p-3 rounded-md text-sm">
						<span className="text-subheading block mb-1">Dias selecionados:</span>
						<div className="flex flex-wrap gap-1">
							{targetDates.map((d) => (
								<Badge key={d} variant="outline" className={plannedSet.has(d) ? "bg-warning/10 text-warning border-warning/30" : "bg-background"}>
									{format(parseLocalDate(d), "dd/MM (EEE)", { locale: ptBR })}
								</Badge>
							))}
						</div>
					</div>

					{/* Conflito: dias já planejados */}
					{conflictDates.length > 0 && (
						<div className="space-y-2">
							<Label className="text-subheading">Dias já planejados</Label>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
								<Button
									variant="outline"
									onClick={() => setConflictMode("skip")}
									className={cn("h-auto p-3 justify-start font-normal text-left", conflictMode === "skip" && "border-primary bg-primary/5 ring-1 ring-primary")}
								>
									<div>
										<p className="text-subheading">Preservar</p>
										<p className="text-xs text-muted-foreground">
											Mantém as refeições já planejadas (e ajustes manuais); o template preenche só as refeições vazias.
										</p>
									</div>
								</Button>
								<Button
									variant="outline"
									onClick={() => setConflictMode("replace")}
									className={cn(
										"h-auto p-3 justify-start font-normal text-left",
										conflictMode === "replace" && "border-warning bg-warning/5 ring-1 ring-warning"
									)}
								>
									<div>
										<p className="text-subheading">Substituir</p>
										<p className="text-xs text-muted-foreground">
											Apaga o planejamento dos dias listados acima — só eles — e re-aplica o template. O que sair vai para a Lixeira.
										</p>
									</div>
								</Button>
							</div>
						</div>
					)}

					{/* Template Selection */}
					<div className="space-y-2">
						<Label className="text-subheading">Templates Disponíveis</Label>
						{isLoading ? (
							<div className="flex justify-center p-4">
								<Loader2 className="animate-spin text-muted-foreground" />
							</div>
						) : isError ? (
							<QueryErrorState message="Não foi possível carregar os templates." onRetry={() => refetch()} isRetrying={isRefetching} />
						) : (
							<ScrollArea className="h-32 border rounded-md">
								<div className="p-2 space-y-2">
									{templates?.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">Nenhum template encontrado.</p>}
									{templates?.map((tpl) => (
										<Button
											key={tpl.id}
											variant="outline"
											onClick={() => selectTemplate(tpl.id)}
											className={cn(
												"h-auto w-full p-3 justify-between font-normal text-left transition-colors",
												selectedTemplateId === tpl.id ? "border-primary bg-primary/5 ring-1 ring-primary" : ""
											)}
										>
											<div>
												<p className="text-subheading">{tpl.name}</p>
												{tpl.description && <p className="text-xs text-muted-foreground truncate max-w-[250px]">{tpl.description}</p>}
												<p className="text-xs text-muted-foreground">
													{tpl.recipe_count || 0} {tpl.recipe_count === 1 ? "preparação" : "preparações"}
													{tpl.kitchen_id == null && " · modelo global"}
												</p>
											</div>
											{selectedTemplateId === tpl.id && <Calendar className="size-4 text-primary" />}
										</Button>
									))}
								</div>
							</ScrollArea>
						)}
					</div>

					{/* Start Day Selection */}
					{selectedTemplateId && (
						<div className="space-y-2">
							<Label htmlFor="start-day" className="text-subheading">
								Dia inicial do template
							</Label>
							<Select
								value={startDayOfWeek.toString()}
								onValueChange={(v) => {
									if (v) setStartDayOfWeek(Number.parseInt(v, 10))
								}}
							>
								<SelectTrigger id="start-day">
									<SelectValue placeholder="Selecione o dia">{getWeekdayLabel(startDayOfWeek)}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{WEEKDAYS.map((day) => (
										<SelectItem key={day.num} value={day.num.toString()}>
											{day.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								O primeiro dia do template ({getWeekdayLabel(1)}) será aplicado aos dias selecionados que caírem neste dia da semana.
							</p>
						</div>
					)}

					{/* Efetivo desta aplicação */}
					{selectedTemplateId && (
						<ApplyHeadcountFields
							idPrefix="apply-headcount"
							legend="Efetivo por refeição"
							description={
								<>
									{isGlobalTemplate
										? "Modelo global: ele só tem as proporções. O efetivo informado vale para todos os dias aplicados."
										: "Vazio usa o efetivo do cardápio, dia a dia. O número informado vale para todos os dias aplicados, só nesta aplicação."}
									{hasRowWithoutBase && ` ${HEADCOUNT_PENDING_HINT}`}
								</>
							}
							rows={headcountRows}
							draft={headcountDraft}
							onChange={(id, raw) => setHeadcountDraft((prev) => ({ ...prev, [id]: raw }))}
							unit="comensais"
							placeholderFor={(row) => (!isGlobalTemplate && row.templateHint != null ? `do cardápio: ${row.templateHint}` : "a definir")}
							isLoading={isTemplateLoading}
						/>
					)}

					{/* Mapping Preview */}
					{selectedTemplateId && dayMappings.length > 0 && (
						<div className="space-y-2">
							<Label className="text-subheading">Preview do Mapeamento</Label>
							<div className="border rounded-md p-3 bg-muted/20 max-h-48 overflow-y-auto">
								<ItemGroup>
									{dayMappings.map((mapping) => (
										<Item key={mapping.date} size="xs" variant="default">
											<Badge variant="outline" className="w-24 justify-center">
												{format(parseLocalDate(mapping.date), "dd/MM", {
													locale: ptBR,
												})}
											</Badge>
											<span className="text-xs text-muted-foreground">({getWeekdayLabel(mapping.realDay)})</span>
											<ChevronRight className="size-3 text-muted-foreground" />
											<span className="text-caption">Dia {mapping.templateDay} do template</span>
										</Item>
									))}
								</ItemGroup>
							</div>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button onClick={handleApply} disabled={!selectedTemplateId || isPending || isHeadcountInvalid}>
						{isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
						Aplicar Template
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
