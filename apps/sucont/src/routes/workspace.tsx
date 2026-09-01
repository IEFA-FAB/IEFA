import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Bell, ClipboardList, Edit2, Loader2, Plus, StickyNote, Terminal, Trash2, Users, X } from "lucide-react"
import { motion } from "motion/react"
import React, { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useSucontAccess } from "#/auth/pbac"
import { HubLayout } from "#/components/hub-layout"
import { ReadOnlyNotice } from "#/components/read-only-notice"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"
import { getNthBusinessDay } from "#/lib/data"
import { useHubFilters } from "#/lib/hub-filters"
import {
	createChecklistItemFn,
	createNoticeFn,
	deleteChecklistItemFn,
	deleteNoticeFn,
	getWorkspaceNoteFn,
	listChecklistFn,
	listNoticesFn,
	listUnidadesGestorasFn,
	saveWorkspaceNoteFn,
	updateChecklistResponsibleFn,
} from "#/server/workspace.fn"

export const Route = createFileRoute("/workspace")({ component: Workspace })

const OPERATORS = ["3S VANESSA", "SGT KLEBSON", "3S TALITA"] as const

function Workspace() {
	const { query: searchQuery } = useHubFilters()
	const queryClient = useQueryClient()
	const [editingId, setEditingId] = useState<string | null>(null)
	const [isAddingTask, setIsAddingTask] = useState(false)
	const [isAddingNotice, setIsAddingNotice] = useState(false)

	// ── Queries ────────────────────────────────────────────
	const { data: checklist = [], isLoading: loadingChecklist } = useQuery({ queryKey: ["sucont", "checklist"], queryFn: () => listChecklistFn() })
	const { data: notices = [] } = useQuery({ queryKey: ["sucont", "notices"], queryFn: () => listNoticesFn() })
	const { data: unidades = [] } = useQuery({ queryKey: ["sucont", "unidades"], queryFn: () => listUnidadesGestorasFn() })
	const { data: noteFromDb = "" } = useQuery({ queryKey: ["sucont", "note"], queryFn: () => getWorkspaceNoteFn() })

	const invalidate = (key: string) => queryClient.invalidateQueries({ queryKey: ["sucont", key] })

	// Checklist, anotações e avisos são escrita de seção: `requireSucontEditor`
	// (nível 2) barra todas no servidor. A tela reflete isso em vez de oferecer a
	// ação e devolver 403 depois do formulário preenchido.
	const { canEdit, isLoading: loadingAccess } = useSucontAccess()

	// ── Mutations: checklist ───────────────────────────────
	const addTaskMutation = useMutation({
		mutationFn: (data: { task: string; deadline: string; description: string; responsible: string; path: string }) => createChecklistItemFn({ data }),
		onSuccess: () => {
			setIsAddingTask(false)
			invalidate("checklist")
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao adicionar"),
	})
	const deleteTaskMutation = useMutation({
		mutationFn: (id: string) => deleteChecklistItemFn({ data: { id } }),
		onSuccess: () => invalidate("checklist"),
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao excluir"),
	})
	const updateResponsibleMutation = useMutation({
		mutationFn: (data: { id: string; responsible: string }) => updateChecklistResponsibleFn({ data }),
		onSuccess: () => invalidate("checklist"),
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar"),
	})
	const updateResponsible = (id: string, value: string) => {
		setEditingId(null)
		updateResponsibleMutation.mutate({ id, responsible: value })
	}

	// ── Mutations: notices ─────────────────────────────────
	const addNoticeMutation = useMutation({
		mutationFn: (data: { content: string; type: "info" | "alert" }) => createNoticeFn({ data }),
		onSuccess: () => {
			setIsAddingNotice(false)
			invalidate("notices")
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao adicionar aviso"),
	})
	const deleteNoticeMutation = useMutation({
		mutationFn: (id: string) => deleteNoticeFn({ data: { id } }),
		onSuccess: () => invalidate("notices"),
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
	const filteredChecklist = checklist.filter(
		(item) =>
			item.task.toLowerCase().includes(searchQuery.toLowerCase()) ||
			(item.description ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
			(item.responsible ?? "").toLowerCase().includes(searchQuery.toLowerCase())
	)

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
									addTaskMutation.mutate({
										task: fd.get("task") as string,
										deadline: fd.get("deadline") as string,
										description: (fd.get("description") as string) ?? "",
										responsible: fd.get("responsible") as string,
										path: (fd.get("path") as string) ?? "",
									})
								}}
								className="grid grid-cols-1 md:grid-cols-2 gap-4"
							>
								<Input
									name="task"
									placeholder="Título da Tarefa"
									required
									className="bg-muted/50 border-border p-2 rounded text-foreground focus:border-tech-cyan"
								/>
								<Input
									name="deadline"
									placeholder="Prazo (ex: 2º dia útil)"
									required
									className="bg-muted/50 border-border p-2 rounded text-foreground focus:border-tech-cyan"
								/>
								<Input
									name="responsible"
									placeholder="Responsável"
									required
									className="bg-muted/50 border-border p-2 rounded text-foreground focus:border-tech-cyan"
								/>
								<Input
									name="path"
									placeholder="Caminho/Sistema (Opcional)"
									className="bg-muted/50 border-border p-2 rounded text-foreground focus:border-tech-cyan"
								/>
								<textarea
									name="description"
									placeholder="Descrição da atividade"
									className="bg-muted/50 border border-border p-2 rounded text-caption text-foreground md:col-span-2 h-20 focus:border-tech-cyan outline-none"
								/>
								<div className="flex gap-2 md:col-span-2 justify-end">
									<Button type="button" variant="ghost" onClick={() => setIsAddingTask(false)} className="text-muted-foreground hover:text-foreground">
										CANCELAR
									</Button>
									<Button type="submit" disabled={addTaskMutation.isPending} className="bg-tech-cyan text-white hover:bg-tech-cyan/90 shadow-md gap-2">
										{addTaskMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />} SALVAR TAREFA
									</Button>
								</div>
							</form>
						</motion.div>
					)}

					{loadingChecklist ? (
						<div className="flex items-center justify-center py-12 text-muted-foreground gap-2 text-body font-mono">
							<Loader2 className="w-4 h-4 animate-spin" /> Carregando cronograma...
						</div>
					) : (
						<div className="grid grid-cols-1 gap-4">
							{filteredChecklist.map((item, idx) => (
								<motion.div
									key={item.id}
									initial={{ opacity: 0, x: -20 }}
									animate={{ opacity: 1, x: 0 }}
									transition={{ delay: idx * 0.04 }}
									className="bg-card border border-border p-5 rounded-lg hover:border-tech-cyan/30 transition-all group shadow-sm"
								>
									<div className="flex flex-col md:flex-row justify-between gap-4">
										<div className="flex-grow">
											<div className="flex items-start gap-3 mb-2">
												<div className="flex flex-col shrink-0">
													<span className="text-tech-cyan font-mono text-label bg-tech-cyan/5 px-2 py-0.5 rounded border border-tech-cyan/10 w-fit">
														{item.deadline}
													</span>
													<span className="text-hint font-mono text-muted-foreground mt-1">Data: {getNthBusinessDay(item.deadline ?? "")}</span>
												</div>
												<h4 className="text-foreground font-bold">{item.task}</h4>
											</div>
											<p className="text-muted-foreground text-caption leading-relaxed mb-3">{item.description}</p>
											{item.path && (
												<div className="flex items-start gap-2 text-hint font-mono text-muted-foreground bg-muted/50 p-2 rounded border border-border">
													<Terminal className="w-3 h-3 mt-0.5 shrink-0" />
													<span>{item.path}</span>
												</div>
											)}
										</div>

										<div className="md:w-48 shrink-0 flex flex-col justify-center items-end border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-4">
											<span className="font-mono text-label text-muted-foreground mb-1">Responsável</span>
											{editingId === item.id ? (
												<Input
													className="bg-muted/50 border-tech-cyan/30 text-foreground p-1 rounded w-full focus:border-tech-cyan"
													defaultValue={item.responsible ?? ""}
													autoFocus
													onKeyDown={(e) => {
														if (e.key === "Enter") updateResponsible(item.id, e.currentTarget.value)
														if (e.key === "Escape") setEditingId(null)
													}}
													onBlur={(e) => updateResponsible(item.id, e.target.value)}
												/>
											) : canEdit ? (
												<Button type="button" variant="ghost" className="h-auto p-0 gap-2 group hover:bg-transparent" onClick={() => setEditingId(item.id)}>
													<span className="text-subheading text-tech-cyan">{item.responsible}</span>
													<Edit2 className="w-3 h-3 text-muted-foreground group-hover:text-tech-cyan transition-colors" />
												</Button>
											) : (
												// `.text-subheading`, não `.text-label`: o rótulo embute caixa alta, e este é
												// um nome DIGITADO pelo usuário — em maiúsculas ele deixa de bater com o campo
												// de edição ao lado e com o texto que a busca da tela filtra.
												<span className="text-subheading text-tech-cyan">{item.responsible}</span>
											)}
											{canEdit && (
												<Button
													type="button"
													variant="ghost"
													onClick={() => deleteTaskMutation.mutate(item.id)}
													className="mt-4 h-auto p-0 text-muted-foreground hover:text-destructive hover:bg-transparent opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all gap-1 text-hint font-mono"
												>
													<Trash2 className="w-3 h-3" /> EXCLUIR
												</Button>
											)}
										</div>
									</div>
								</motion.div>
							))}
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

					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						{OPERATORS.map((operator) => {
							const units = unidades.filter((u) => u.operador === operator)
							return (
								<div key={operator} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
									<div className="bg-muted/50 p-3 border-b border-border">
										<h4 className="text-foreground text-center text-label">{operator}</h4>
									</div>
									<div className="p-4 max-h-96 overflow-y-auto">
										<table className="w-full text-hint font-mono">
											<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
												<tr>
													<th className="px-4 py-3 text-left pb-2">UG</th>
													<th className="px-4 py-3 text-left pb-2">NOME</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-border">
												{units.map((u) => (
													<tr key={u.codigo} className="hover:bg-muted/50 transition-colors">
														<td className="py-2 text-tech-cyan font-bold">{u.codigo}</td>
														<td className="py-2 text-muted-foreground">{u.nome}</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
									<div className="bg-muted/50 p-2 text-center border-t border-border">
										<span className="text-hint font-mono text-muted-foreground">Total: {units.length} UGs</span>
									</div>
								</div>
							)
						})}
					</div>
				</section>
			</div>
		</HubLayout>
	)
}

// ── Helper component ──────────────────────────────────────
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
