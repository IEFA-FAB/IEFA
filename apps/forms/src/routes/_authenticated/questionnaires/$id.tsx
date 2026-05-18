import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, EditPencil, Eye, Plus, Refresh, SendDiagonal, Trash } from "iconoir-react"
import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { CONFORMITY_WEIGHTS, type ConformityOptions } from "@/lib/conformity"
import {
	addEditorFn,
	createQuestionFn,
	createSectionFn,
	deleteQuestionFn,
	deleteSectionFn,
	getEditorsFn,
	getQuestionnaireFn,
	publishQuestionnaireFn,
	removeEditorFn,
	updateQuestionFn,
	updateQuestionnaireFn,
	updateSectionFn,
} from "@/server/forms.fn"

type Editor = {
	id: string
	editor_email: string
	questionnaire_id: string
}

type QuestionnaireAccess = {
	isCreator: boolean
	isEditor: boolean
	canEdit: boolean
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
	{ value: "conformity", label: "Conformidade (A/AP/NA/NO)" },
] as const

const questionnaireQueryOptions = (id: string) =>
	queryOptions({
		queryKey: ["questionnaire", id],
		queryFn: () => getQuestionnaireFn({ data: { id } }),
	})

const editorsQueryOptions = (questionnaireId: string) =>
	queryOptions({
		queryKey: ["editors", questionnaireId],
		queryFn: () => getEditorsFn({ data: { questionnaire_id: questionnaireId } }),
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
	const { data: editors = [] } = useQuery({
		...editorsQueryOptions(id),
		enabled: questionnaire.access.isCreator,
	})
	const [saving, setSaving] = useState(false)
	const [copiedShareLink, setCopiedShareLink] = useState(false)

	const access = questionnaire.access as QuestionnaireAccess
	const isDraft = questionnaire.status === "draft"
	const canEdit = access.canEdit
	const isCreator = access.isCreator
	const sections = questionnaire.section ?? []
	const shareUrl = typeof window !== "undefined" ? new URL(`/respond/${id}`, window.location.origin).toString() : `/respond/${id}`

	const invalidateQuestionnaire = () => queryClient.invalidateQueries({ queryKey: ["questionnaire", id] })
	const invalidateDashboardLists = async () => {
		await queryClient.invalidateQueries({ queryKey: ["questionnaires"] })
		await queryClient.invalidateQueries({ queryKey: ["editable-shared-with-me"] })
	}

	const reportError = (error: unknown, fallback: string) => {
		toast.error(error instanceof Error ? error.message : fallback)
	}

	const handleUpdateTitle = async (title: string) => {
		if (!title.trim() || !canEdit) return
		try {
			await updateQuestionnaireFn({ data: { id, title } })
			await invalidateDashboardLists()
			await invalidateQuestionnaire()
		} catch (error) {
			reportError(error, "Erro ao atualizar título")
		}
	}

	const handleUpdateDescription = async (description: string) => {
		if (!canEdit) return
		try {
			await updateQuestionnaireFn({ data: { id, description } })
			await invalidateDashboardLists()
			await invalidateQuestionnaire()
		} catch (error) {
			reportError(error, "Erro ao atualizar descrição")
		}
	}

	const handlePublish = async () => {
		if (!canEdit) return
		setSaving(true)
		try {
			await publishQuestionnaireFn({ data: { id } })
			await invalidateDashboardLists()
			await invalidateQuestionnaire()
		} catch (error) {
			reportError(error, "Erro ao publicar questionário")
		} finally {
			setSaving(false)
		}
	}

	const handleAddSection = async () => {
		if (!canEdit) return
		try {
			await createSectionFn({ data: { questionnaire_id: id, title: `Seção ${sections.length + 1}`, sort_order: sections.length } })
			await invalidateQuestionnaire()
		} catch (error) {
			reportError(error, "Erro ao adicionar seção")
		}
	}

	const handleUpdateSection = async (sectionId: string, updates: { title?: string; description?: string }) => {
		try {
			await updateSectionFn({ data: { id: sectionId, ...updates } })
			await invalidateQuestionnaire()
		} catch (error) {
			reportError(error, "Erro ao atualizar seção")
		}
	}

	const handleDeleteSection = async (sectionId: string) => {
		try {
			await deleteSectionFn({ data: { id: sectionId } })
			await invalidateQuestionnaire()
		} catch (error) {
			reportError(error, "Erro ao remover seção")
		}
	}

	const handleAddQuestion = async (sectionId: string, sortOrder: number) => {
		try {
			await createQuestionFn({ data: { section_id: sectionId, text: "Nova pergunta", sort_order: sortOrder } })
			await invalidateQuestionnaire()
		} catch (error) {
			reportError(error, "Erro ao adicionar pergunta")
		}
	}

	const handleUpdateQuestion = async (questionId: string, updates: Record<string, unknown>) => {
		try {
			await updateQuestionFn({ data: { id: questionId, ...updates } })
			await invalidateQuestionnaire()
		} catch (error) {
			reportError(error, "Erro ao atualizar pergunta")
		}
	}

	const handleDeleteQuestion = async (questionId: string) => {
		try {
			await deleteQuestionFn({ data: { id: questionId } })
			await invalidateQuestionnaire()
		} catch (error) {
			reportError(error, "Erro ao remover pergunta")
		}
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
					<Button variant="ghost" size="sm" onClick={() => navigate({ to: "/dashboard" })}>
						<ArrowLeft className="size-4" />
					</Button>
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">{questionnaire.title}</h1>
						<div className="mt-1 flex flex-wrap items-center gap-2">
							<Badge variant={isDraft ? "secondary" : "default"}>
								{isDraft ? (
									<>
										<EditPencil className="size-3" /> Rascunho
									</>
								) : (
									<>
										<SendDiagonal className="size-3" /> Enviado
									</>
								)}
							</Badge>
							{access.isEditor && !isCreator && <Badge variant="outline">Editor</Badge>}
						</div>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{questionnaire.status === "sent" && isCreator && (
						<Button variant="outline" nativeButton={false} render={<Link to="/responses/$questionnaireId" params={{ questionnaireId: id }} />}>
							<Eye className="size-4" />
							Ver respostas
						</Button>
					)}
					{isDraft && canEdit && (
						<Button onClick={handlePublish} disabled={saving}>
							{saving && <Refresh className="size-4 animate-spin" />}
							<SendDiagonal className="size-4" />
							Publicar
						</Button>
					)}
				</div>
			</div>

			{canEdit && (
				<Card>
					<CardContent className="p-6 space-y-4">
						<div className="space-y-2">
							<Label>Título</Label>
							<Input defaultValue={questionnaire.title} onBlur={(e) => handleUpdateTitle(e.target.value)} />
						</div>
						<div className="space-y-2">
							<Label>Descrição</Label>
							<Textarea defaultValue={questionnaire.description ?? ""} onBlur={(e) => handleUpdateDescription(e.target.value)} rows={2} />
						</div>
					</CardContent>
				</Card>
			)}

			{isCreator && <EditorManager questionnaireId={id} editors={editors as Editor[]} />}

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
									{canEdit ? (
										<Input
											defaultValue={section.title}
											onBlur={(e) => handleUpdateSection(section.id, { title: e.target.value })}
											className="text-lg font-semibold border-none p-0 h-auto focus-visible:ring-0 bg-transparent"
										/>
									) : (
										section.title
									)}
								</CardTitle>
								{canEdit && (
									<Button variant="ghost" size="icon-xs" onClick={() => handleDeleteSection(section.id)}>
										<Trash className="size-4" />
									</Button>
								)}
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							{(section.question ?? []).map(
								(question: { id: string; text: string; description: string | null; type: string; options: unknown; required: boolean }) => (
									<div key={question.id} className="border border-border p-4 space-y-3">
										{canEdit ? (
											<div className="space-y-3">
												<div className="flex items-start justify-between gap-3">
													<Input defaultValue={question.text} onBlur={(e) => handleUpdateQuestion(question.id, { text: e.target.value })} className="flex-1" />
													<Button variant="ghost" size="icon-xs" onClick={() => handleDeleteQuestion(question.id)}>
														<Trash className="size-4" />
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
																		{w.value}: {w.label}
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
															className="size-3.5 border border-border accent-foreground"
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
							{canEdit && (
								<Button variant="outline" size="sm" onClick={() => handleAddQuestion(section.id, (section.question ?? []).length)}>
									<Plus className="size-4" />
									Adicionar pergunta
								</Button>
							)}
						</CardContent>
					</Card>
				)
			)}

			{canEdit && (
				<Button variant="outline" onClick={handleAddSection} className="w-full">
					<Plus className="size-4" />
					Adicionar seção
				</Button>
			)}
		</div>
	)
}

function EditorManager({ questionnaireId, editors }: { questionnaireId: string; editors: Editor[] }) {
	const queryClient = useQueryClient()
	const [email, setEmail] = useState("")
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function handleAdd() {
		if (!email.trim()) return
		setLoading(true)
		setError(null)
		try {
			await addEditorFn({ data: { questionnaire_id: questionnaireId, email: email.trim() } })
			setEmail("")
			await queryClient.invalidateQueries({ queryKey: ["editors", questionnaireId] })
		} catch (e) {
			setError(e instanceof Error ? e.message : "Erro ao adicionar editor")
		} finally {
			setLoading(false)
		}
	}

	async function handleRemove(id: string) {
		setError(null)
		try {
			await removeEditorFn({ data: { id, questionnaire_id: questionnaireId } })
			await queryClient.invalidateQueries({ queryKey: ["editors", questionnaireId] })
		} catch (e) {
			setError(e instanceof Error ? e.message : "Erro ao remover editor")
		}
	}

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-base">Editores</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<p className="text-sm text-muted-foreground">Usuários adicionados aqui podem editar e publicar este questionário, mas não acessam as respostas.</p>
				<div className="flex gap-2">
					<Input
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleAdd()}
						placeholder="email@fab.mil.br"
						className="max-w-sm"
					/>
					<Button onClick={handleAdd} disabled={loading || !email.trim()} size="sm">
						Adicionar
					</Button>
				</div>
				{error && <p className="text-sm text-destructive">{error}</p>}
				{editors.length > 0 && (
					<ul className="space-y-1">
						{editors.map((editor) => (
							<li key={editor.id} className="flex items-center justify-between rounded-md border px-3 py-2">
								<span className="text-sm">{editor.editor_email}</span>
								<Button variant="ghost" size="sm" onClick={() => handleRemove(editor.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
									<Trash className="h-3.5 w-3.5" />
								</Button>
							</li>
						))}
					</ul>
				)}
				{editors.length === 0 && <p className="text-sm text-muted-foreground">Nenhum editor adicionado.</p>}
			</CardContent>
		</Card>
	)
}
