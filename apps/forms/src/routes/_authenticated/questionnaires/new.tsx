import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Plus, Refresh, Trash } from "iconoir-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createQuestionFn, createQuestionnaireFn, createSectionFn, publishQuestionnaireFn } from "@/server/forms.fn"

type QuestionDraft = {
	text: string
	description: string
	type: string
	options: string[]
	required: boolean
}

type SectionDraft = {
	title: string
	description: string
	questions: QuestionDraft[]
}

const QUESTION_TYPES = [
	{ value: "text", label: "Texto curto" },
	{ value: "textarea", label: "Texto longo" },
	{ value: "single_choice", label: "Escolha única" },
	{ value: "multiple_choice", label: "Múltipla escolha" },
	{ value: "number", label: "Número" },
	{ value: "date", label: "Data" },
	{ value: "scale", label: "Escala" },
	{ value: "boolean", label: "Sim / Não" },
] as const

export const Route = createFileRoute("/_authenticated/questionnaires/new")({
	component: NewQuestionnairePage,
})

function NewQuestionnairePage() {
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const [title, setTitle] = useState("")
	const [description, setDescription] = useState("")
	const [sections, setSections] = useState<SectionDraft[]>([{ title: "Seção 1", description: "", questions: [] }])
	const [saving, setSaving] = useState(false)

	const addSection = () => {
		setSections((prev) => [...prev, { title: `Seção ${prev.length + 1}`, description: "", questions: [] }])
	}

	const removeSection = (si: number) => {
		setSections((prev) => prev.filter((_, i) => i !== si))
	}

	const updateSection = (si: number, field: "title" | "description", value: string) => {
		setSections((prev) => prev.map((s, i) => (i === si ? { ...s, [field]: value } : s)))
	}

	const addQuestion = (si: number) => {
		setSections((prev) =>
			prev.map((s, i) => (i === si ? { ...s, questions: [...s.questions, { text: "", description: "", type: "text", options: [], required: false }] } : s))
		)
	}

	const removeQuestion = (si: number, qi: number) => {
		setSections((prev) => prev.map((s, i) => (i === si ? { ...s, questions: s.questions.filter((_, j) => j !== qi) } : s)))
	}

	const updateQuestion = (si: number, qi: number, updates: Partial<QuestionDraft>) => {
		setSections((prev) => prev.map((s, i) => (i === si ? { ...s, questions: s.questions.map((q, j) => (j === qi ? { ...q, ...updates } : q)) } : s)))
	}

	const handleSave = async (publish: boolean) => {
		if (!title.trim()) return
		setSaving(true)
		try {
			const questionnaire = await createQuestionnaireFn({ data: { title, description } })
			for (let si = 0; si < sections.length; si++) {
				const s = sections[si]
				const section = await createSectionFn({ data: { questionnaire_id: questionnaire.id, title: s.title, description: s.description, sort_order: si } })
				for (let qi = 0; qi < s.questions.length; qi++) {
					const q = s.questions[qi]
					await createQuestionFn({
						data: {
							section_id: section.id,
							text: q.text,
							description: q.description || undefined,
							type: q.type as "text",
							options: q.options.length > 0 ? q.options : undefined,
							required: q.required,
							sort_order: qi,
						},
					})
				}
			}
			if (publish) {
				await publishQuestionnaireFn({ data: { id: questionnaire.id } })
			}
			await queryClient.invalidateQueries({ queryKey: ["questionnaires"] })
			navigate({ to: "/" })
		} catch (_err) {
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="p-6 md:p-10 space-y-6">
			<div className="flex items-center gap-3">
				<Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}>
					<ArrowLeft className="h-4 w-4" />
				</Button>
				<h1 className="text-2xl font-bold tracking-tight">Novo Questionário</h1>
			</div>

			<Card>
				<CardContent className="p-6 space-y-4">
					<div className="space-y-2">
						<Label>Título</Label>
						<Input placeholder="Nome do questionário" value={title} onChange={(e) => setTitle(e.target.value)} />
					</div>
					<div className="space-y-2">
						<Label>Descrição</Label>
						<Textarea placeholder="Descrição opcional" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
					</div>
				</CardContent>
			</Card>

			{sections.map((section, si) => (
				<Card key={si}>
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<CardTitle className="text-lg">
								<Input
									value={section.title}
									onChange={(e) => updateSection(si, "title", e.target.value)}
									className="text-lg font-semibold border-none p-0 h-auto focus-visible:ring-0 bg-transparent"
									placeholder="Título da seção"
								/>
							</CardTitle>
							{sections.length > 1 && (
								<Button variant="ghost" size="icon-xs" onClick={() => removeSection(si)}>
									<Trash className="h-4 w-4" />
								</Button>
							)}
						</div>
						<Input
							value={section.description}
							onChange={(e) => updateSection(si, "description", e.target.value)}
							className="text-sm text-muted-foreground border-none p-0 h-auto focus-visible:ring-0 bg-transparent"
							placeholder="Descrição da seção (opcional)"
						/>
					</CardHeader>
					<CardContent className="space-y-4">
						{section.questions.map((question, qi) => (
							<div key={qi} className="border border-border p-4 space-y-3">
								<div className="flex items-start justify-between gap-3">
									<div className="flex-1 space-y-3">
										<Input placeholder="Pergunta" value={question.text} onChange={(e) => updateQuestion(si, qi, { text: e.target.value })} />
										<Input
											placeholder="Descrição da pergunta (opcional)"
											value={question.description}
											onChange={(e) => updateQuestion(si, qi, { description: e.target.value })}
											className="text-sm"
										/>
										<div className="flex items-center gap-3">
											<Select value={question.type} onValueChange={(v) => updateQuestion(si, qi, { type: v ?? "text" })}>
												<SelectTrigger className="w-[180px]">
													<SelectValue placeholder="Tipo">
														{question.type && (QUESTION_TYPES.find((t) => t.value === question.type)?.label ?? question.type)}
													</SelectValue>
												</SelectTrigger>
												<SelectContent>
													{QUESTION_TYPES.map((t) => (
														<SelectItem key={t.value} value={t.value}>
															{t.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<label className="flex items-center gap-2 text-sm">
												<input
													type="checkbox"
													checked={question.required}
													onChange={(e) => updateQuestion(si, qi, { required: e.target.checked })}
													className="h-3.5 w-3.5 border border-border accent-foreground"
												/>
												Obrigatória
											</label>
										</div>
										{(question.type === "single_choice" || question.type === "multiple_choice") && (
											<div className="space-y-2">
												<Label className="text-xs text-muted-foreground">Opções (uma por linha)</Label>
												<Textarea
													value={question.options.join("\n")}
													onChange={(e) => updateQuestion(si, qi, { options: e.target.value.split("\n").filter(Boolean) })}
													rows={3}
													placeholder={"Opção 1\nOpção 2\nOpção 3"}
												/>
											</div>
										)}
									</div>
									<Button variant="ghost" size="icon-xs" onClick={() => removeQuestion(si, qi)}>
										<Trash className="h-4 w-4" />
									</Button>
								</div>
							</div>
						))}
						<Button variant="outline" size="sm" onClick={() => addQuestion(si)}>
							<Plus className="h-4 w-4" />
							Adicionar pergunta
						</Button>
					</CardContent>
				</Card>
			))}

			<Button variant="outline" onClick={addSection} className="w-full">
				<Plus className="h-4 w-4" />
				Adicionar seção
			</Button>

			<div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
				<Button variant="outline" onClick={() => handleSave(false)} disabled={saving || !title.trim()}>
					{saving && <Refresh className="h-4 w-4 animate-spin" />}
					Salvar rascunho
				</Button>
				<Button onClick={() => handleSave(true)} disabled={saving || !title.trim()}>
					{saving && <Refresh className="h-4 w-4 animate-spin" />}
					Publicar
				</Button>
			</div>
		</div>
	)
}
