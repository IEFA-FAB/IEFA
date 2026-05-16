import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, EditPencil, Eye, Plus, Refresh, SendDiagonal, Trash } from "iconoir-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { CONFORMITY_WEIGHTS, type ConformityOptions } from "@/lib/conformity"
import {
	createQuestionFn,
	createSectionFn,
	deleteQuestionFn,
	deleteSectionFn,
	getQuestionnaireFn,
	publishQuestionnaireFn,
	updateQuestionFn,
	updateQuestionnaireFn,
	updateSectionFn,
} from "@/server/forms.fn"

const QUESTION_TYPES = [
	{ value: "text", label: "Texto curto" },
	{ value: "textarea", label: "Texto longo" },
	{ value: "single_choice", label: "Escolha única" },
	{ value: "multiple_choice", label: "Múltipla escolha" },
	{ value: "number", label: "Número" },
	{ value: "date", label: "Data" },
	{ value: "scale", label: "Escala" },
	{ value: "boolean", label: "Sim / Não" },
	{ value: "conformity", label: "Conformidade (A/AP/NA/NO)" },
] as const

const questionnaireQueryOptions = (id: string) =>
	queryOptions({
		queryKey: ["questionnaire", id],
		queryFn: () => getQuestionnaireFn({ data: { id } }),
	})

export const Route = createFileRoute("/_authenticated/questionnaires/$id")({
	loader: ({ context, params }) => context.queryClient.ensureQueryData(questionnaireQueryOptions(params.id)),
	component: EditQuestionnairePage,
})

function EditQuestionnairePage() {
	const { id } = Route.useParams()
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const { data: questionnaire } = useSuspenseQuery(questionnaireQueryOptions(id))
	const [saving, setSaving] = useState(false)
	const [copiedShareLink, setCopiedShareLink] = useState(false)

	const isDraft = questionnaire.status === "draft"
	const sections = questionnaire.section ?? []
	const shareUrl = typeof window !== "undefined" ? new URL(`/respond/${id}`, window.location.origin).toString() : `/respond/${id}`

	const invalidate = () => queryClient.invalidateQueries({ queryKey: ["questionnaire", id] })

	const handleUpdateTitle = async (title: string) => {
		if (!title.trim() || !isDraft) return
		await updateQuestionnaireFn({ data: { id, title } })
		invalidate()
	}

	const handlePublish = async () => {
		setSaving(true)
		try {
			await publishQuestionnaireFn({ data: { id } })
			await queryClient.invalidateQueries({ queryKey: ["questionnaires"] })
			invalidate()
		} finally {
			setSaving(false)
		}
	}

	const handleAddSection = async () => {
		await createSectionFn({ data: { questionnaire_id: id, title: `Seção ${sections.length + 1}`, sort_order: sections.length } })
		invalidate()
	}

	const handleUpdateSection = async (sectionId: string, updates: { title?: string; description?: string }) => {
		await updateSectionFn({ data: { id: sectionId, ...updates } })
		invalidate()
	}

	const handleDeleteSection = async (sectionId: string) => {
		await deleteSectionFn({ data: { id: sectionId } })
		invalidate()
	}

	const handleAddQuestion = async (sectionId: string, sortOrder: number) => {
		await createQuestionFn({ data: { section_id: sectionId, text: "Nova pergunta", sort_order: sortOrder } })
		invalidate()
	}

	const handleUpdateQuestion = async (questionId: string, updates: Record<string, unknown>) => {
		await updateQuestionFn({ data: { id: questionId, ...updates } })
		invalidate()
	}

	const handleDeleteQuestion = async (questionId: string) => {
		await deleteQuestionFn({ data: { id: questionId } })
		invalidate()
	}

	const handleCopyShareLink = async () => {
		if (typeof navigator === "undefined" || !navigator.clipboard) return
		await navigator.clipboard.writeText(shareUrl)
		setCopiedShareLink(true)
		window.setTimeout(() => setCopiedShareLink(false), 2000)
	}

	return (
		<div className="p-6 md:p-10 space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<div>
						<h1 className="text-2xl font-bold tracking-tight">{questionnaire.title}</h1>
						<Badge variant={isDraft ? "secondary" : "default"} className="mt-1">
							{isDraft ? (
								<>
									<EditPencil className="h-3 w-3" /> Rascunho
								</>
							) : (
								<>
									<SendDiagonal className="h-3 w-3" /> Enviado
								</>
							)}
						</Badge>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{questionnaire.status === "sent" && (
						<Button variant="outline" nativeButton={false} render={<Link to="/responses/$questionnaireId" params={{ questionnaireId: id }} />}>
							<Eye className="h-4 w-4" />
							Ver respostas
						</Button>
					)}
					{isDraft && (
						<Button onClick={handlePublish} disabled={saving}>
							{saving && <Refresh className="h-4 w-4 animate-spin" />}
							<SendDiagonal className="h-4 w-4" />
							Publicar
						</Button>
					)}
				</div>
			</div>

			{isDraft && (
				<Card>
					<CardContent className="p-6 space-y-4">
						<div className="space-y-2">
							<Label>Título</Label>
							<Input defaultValue={questionnaire.title} onBlur={(e) => handleUpdateTitle(e.target.value)} />
						</div>
						<div className="space-y-2">
							<Label>Descrição</Label>
							<Textarea
								defaultValue={questionnaire.description ?? ""}
								onBlur={(e) => updateQuestionnaireFn({ data: { id, description: e.target.value } }).then(() => invalidate())}
								rows={2}
							/>
						</div>
					</CardContent>
				</Card>
			)}

			{questionnaire.status === "sent" && (
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-lg">Link fixo para respostas</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<p className="text-sm text-muted-foreground">Compartilhe este link. O usuário fará login e será redirecionado direto para a página de resposta.</p>
						<div className="flex flex-col gap-2 md:flex-row">
							<Input value={shareUrl} readOnly className="font-mono text-xs" />
							<Button type="button" variant="outline" onClick={handleCopyShareLink} className="md:shrink-0">
								{copiedShareLink ? "Copiado" : "Copiar link"}
							</Button>
						</div>
					</CardContent>
				</Card>
			)}

			{sections.map(
				(section: {
					id: string
					title: string
					description: string | null
					question: { id: string; text: string; description: string | null; type: string; options: unknown; required: boolean; sort_order: number }[] | null
				}) => (
					<Card key={section.id}>
						<CardHeader className="pb-3">
							<div className="flex items-center justify-between">
								<CardTitle className="text-lg">
									{isDraft ? (
										<Input
											defaultValue={section.title}
											onBlur={(e) => handleUpdateSection(section.id, { title: e.target.value })}
											className="text-lg font-semibold border-none p-0 h-auto focus-visible:ring-0 bg-transparent"
										/>
									) : (
										section.title
									)}
								</CardTitle>
								{isDraft && (
									<Button variant="ghost" size="icon-xs" onClick={() => handleDeleteSection(section.id)}>
										<Trash className="h-4 w-4" />
									</Button>
								)}
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							{(section.question ?? []).map(
								(question: { id: string; text: string; description: string | null; type: string; options: unknown; required: boolean }) => (
									<div key={question.id} className="border border-border p-4 space-y-3">
										{isDraft ? (
											<div className="space-y-3">
												<div className="flex items-start justify-between gap-3">
													<Input defaultValue={question.text} onBlur={(e) => handleUpdateQuestion(question.id, { text: e.target.value })} className="flex-1" />
													<Button variant="ghost" size="icon-xs" onClick={() => handleDeleteQuestion(question.id)}>
														<Trash className="h-4 w-4" />
													</Button>
												</div>
												<div className="flex flex-wrap items-center gap-3">
													<Select value={question.type} onValueChange={(v) => handleUpdateQuestion(question.id, { type: v })}>
														<SelectTrigger className="w-[220px]">
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
													{question.type === "conformity" && (
														<Select
															value={(question.options as ConformityOptions | null)?.weight ?? null}
															onValueChange={(v) => {
																const w = Number(v) as 1 | 3 | 5
																handleUpdateQuestion(question.id, {
																	options: { weight: w, weightLabel: CONFORMITY_WEIGHTS.find((x) => x.value === w)?.label ?? "Desejável" },
																})
															}}
														>
															<SelectTrigger className="w-[200px]">
																<SelectValue placeholder="Peso">
																	{(() => {
																		const w = (question.options as ConformityOptions | null)?.weight
																		return w ? `${w} — ${CONFORMITY_WEIGHTS.find((x) => x.value === w)?.label ?? ""}` : undefined
																	})()}
																</SelectValue>
															</SelectTrigger>
															<SelectContent>
																{CONFORMITY_WEIGHTS.map((w) => (
																	<SelectItem key={w.value} value={w.value}>
																		{w.value} — {w.label}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
													)}
													<label className="flex items-center gap-2 text-sm">
														<input
															type="checkbox"
															defaultChecked={question.required}
															onChange={(e) => handleUpdateQuestion(question.id, { required: e.target.checked })}
															className="h-3.5 w-3.5 border border-border accent-foreground"
														/>
														Obrigatória
													</label>
												</div>
											</div>
										) : (
											<div>
												<p className="font-medium">{question.text}</p>
												{question.description && <p className="text-sm text-muted-foreground mt-1">{question.description}</p>}
												<Badge variant="secondary" className="mt-2">
													{QUESTION_TYPES.find((t) => t.value === question.type)?.label ?? question.type}
												</Badge>
											</div>
										)}
									</div>
								)
							)}
							{isDraft && (
								<Button variant="outline" size="sm" onClick={() => handleAddQuestion(section.id, (section.question ?? []).length)}>
									<Plus className="h-4 w-4" />
									Adicionar pergunta
								</Button>
							)}
						</CardContent>
					</Card>
				)
			)}

			{isDraft && (
				<Button variant="outline" onClick={handleAddSection} className="w-full">
					<Plus className="h-4 w-4" />
					Adicionar seção
				</Button>
			)}
		</div>
	)
}
