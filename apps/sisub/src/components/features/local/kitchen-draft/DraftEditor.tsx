import { Minus, Plus, Users } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { TemplateSelection } from "@/types/domain/ata"
import type { TemplateWithItemCounts } from "@/types/domain/planning"

interface DraftEditorProps {
	initialTitle?: string
	initialNotes?: string
	initialSelections?: TemplateSelection[]
	weeklyTemplates: TemplateWithItemCounts[]
	eventTemplates: TemplateWithItemCounts[]
	isLoadingTemplates?: boolean
	isSaving?: boolean
	isSending?: boolean
	onSave: (title: string, notes: string, selections: TemplateSelection[]) => void
	onSend?: (title: string, notes: string, selections: TemplateSelection[]) => void
}

type ExtendedTemplate = TemplateWithItemCounts & { default_headcount?: number }

export function DraftEditor({
	initialTitle = "",
	initialNotes = "",
	initialSelections = [],
	weeklyTemplates,
	eventTemplates,
	isLoadingTemplates,
	isSaving,
	isSending,
	onSave,
	onSend,
}: DraftEditorProps) {
	const [title, setTitle] = useState(initialTitle)
	const [notes, setNotes] = useState(initialNotes)
	const [selections, setSelections] = useState<TemplateSelection[]>(initialSelections)

	const isSelected = (templateId: string) => selections.some((s) => s.templateId === templateId)
	const getRepetitions = (templateId: string) => selections.find((s) => s.templateId === templateId)?.repetitions ?? 1

	const handleToggle = (template: ExtendedTemplate, checked: boolean) => {
		if (checked) {
			setSelections((prev) => [
				...prev,
				{
					templateId: template.id,
					templateName: template.name || "",
					defaultHeadcount: template.default_headcount ?? 0,
					repetitions: 1,
				},
			])
		} else {
			setSelections((prev) => prev.filter((s) => s.templateId !== template.id))
		}
	}

	const handleRepetitions = (templateId: string, delta: number) => {
		setSelections((prev) => prev.map((s) => (s.templateId === templateId ? { ...s, repetitions: Math.max(1, s.repetitions + delta) } : s)))
	}

	const handleRepetitionsInput = (templateId: string, value: string) => {
		const n = Number.parseInt(value, 10)
		if (!Number.isNaN(n) && n >= 1) {
			setSelections((prev) => prev.map((s) => (s.templateId === templateId ? { ...s, repetitions: n } : s)))
		}
	}

	const handleSave = () => onSave(title, notes, selections)
	const handleSend = () => onSend?.(title, notes, selections)

	const renderTemplateList = (templates: ExtendedTemplate[], label: string) => (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-sm font-semibold">{label}</CardTitle>
			</CardHeader>
			<CardContent>
				{isLoadingTemplates ? (
					<div className="space-y-2">
						{[1, 2].map((i) => (
							<div key={i} className="h-12 animate-pulse rounded bg-muted" aria-hidden="true" />
						))}
					</div>
				) : templates.length === 0 ? (
					<p className="text-sm text-muted-foreground py-3 text-center">Nenhum template disponível.</p>
				) : (
					<div className="space-y-2">
						{templates.map((template) => {
							const selected = isSelected(template.id)
							const reps = getRepetitions(template.id)
							const headcount = template.default_headcount ?? 0

							return (
								<div
									key={template.id}
									className={`flex items-center gap-3 rounded-md border p-3 transition-colors ${selected ? "border-primary/50 bg-primary/5" : "border-border"}`}
								>
									<Checkbox
										id={`draft-${template.id}`}
										checked={selected}
										onCheckedChange={(checked) => handleToggle(template as ExtendedTemplate, checked === true)}
									/>
									<div className="flex-1 min-w-0">
										<Label htmlFor={`draft-${template.id}`} className="text-sm font-medium cursor-pointer">
											{template.name || "Sem nome"}
										</Label>
										<div className="flex items-center gap-2 mt-0.5">
											<span className="text-xs text-muted-foreground flex items-center gap-1">
												<Users className="h-3 w-3" />
												{headcount > 0 ? `${headcount} pessoas` : "Sem headcount"}
											</span>
											<span className="text-xs text-muted-foreground">·</span>
											<span className="text-xs text-muted-foreground">{template.recipe_count} preparações</span>
										</div>
									</div>
									{selected && (
										<div className="flex items-center gap-1.5 shrink-0">
											<Button size="icon" variant="outline" className="h-7 w-7" onClick={() => handleRepetitions(template.id, -1)} disabled={reps <= 1}>
												<Minus className="h-3 w-3" />
											</Button>
											<Input
												type="number"
												min={1}
												value={reps}
												onChange={(e) => handleRepetitionsInput(template.id, e.target.value)}
												className="h-7 w-14 text-center tabular-nums text-sm"
											/>
											<Button size="icon" variant="outline" className="h-7 w-7" onClick={() => handleRepetitions(template.id, 1)}>
												<Plus className="h-3 w-3" />
											</Button>
											<span className="text-xs text-muted-foreground ml-1">×</span>
										</div>
									)}
								</div>
							)
						})}
					</div>
				)}
			</CardContent>
		</Card>
	)

	return (
		<div className="space-y-6">
			{/* Metadados */}
			<Card>
				<CardContent className="pt-6">
					<div className="space-y-4">
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="draft-title">Título do Rascunho *</FieldLabel>
								<Input id="draft-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Sugestão Ata Março 2026" required />
							</Field>
						</FieldGroup>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="draft-notes">Observações</FieldLabel>
								<Textarea
									id="draft-notes"
									value={notes}
									onChange={(e) => setNotes(e.target.value)}
									placeholder="Informações adicionais para o gestor da unidade..."
									rows={3}
								/>
							</Field>
						</FieldGroup>
					</div>
				</CardContent>
			</Card>

			{/* Cardápios Semanais */}
			{renderTemplateList(weeklyTemplates as ExtendedTemplate[], "Cardápios Semanais")}

			{/* Eventos */}
			{renderTemplateList(eventTemplates as ExtendedTemplate[], "Eventos / Refeições Especiais")}

			{/* Resumo e Ações */}
			{selections.length > 0 && (
				<div className="rounded-md border bg-muted/30 p-4">
					<p className="text-sm font-medium mb-2">Resumo das Seleções:</p>
					<div className="flex flex-wrap gap-2">
						{selections.map((s) => (
							<Badge key={s.templateId} variant="secondary" className="text-xs">
								{s.templateName} × {s.repetitions}
							</Badge>
						))}
					</div>
				</div>
			)}

			<div className="flex items-center justify-end gap-3">
				<Button variant="outline" onClick={handleSave} disabled={!title.trim() || isSaving || isSending}>
					{isSaving ? "Salvando..." : "Salvar Rascunho"}
				</Button>
				{onSend && (
					<Button onClick={handleSend} disabled={!title.trim() || selections.length === 0 || isSaving || isSending}>
						{isSending ? "Enviando..." : "Enviar para Gestão"}
					</Button>
				)}
			</div>
		</div>
	)
}
