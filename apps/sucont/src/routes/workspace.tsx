import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Bell, ClipboardList, Loader2, Plus, StickyNote, Terminal, Trash2, Users, X } from "lucide-react"
import { motion } from "motion/react"
import React, { useEffect, useRef, useState } from "react"
import { requireAnyDivision, useSucontAccess } from "#/auth/pbac"
import { HubLayout } from "#/components/hub-layout"
import { AssigneePicker, type AssigneeValue, OperatorPicker } from "#/components/people-picker"
import { ReadOnlyNotice } from "#/components/read-only-notice"
import { Button } from "#/components/ui/button"
import { Checkbox } from "#/components/ui/checkbox"
import { Input } from "#/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"
import { toast } from "#/components/ui/toast"
import { addDays, dateInBrasilia, formatBrDate, todayInBrasilia } from "#/lib/brasilia"
import {
	CHECKLIST_RECURRENCES,
	type ChecklistRecurrence,
	type DeadlineStatus,
	deadlineStatus,
	MAX_BUSINESS_DAY,
	parseAssignees,
	RECURRENCE_LABELS,
	UPCOMING_WINDOW_DAYS,
} from "#/lib/checklist"
import { useHubFilters } from "#/lib/hub-filters"
import { notificationsQueryOptions, sectionPeopleQueryOptions } from "#/lib/notifications"
import { checklistQueryOptions, noticesQueryOptions, unidadesGestorasQueryOptions, workspaceNoteQueryOptions } from "#/lib/queries"
import { cn } from "#/lib/utils"
import type { SectionPerson } from "#/server/people.fn"
import type { ChecklistRecurrenceInput } from "#/server/workspace.fn"
import {
	createChecklistItemFn,
	createNoticeFn,
	deleteChecklistItemFn,
	deleteNoticeFn,
	saveWorkspaceNoteFn,
	setChecklistAssigneesFn,
	setChecklistDoneFn,
	setUgOperatorFn,
} from "#/server/workspace.fn"

export const Route = createFileRoute("/workspace")({
	// Tela da seção: basta uma divisão qualquer.
	beforeLoad: requireAnyDivision,
	// As quatro leituras saem juntas aqui, em paralelo entre si, em vez de em fila
	// atrás da hidratação. Disparadas sem espera: cada `useQuery` da tela tem o
	// próprio estado de carregamento, e o `.catch` deixa a falha no cache para ele
	// tratar, em vez de trocar a tela pelo error boundary.
	loader: ({ context }) => {
		void context.queryClient.query({ ...checklistQueryOptions(), staleTime: "static" }).catch(() => {})
		void context.queryClient.query({ ...noticesQueryOptions(), staleTime: "static" }).catch(() => {})
		void context.queryClient.query({ ...unidadesGestorasQueryOptions(), staleTime: "static" }).catch(() => {})
		void context.queryClient.query({ ...workspaceNoteQueryOptions(), staleTime: "static" }).catch(() => {})
		void context.queryClient.query({ ...sectionPeopleQueryOptions(), staleTime: "static" }).catch(() => {})
	},
	component: Workspace,
})

/**
 * A linha abaixo do rótulo do prazo. Diz a DATA e o que ela significa hoje.
 *
 * Antes dizia só "Data: dd/mm/aaaa", calculada no navegador por uma regex sobre o
 * texto do prazo — que lia o "1" de "1x por semana" e anunciava o 1º dia útil do
 * mês para uma tarefa semanal, e que contava fim de semana mas não feriado. Agora
 * a data vem pronta do banco (`due_on`), com o calendário de feriados aplicado.
 */
function deadlineHint(status: DeadlineStatus, dueOn: string | null, doneAt: string | null): string {
	if (!dueOn) return "Sem prazo definido"
	if (status === "done" && doneAt) return `Feito em ${formatBrDate(dateInBrasilia(doneAt))}`
	if (status === "overdue") return `Venceu em ${formatBrDate(dueOn)}`
	if (status === "today") return `Vence hoje, ${formatBrDate(dueOn)}`
	return `Vence em ${formatBrDate(dueOn)}`
}

function Workspace() {
	const { query: searchQuery } = useHubFilters()
	const queryClient = useQueryClient()
	const [isAddingTask, setIsAddingTask] = useState(false)
	const [isAddingNotice, setIsAddingNotice] = useState(false)

	// ── Queries ────────────────────────────────────────────
	const { data: checklist = [], isLoading: loadingChecklist } = useQuery(checklistQueryOptions())
	const { data: notices = [] } = useQuery(noticesQueryOptions())
	const { data: unidades = [] } = useQuery(unidadesGestorasQueryOptions())
	const { data: noteFromDb = "" } = useQuery(workspaceNoteQueryOptions())
	const { data: people = [] } = useQuery(sectionPeopleQueryOptions())

	const invalidateChecklist = () => queryClient.invalidateQueries({ queryKey: checklistQueryOptions().queryKey })
	// O sino também: marcar uma tarefa como feita RESOLVE a notificação de prazo
	// perdido dela (gatilho no banco), e publicar um aviso cria uma para o próprio
	// autor. Sem esta invalidação a bolinha só corrigiria no recarregamento.
	const invalidateNotifications = () => queryClient.invalidateQueries({ queryKey: notificationsQueryOptions().queryKey })
	const invalidatePeople = () => queryClient.invalidateQueries({ queryKey: sectionPeopleQueryOptions().queryKey })
	const invalidateNotices = () => {
		queryClient.invalidateQueries({ queryKey: noticesQueryOptions().queryKey })
		invalidateNotifications()
	}

	// Checklist, anotações e avisos são escrita de seção: `requireSucontEditor`
	// (nível 2) barra todas no servidor. A tela reflete isso em vez de oferecer a
	// ação e devolver 403 depois do formulário preenchido.
	// Tela da SEÇÃO: quem edita por qualquer divisão edita aqui — é o mesmo
	// `requireSucontEditor` que a server function cobra.
	const { canEditAny: canEdit, isLoading: loadingAccess } = useSucontAccess()

	// ── Mutations: checklist ───────────────────────────────
	const addTaskMutation = useMutation({
		mutationFn: (data: { task: string; description: string; path: string; personIds: string[]; assignToAll: boolean } & ChecklistRecurrenceInput) =>
			createChecklistItemFn({ data }),
		onSuccess: () => {
			setIsAddingTask(false)
			invalidateChecklist()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao adicionar"),
	})
	const setDoneMutation = useMutation({
		mutationFn: (data: { id: string; done: boolean }) => setChecklistDoneFn({ data }),
		onSuccess: () => {
			invalidateChecklist()
			invalidateNotifications()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao registrar a execução"),
	})
	const deleteTaskMutation = useMutation({
		mutationFn: (id: string) => deleteChecklistItemFn({ data: { id } }),
		onSuccess: () => invalidateChecklist(),
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao excluir"),
	})
	const setAssigneesMutation = useMutation({
		mutationFn: (data: { id: string; personIds: string[]; assignToAll: boolean }) => setChecklistAssigneesFn({ data }),
		onSuccess: () => {
			invalidateChecklist()
			invalidatePeople()
			// Atribuir gera notificação para quem entrou e resolve a de quem saiu —
			// os dois por gatilho no banco. Sem isto a bolinha só corrigiria no F5.
			invalidateNotifications()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar os responsáveis"),
	})
	const setUgOperatorMutation = useMutation({
		mutationFn: (data: { codigo: string; personId: string | null }) => setUgOperatorFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: unidadesGestorasQueryOptions().queryKey })
			invalidatePeople()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao mudar o operador"),
	})

	// ── Mutations: notices ─────────────────────────────────
	const addNoticeMutation = useMutation({
		mutationFn: (data: { content: string; type: "info" | "alert" }) => createNoticeFn({ data }),
		onSuccess: () => {
			setIsAddingNotice(false)
			invalidateNotices()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao adicionar aviso"),
	})
	const deleteNoticeMutation = useMutation({
		mutationFn: (id: string) => deleteNoticeFn({ data: { id } }),
		onSuccess: () => invalidateNotices(),
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao excluir aviso"),
	})

	// ── Nota livre (auto-save com debounce) ────────────────
	// `dirtyRef` marca edição local pendente. Enquanto sujo, não re-sincroniza do DB
	// (não perde o que o usuário digitou); quando limpo, reflete mudanças de outros
	// operadores. `latestRef` evita corrida: só limpa o dirty se nada novo foi
	// digitado desde o save que acabou de confirmar.
	const [notes, setNotes] = useState("")
	const dirtyRef = useRef(false)
	const latestRef = useRef("")
	useEffect(() => {
		latestRef.current = notes
	}, [notes])
	useEffect(() => {
		if (!dirtyRef.current) setNotes(noteFromDb)
	}, [noteFromDb])
	const saveNoteMutation = useMutation({
		mutationFn: (content: string) => saveWorkspaceNoteFn({ data: { content } }),
		onSuccess: (_res, content) => {
			if (content === latestRef.current) dirtyRef.current = false
		},
	})
	const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const onNotesChange = (value: string) => {
		dirtyRef.current = true
		setNotes(value)
		if (noteTimer.current) clearTimeout(noteTimer.current)
		noteTimer.current = setTimeout(() => saveNoteMutation.mutate(value), 800)
	}
	// Limpa o timer pendente no unmount (evita save/estado após desmontar).
	useEffect(
		() => () => {
			if (noteTimer.current) clearTimeout(noteTimer.current)
		},
		[]
	)

	// ── Filtro ─────────────────────────────────────────────
	const needle = searchQuery.toLowerCase()
	const filteredChecklist = checklist.filter((item) =>
		[item.task, item.description, ...parseAssignees(item.assignees).map((a) => a.label)].some((field) => (field ?? "").toLowerCase().includes(needle))
	)

	// "Hoje" em Brasília, e não `new Date()`: o container roda em UTC e das 21h à
	// meia-noite um prazo de hoje já aparecia como vencido.
	const today = todayInBrasilia()
	const upcomingUntil = addDays(today, UPCOMING_WINDOW_DAYS)

	// Um grupo por pessoa da seção, na ordem do cadastro, mais "sem operador"
	// quando houver UG órfã. Pessoa sem nenhuma UG continua aparecendo: um cartão
	// vazio diz "esta pessoa está livre", que é informação; escondê-lo faria a
	// distribuição parecer completa.
	const ugGroups = [
		...people.map((person) => ({
			id: person.id as string | null,
			label: person.label,
			units: unidades.filter((u) => u.operator_person_id === person.id),
		})),
		{ id: null, label: "Sem operador", units: unidades.filter((u) => !u.operator_person_id) },
	].filter((group) => group.id !== null || group.units.length > 0)

	return (
		<HubLayout title="Área de trabalho" description="Cronograma, anotações e avisos da seção." searchable>
			<div className="space-y-12">
				{/* ── Checklist ────────────────────────────────── */}
				<section>
					<div className="flex items-center gap-4 mb-8">
						<ClipboardList className="text-tech-cyan w-5 h-5" />
						<h2 className="text-foreground text-label">Cronograma & Atividades</h2>
						<div className="flex-grow h-[1px] bg-border" />
					</div>

					{!canEdit && !loadingAccess && (
						<div className="mb-6">
							<ReadOnlyNotice scope="o cronograma, as anotações e os avisos da seção" />
						</div>
					)}

					{canEdit && (
						<div className="flex justify-end mb-4">
							<Button
								type="button"
								variant="outline"
								onClick={() => setIsAddingTask(true)}
								className="gap-2 bg-card text-tech-cyan font-mono hover:bg-muted/50"
							>
								<Plus className="w-4 h-4" /> ADICIONAR TAREFA
							</Button>
						</div>
					)}

					{isAddingTask && canEdit && (
						<AddTaskForm
							people={people}
							onSave={(data) => addTaskMutation.mutate(data)}
							onCancel={() => setIsAddingTask(false)}
							pending={addTaskMutation.isPending}
						/>
					)}

					{loadingChecklist ? (
						<div className="flex items-center justify-center py-12 text-muted-foreground gap-2 text-body font-mono">
							<Loader2 className="w-4 h-4 animate-spin" /> Carregando cronograma...
						</div>
					) : (
						<div className="grid grid-cols-1 gap-4">
							{filteredChecklist.map((item, idx) => {
								// A view resolve o período para todo item; o tipo gerado é que é
								// nullable coluna a coluna. Sem id não há o que renderizar.
								if (!item.id) return null
								const status = item.due_on ? deadlineStatus(item.due_on, item.done_at, today, upcomingUntil) : "scheduled"
								const done = Boolean(item.done_at)
								return (
									<motion.div
										key={item.id}
										initial={{ opacity: 0, x: -20 }}
										animate={{ opacity: 1, x: 0 }}
										transition={{ delay: idx * 0.04 }}
										className={cn(
											"bg-card border border-border p-5 rounded-lg hover:border-tech-cyan/30 transition-all group shadow-sm",
											// Vencido se distingue por borda INTEIRA e tint de fundo,
											// nunca por faixa colorida de um lado só: `border-l-4` +
											// canto arredondado do outro lado é proibição global do
											// monorepo.
											status === "overdue" && "border-destructive/40 bg-destructive/5",
											status === "today" && "border-warning/40 bg-warning/5",
											done && "opacity-70"
										)}
									>
										<div className="flex flex-col md:flex-row justify-between gap-4">
											<div className="flex-grow flex gap-3">
												{/*
												 * A execução é da COMPETÊNCIA corrente, não do item: marcar
												 * em setembro segue marcado em setembro depois que outubro
												 * começa. Quem não pode editar vê o estado sem poder mexer,
												 * em vez de um controle que devolveria 403.
												 */}
												<Checkbox
													className="mt-1 shrink-0"
													checked={done}
													disabled={!canEdit || setDoneMutation.isPending}
													onCheckedChange={(checked) => setDoneMutation.mutate({ id: item.id as string, done: Boolean(checked) })}
													aria-label={done ? `Desmarcar ${item.task} como feita` : `Marcar ${item.task} como feita`}
												/>
												<div className="min-w-0 flex-grow">
													<div className="flex items-start gap-3 mb-2">
														<div className="flex flex-col shrink-0">
															<span className="text-tech-cyan font-mono text-label bg-tech-cyan/5 px-2 py-0.5 rounded border border-tech-cyan/10 w-fit">
																{item.deadline}
															</span>
															<span className="text-hint font-mono text-muted-foreground mt-1">{deadlineHint(status, item.due_on, item.done_at)}</span>
														</div>
														<h4 className={cn("text-foreground font-bold", done && "line-through")}>{item.task}</h4>
													</div>
													<p className="text-muted-foreground text-caption leading-relaxed mb-3">{item.description}</p>
													{item.path && (
														<div className="flex items-start gap-2 text-hint font-mono text-muted-foreground bg-muted/50 p-2 rounded border border-border">
															<Terminal className="w-3 h-3 mt-0.5 shrink-0" />
															<span>{item.path}</span>
														</div>
													)}
												</div>
											</div>

											<div className="md:w-56 shrink-0 flex flex-col justify-center items-end border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-4">
												<span className="font-mono text-label text-muted-foreground mb-1">Responsáveis</span>
												{/*
												 * O campo de texto virou seleção sobre o cadastro de pessoas.
												 * Antes, o Enter e o `onBlur` disparavam o MESMO salvamento —
												 * o Enter desmontava o campo e o blur ainda podia escapar,
												 * gravando duas vezes. Aqui a escrita sai do popover, uma vez.
												 */}
												<AssigneePicker
													people={people}
													disabled={!canEdit || setAssigneesMutation.isPending}
													value={{ personIds: parseAssignees(item.assignees).map((a) => a.id), assignToAll: Boolean(item.assign_to_all) }}
													onChange={(next) => setAssigneesMutation.mutate({ id: item.id as string, ...next })}
												/>
												{canEdit && (
													<Button
														type="button"
														variant="ghost"
														onClick={() => deleteTaskMutation.mutate(item.id as string)}
														className="mt-4 h-auto p-0 text-muted-foreground hover:text-destructive hover:bg-transparent opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all gap-1 text-hint font-mono"
													>
														<Trash2 className="w-3 h-3" /> EXCLUIR
													</Button>
												)}
											</div>
										</div>
									</motion.div>
								)
							})}
						</div>
					)}
				</section>

				{/* ── Notes & Notices ───────────────────────────── */}
				<section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
					<div>
						<div className="flex items-center gap-3 mb-4">
							<StickyNote className="text-tech-cyan w-4 h-4" />
							<h3 className="text-foreground text-label">Anotações da Seção</h3>
						</div>
						<textarea
							value={notes}
							onChange={(e) => onNotesChange(e.target.value)}
							readOnly={!canEdit}
							aria-readonly={!canEdit}
							placeholder={canEdit ? "Digite aqui anotações importantes, pendências ou lembretes..." : "Sem anotações registradas."}
							className="w-full h-64 bg-card border border-border rounded-lg p-4 text-muted-foreground text-body font-mono focus:outline-none focus:border-tech-cyan/40 transition-all resize-none shadow-sm read-only:bg-muted/50 read-only:text-muted-foreground"
						/>
						<div className="mt-2 flex justify-end">
							<span className="font-mono text-label text-muted-foreground">
								{!canEdit ? "Somente leitura" : saveNoteMutation.isPending ? "Salvando..." : "Auto-save ativo"}
							</span>
						</div>
					</div>

					<div>
						<div className="flex items-center justify-between mb-4">
							<div className="flex items-center gap-3">
								<Bell className="text-tech-blue w-4 h-4" />
								<h3 className="text-foreground text-label">Avisos & Alertas</h3>
							</div>
							{canEdit && (
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									onClick={() => setIsAddingNotice(true)}
									aria-label="Adicionar aviso"
									className="text-tech-cyan hover:text-foreground hover:bg-transparent transition-colors"
								>
									<Plus className="w-4 h-4" />
								</Button>
							)}
						</div>

						{isAddingNotice && canEdit && (
							<AddNoticeForm
								onSave={(content, type) => addNoticeMutation.mutate({ content, type })}
								onCancel={() => setIsAddingNotice(false)}
								pending={addNoticeMutation.isPending}
							/>
						)}

						<div className="space-y-3">
							{notices.map((notice) => (
								<div
									key={notice.id}
									className={`group relative border p-4 rounded-lg shadow-sm ${notice.type === "alert" ? "bg-warning/10 border-warning/30" : "bg-action/10 border-action/30"}`}
								>
									{canEdit && (
										<Button
											type="button"
											variant="ghost"
											size="icon-xs"
											onClick={() => deleteNoticeMutation.mutate(notice.id)}
											aria-label={`Excluir aviso: ${notice.content}`}
											className="absolute top-2 right-2 text-muted-foreground hover:text-destructive hover:bg-transparent opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
										>
											<X className="w-3 h-3" />
										</Button>
									)}
									<p className="text-caption text-foreground">{notice.content}</p>
									<span className="font-mono text-label text-muted-foreground mt-2 block">Postado em: {notice.date}</span>
								</div>
							))}
						</div>
					</div>
				</section>

				{/* ── Units Division ────────────────────────────── */}
				<section>
					<div className="flex items-center gap-4 mb-8">
						<Users className="text-tech-cyan w-5 h-5" />
						<h2 className="text-foreground text-label">Divisão de Unidades (UGs)</h2>
						<div className="flex-grow h-[1px] bg-border" />
					</div>

					{/*
					 * Os grupos saem do DADO, não de uma lista de três nomes escrita no
					 * arquivo. Com a lista fixa, UG cujo operador não estivesse nela
					 * sumia da tela sem aviso, e o "Total: N UGs" de cada cartão somava
					 * só o que tinha sobrado — a tela mentia sobre a cobertura.
					 * "Sem operador" é um grupo de verdade: ele é a fila de trabalho.
					 */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						{ugGroups.map((group) => (
							<div key={group.id ?? "sem-operador"} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
								<div className="bg-muted/50 p-3 border-b border-border">
									<h4 className={cn("text-center text-label", group.id ? "text-foreground" : "text-muted-foreground")}>{group.label}</h4>
								</div>
								<div className="p-4 max-h-96 overflow-y-auto">
									<table className="w-full text-hint font-mono">
										<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
											<tr>
												<th className="px-4 py-3 text-left pb-2">UG</th>
												<th className="px-4 py-3 text-left pb-2">NOME</th>
												{canEdit && <th className="w-8 px-2 py-3" />}
											</tr>
										</thead>
										<tbody className="divide-y divide-border">
											{group.units.map((u) => (
												<tr key={u.codigo} className="group/ug hover:bg-muted/50 transition-colors">
													<td className="py-2 text-tech-cyan font-bold">{u.codigo}</td>
													<td className="py-2 text-muted-foreground">{u.nome}</td>
													{canEdit && (
														<td className="py-2 pr-1 text-right">
															<OperatorPicker
																people={people}
																value={u.operator_person_id}
																label={u.nome}
																onChange={(personId) => setUgOperatorMutation.mutate({ codigo: u.codigo, personId })}
															/>
														</td>
													)}
												</tr>
											))}
										</tbody>
									</table>
								</div>
								<div className="bg-muted/50 p-2 text-center border-t border-border">
									<span className="text-hint font-mono text-muted-foreground">Total: {group.units.length} UGs</span>
								</div>
							</div>
						))}
					</div>
				</section>
			</div>
		</HubLayout>
	)
}

// ── Helper components ─────────────────────────────────────
/**
 * Nova atividade.
 *
 * O prazo deixou de ser um campo de texto ("Prazo (ex: 2º dia útil)") e virou o
 * par recorrência + dia útil — os mesmos dois campos que o banco guarda e que o
 * cron lê. O rótulo continua existindo, mas é DERIVADO no servidor: pedir os dois
 * deixaria o texto dizer "semanal" enquanto a coluna calculava por mês, que é a
 * divergência que a tela tinha.
 */
function AddTaskForm({
	people,
	onSave,
	onCancel,
	pending,
}: {
	people: SectionPerson[]
	onSave: (data: { task: string; description: string; path: string; personIds: string[]; assignToAll: boolean } & ChecklistRecurrenceInput) => void
	onCancel: () => void
	pending: boolean
}) {
	const [recurrence, setRecurrence] = React.useState<ChecklistRecurrence>("monthly_business_day")
	const [businessDay, setBusinessDay] = React.useState("2")
	const [assignees, setAssignees] = React.useState<AssigneeValue>({ personIds: [], assignToAll: false })

	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{ opacity: 1, scale: 1 }}
			className="bg-card border border-tech-cyan/30 p-6 rounded-lg mb-6 shadow-lg"
		>
			<h3 className="text-foreground mb-4 text-label">Nova Atividade</h3>
			<form
				onSubmit={(e) => {
					e.preventDefault()
					const fd = new FormData(e.currentTarget)
					const base = {
						task: fd.get("task") as string,
						description: (fd.get("description") as string) ?? "",
						path: (fd.get("path") as string) ?? "",
						personIds: assignees.personIds,
						assignToAll: assignees.assignToAll,
					}
					// A união é discriminada no servidor: `businessDay` só existe no ramo
					// que o usa. Mandá-lo sempre faria o schema recusar a tarefa semanal.
					onSave(recurrence === "monthly_business_day" ? { ...base, recurrence, businessDay: Number(businessDay) } : { ...base, recurrence })
				}}
				className="grid grid-cols-1 md:grid-cols-2 gap-4"
			>
				<Input name="task" placeholder="Título da Tarefa" required className="bg-muted/50 border-border p-2 rounded text-foreground focus:border-tech-cyan" />
				<div className="flex flex-col gap-1">
					<span className="font-mono text-label text-muted-foreground">Responsáveis</span>
					{/* Tarefa pode nascer sem dono — é melhor do que forçar um nome
					    inventado só para o formulário aceitar. */}
					<AssigneePicker people={people} value={assignees} onChange={setAssignees} />
				</div>
				<div className="flex flex-col gap-1">
					<label htmlFor="task-recurrence" className="font-mono text-label text-muted-foreground">
						Recorrência
					</label>
					<Select items={RECURRENCE_LABELS} value={recurrence} onValueChange={(value) => setRecurrence((value as ChecklistRecurrence | null) ?? "monthly")}>
						<SelectTrigger id="task-recurrence" className="bg-muted/50 border-border text-foreground">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CHECKLIST_RECURRENCES.map((option) => (
								<SelectItem key={option} value={option}>
									{RECURRENCE_LABELS[option]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				{recurrence === "monthly_business_day" && (
					<div className="flex flex-col gap-1">
						<label htmlFor="task-business-day" className="font-mono text-label text-muted-foreground">
							Dia útil do mês
						</label>
						<Input
							id="task-business-day"
							type="number"
							min={1}
							max={MAX_BUSINESS_DAY}
							required
							value={businessDay}
							onChange={(e) => setBusinessDay(e.target.value)}
							className="bg-muted/50 border-border p-2 rounded text-foreground focus:border-tech-cyan"
						/>
					</div>
				)}
				<Input
					name="path"
					placeholder="Caminho/Sistema (Opcional)"
					className="bg-muted/50 border-border p-2 rounded text-foreground focus:border-tech-cyan md:col-span-2"
				/>
				<textarea
					name="description"
					placeholder="Descrição da atividade"
					className="bg-muted/50 border border-border p-2 rounded text-caption text-foreground md:col-span-2 h-20 focus:border-tech-cyan outline-none"
				/>
				<div className="flex gap-2 md:col-span-2 justify-end">
					<Button type="button" variant="ghost" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
						CANCELAR
					</Button>
					<Button type="submit" disabled={pending} className="bg-tech-cyan text-white hover:bg-tech-cyan/90 shadow-md gap-2">
						{pending && <Loader2 className="w-3 h-3 animate-spin" />} SALVAR TAREFA
					</Button>
				</div>
			</form>
		</motion.div>
	)
}

function AddNoticeForm({ onSave, onCancel, pending }: { onSave: (content: string, type: "info" | "alert") => void; onCancel: () => void; pending: boolean }) {
	const [content, setContent] = React.useState("")
	const [type, setType] = React.useState<"info" | "alert">("info")

	return (
		<motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-tech-cyan/30 p-4 rounded-lg mb-4 shadow-md">
			<textarea
				value={content}
				onChange={(e) => setContent(e.target.value)}
				placeholder="Novo aviso..."
				className="w-full bg-muted/50 border border-border p-2 rounded text-caption text-foreground mb-2 h-20 outline-none focus:border-tech-cyan"
			/>
			<div className="flex justify-between items-center">
				<Select items={{ info: "INFORMATIVO", alert: "ALERTA" }} value={type} onValueChange={(value) => setType(value as "info" | "alert")}>
					<SelectTrigger className="data-[size=default]:h-auto bg-muted/50 border border-border text-hint text-muted-foreground p-1 rounded shadow-none">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="info">INFORMATIVO</SelectItem>
						<SelectItem value="alert">ALERTA</SelectItem>
					</SelectContent>
				</Select>
				<div className="flex gap-2">
					<Button
						type="button"
						variant="ghost"
						onClick={onCancel}
						className="h-auto p-0 hover:bg-transparent text-hint text-muted-foreground hover:text-foreground"
					>
						CANCELAR
					</Button>
					<Button
						type="button"
						disabled={pending}
						onClick={() => content && onSave(content, type)}
						className="bg-tech-cyan text-white hover:bg-tech-cyan/90 h-auto px-3 py-1 shadow-sm gap-1 text-hint"
					>
						{pending && <Loader2 className="w-3 h-3 animate-spin" />} SALVAR
					</Button>
				</div>
			</div>
		</motion.div>
	)
}
