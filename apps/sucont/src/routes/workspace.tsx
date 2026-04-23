import { createFileRoute } from "@tanstack/react-router"
import { Bell, ClipboardList, Edit2, Plus, StickyNote, Terminal, Trash2, Users, X } from "lucide-react"
import { motion } from "motion/react"
import React, { useEffect, useState } from "react"
import { HubLayout } from "#/components/hub-layout"
import { getNthBusinessDay, initialChecklist, initialNotices, unitResponsibilities } from "#/lib/data"
import { useSearchQuery } from "#/lib/hub-store"
import type { ChecklistItem, Notice } from "#/lib/types"

export const Route = createFileRoute("/workspace")({ component: Workspace })

function Workspace() {
	const searchQuery = useSearchQuery()

	// ── Checklist ──────────────────────────────────────────
	const [checklist, setChecklist] = useState<ChecklistItem[]>(initialChecklist)
	const [editingId, setEditingId] = useState<string | null>(null)
	const [isAddingTask, setIsAddingTask] = useState(false)

	// ── Notices ────────────────────────────────────────────
	const [notices, setNotices] = useState<Notice[]>(initialNotices)
	const [isAddingNotice, setIsAddingNotice] = useState(false)

	// ── Notes ──────────────────────────────────────────────
	const [notes, setNotes] = useState("")

	// Hydrate from localStorage client-side
	useEffect(() => {
		try {
			const c = localStorage.getItem("sucont_checklist")
			if (c) setChecklist(JSON.parse(c))
			const n = localStorage.getItem("sucont_notices")
			if (n) setNotices(JSON.parse(n))
			const nt = localStorage.getItem("sucont_notes")
			if (nt) setNotes(nt)
		} catch {}
	}, [])

	// Persist
	useEffect(() => {
		localStorage.setItem("sucont_checklist", JSON.stringify(checklist))
	}, [checklist])
	useEffect(() => {
		localStorage.setItem("sucont_notices", JSON.stringify(notices))
	}, [notices])
	useEffect(() => {
		localStorage.setItem("sucont_notes", notes)
	}, [notes])

	// Handlers
	const addTask = (data: Partial<ChecklistItem>) => {
		setChecklist((p) => [
			...p,
			{
				id: `task-${Date.now()}`,
				task: data.task || "Nova Tarefa",
				deadline: data.deadline || "Mensal",
				description: data.description || "",
				responsible: data.responsible || "Pendente",
				path: data.path,
			},
		])
		setIsAddingTask(false)
	}

	const deleteTask = (id: string) => setChecklist((p) => p.filter((i) => i.id !== id))

	const updateResponsible = (id: string, value: string) => {
		setChecklist((p) => p.map((i) => (i.id === id ? { ...i, responsible: value } : i)))
		setEditingId(null)
	}

	const addNotice = (content: string, type: "info" | "alert") => {
		setNotices((p) => [
			{
				id: `notice-${Date.now()}`,
				content,
				type,
				date: new Date().toLocaleDateString("pt-BR"),
			},
			...p,
		])
		setIsAddingNotice(false)
	}

	const deleteNotice = (id: string) => setNotices((p) => p.filter((n) => n.id !== id))

	// Filtered lists
	const filteredChecklist = checklist.filter(
		(item) =>
			item.task.toLowerCase().includes(searchQuery.toLowerCase()) ||
			item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
			item.responsible.toLowerCase().includes(searchQuery.toLowerCase())
	)

	return (
		<HubLayout>
			<div className="space-y-12">
				{/* ── Checklist ────────────────────────────────── */}
				<section>
					<div className="flex items-center gap-4 mb-8">
						<ClipboardList className="text-tech-cyan w-5 h-5" />
						<h2 className="text-slate-700 font-bold uppercase tracking-widest text-sm">Cronograma & Atividades</h2>
						<div className="flex-grow h-[1px] bg-slate-200" />
					</div>

					<div className="flex justify-end mb-4">
						<button
							type="button"
							onClick={() => setIsAddingTask(true)}
							className="flex items-center gap-2 bg-white border border-slate-200 text-tech-cyan px-4 py-2 rounded-md text-xs font-mono hover:bg-slate-50 transition-all shadow-sm"
						>
							<Plus className="w-4 h-4" /> ADICIONAR TAREFA
						</button>
					</div>

					{isAddingTask && (
						<motion.div
							initial={{ opacity: 0, scale: 0.95 }}
							animate={{ opacity: 1, scale: 1 }}
							className="bg-white border border-tech-cyan/30 p-6 rounded-lg mb-6 shadow-lg"
						>
							<h3 className="text-slate-800 font-bold mb-4 text-sm uppercase">Nova Atividade</h3>
							<form
								onSubmit={(e) => {
									e.preventDefault()
									const fd = new FormData(e.currentTarget)
									addTask({
										task: fd.get("task") as string,
										deadline: fd.get("deadline") as string,
										description: fd.get("description") as string,
										responsible: fd.get("responsible") as string,
										path: fd.get("path") as string,
									})
								}}
								className="grid grid-cols-1 md:grid-cols-2 gap-4"
							>
								<input
									name="task"
									placeholder="Título da Tarefa"
									required
									className="bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 focus:border-tech-cyan outline-none"
								/>
								<input
									name="deadline"
									placeholder="Prazo (ex: 2º dia útil)"
									required
									className="bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 focus:border-tech-cyan outline-none"
								/>
								<input
									name="responsible"
									placeholder="Responsável"
									required
									className="bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 focus:border-tech-cyan outline-none"
								/>
								<input
									name="path"
									placeholder="Caminho/Sistema (Opcional)"
									className="bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 focus:border-tech-cyan outline-none"
								/>
								<textarea
									name="description"
									placeholder="Descrição da atividade"
									className="bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 md:col-span-2 h-20 focus:border-tech-cyan outline-none"
								/>
								<div className="flex gap-2 md:col-span-2 justify-end">
									<button type="button" onClick={() => setIsAddingTask(false)} className="px-4 py-2 text-xs text-slate-500 hover:text-slate-800">
										CANCELAR
									</button>
									<button type="submit" className="bg-tech-cyan text-white px-6 py-2 rounded font-bold text-xs shadow-md">
										SALVAR TAREFA
									</button>
								</div>
							</form>
						</motion.div>
					)}

					<div className="grid grid-cols-1 gap-4">
						{filteredChecklist.map((item, idx) => (
							<motion.div
								key={item.id}
								initial={{ opacity: 0, x: -20 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ delay: idx * 0.04 }}
								className="bg-white border border-slate-200 p-5 rounded-lg hover:border-tech-cyan/30 transition-all group shadow-sm"
							>
								<div className="flex flex-col md:flex-row justify-between gap-4">
									<div className="flex-grow">
										<div className="flex items-start gap-3 mb-2">
											<div className="flex flex-col shrink-0">
												<span className="text-tech-cyan font-mono text-[10px] bg-tech-cyan/5 px-2 py-0.5 rounded border border-tech-cyan/10 uppercase w-fit">
													{item.deadline}
												</span>
												<span className="text-[9px] font-mono text-slate-400 mt-1">Data: {getNthBusinessDay(item.deadline)}</span>
											</div>
											<h4 className="text-slate-800 font-bold">{item.task}</h4>
										</div>
										<p className="text-slate-500 text-xs leading-relaxed mb-3">{item.description}</p>
										{item.path && (
											<div className="flex items-start gap-2 text-[10px] font-mono text-slate-400 bg-slate-50 p-2 rounded border border-slate-100">
												<Terminal className="w-3 h-3 mt-0.5 shrink-0" />
												<span>{item.path}</span>
											</div>
										)}
									</div>

									<div className="md:w-48 shrink-0 flex flex-col justify-center items-end border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-4">
										<span className="text-[10px] font-mono uppercase text-slate-400 mb-1">Responsável</span>
										{editingId === item.id ? (
											<input
												className="bg-slate-50 border border-tech-cyan/30 text-slate-800 text-xs p-1 rounded w-full focus:outline-none focus:border-tech-cyan"
												defaultValue={item.responsible}
												onKeyDown={(e) => {
													if (e.key === "Enter") updateResponsible(item.id, e.currentTarget.value)
													if (e.key === "Escape") setEditingId(null)
												}}
												onBlur={(e) => updateResponsible(item.id, e.target.value)}
											/>
										) : (
											<button type="button" className="flex items-center gap-2 group cursor-pointer" onClick={() => setEditingId(item.id)}>
												<span className="text-xs font-bold text-tech-cyan">{item.responsible}</span>
												<Edit2 className="w-3 h-3 text-slate-300 group-hover:text-tech-cyan transition-colors" />
											</button>
										)}
										<button
											type="button"
											onClick={() => deleteTask(item.id)}
											className="mt-4 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 text-[9px] font-mono"
										>
											<Trash2 className="w-3 h-3" /> EXCLUIR
										</button>
									</div>
								</div>
							</motion.div>
						))}
					</div>
				</section>

				{/* ── Notes & Notices ───────────────────────────── */}
				<section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
					{/* Notes */}
					<div>
						<div className="flex items-center gap-3 mb-4">
							<StickyNote className="text-tech-cyan w-4 h-4" />
							<h3 className="text-slate-700 font-bold uppercase tracking-widest text-xs">Anotações da Seção</h3>
						</div>
						<textarea
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Digite aqui anotações importantes, pendências ou lembretes..."
							className="w-full h-64 bg-white border border-slate-200 rounded-lg p-4 text-slate-600 text-sm font-mono focus:outline-none focus:border-tech-cyan/40 transition-all resize-none shadow-sm"
						/>
						<div className="mt-2 flex justify-end">
							<span className="text-[9px] font-mono text-slate-400 uppercase">Auto-save ativo</span>
						</div>
					</div>

					{/* Notices */}
					<div>
						<div className="flex items-center justify-between mb-4">
							<div className="flex items-center gap-3">
								<Bell className="text-tech-blue w-4 h-4" />
								<h3 className="text-slate-700 font-bold uppercase tracking-widest text-xs">Avisos & Alertas</h3>
							</div>
							<button type="button" onClick={() => setIsAddingNotice(true)} className="text-tech-cyan hover:text-slate-800 transition-colors">
								<Plus className="w-4 h-4" />
							</button>
						</div>

						{isAddingNotice && <AddNoticeForm onSave={addNotice} onCancel={() => setIsAddingNotice(false)} />}

						<div className="space-y-3">
							{notices.map((notice) => (
								<div
									key={notice.id}
									className={`group relative border-l-4 p-4 rounded-r-lg shadow-sm ${
										notice.type === "alert" ? "bg-orange-50 border-orange-400" : "bg-blue-50 border-blue-400"
									}`}
								>
									<button
										type="button"
										onClick={() => deleteNotice(notice.id)}
										className="absolute top-2 right-2 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
									>
										<X className="w-3 h-3" />
									</button>
									<p className="text-xs text-slate-700 font-medium">{notice.content}</p>
									<span className="text-[9px] font-mono text-slate-400 mt-2 block uppercase">Postado em: {notice.date}</span>
								</div>
							))}
						</div>
					</div>
				</section>

				{/* ── Units Division ────────────────────────────── */}
				<section>
					<div className="flex items-center gap-4 mb-8">
						<Users className="text-tech-cyan w-5 h-5" />
						<h2 className="text-slate-700 font-bold uppercase tracking-widest text-sm">Divisão de Unidades (UGs)</h2>
						<div className="flex-grow h-[1px] bg-slate-200" />
					</div>

					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						{(["3S VANESSA", "SGT KLEBSON", "3S TALITA"] as const).map((operator) => {
							const units = unitResponsibilities.filter((u) => u.operator === operator)
							return (
								<div key={operator} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
									<div className="bg-slate-50 p-3 border-b border-slate-100">
										<h4 className="text-slate-700 font-bold text-center text-xs uppercase tracking-widest">{operator}</h4>
									</div>
									<div className="p-4 max-h-96 overflow-y-auto">
										<table className="w-full text-[10px] font-mono">
											<thead>
												<tr className="text-slate-400 border-b border-slate-100">
													<th className="text-left pb-2">UG</th>
													<th className="text-left pb-2">NOME</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-slate-50">
												{units.map((u) => (
													<tr key={u.code} className="hover:bg-slate-50 transition-colors">
														<td className="py-2 text-tech-cyan font-bold">{u.code}</td>
														<td className="py-2 text-slate-600">{u.name}</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
									<div className="bg-slate-50 p-2 text-center border-t border-slate-100">
										<span className="text-[9px] font-mono text-slate-400">Total: {units.length} UGs</span>
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
function AddNoticeForm({ onSave, onCancel }: { onSave: (content: string, type: "info" | "alert") => void; onCancel: () => void }) {
	const [content, setContent] = React.useState("")
	const [type, setType] = React.useState<"info" | "alert">("info")

	return (
		<motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-tech-cyan/30 p-4 rounded-lg mb-4 shadow-md">
			<textarea
				value={content}
				onChange={(e) => setContent(e.target.value)}
				placeholder="Novo aviso..."
				className="w-full bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 mb-2 h-20 outline-none focus:border-tech-cyan"
			/>
			<div className="flex justify-between items-center">
				<select
					value={type}
					onChange={(e) => setType(e.target.value as "info" | "alert")}
					className="bg-slate-50 border border-slate-200 text-[10px] text-slate-600 p-1 rounded outline-none"
				>
					<option value="info">INFORMATIVO</option>
					<option value="alert">ALERTA</option>
				</select>
				<div className="flex gap-2">
					<button type="button" onClick={onCancel} className="text-[10px] text-slate-400 hover:text-slate-600">
						CANCELAR
					</button>
					<button
						type="button"
						onClick={() => content && onSave(content, type)}
						className="bg-tech-cyan text-white px-3 py-1 rounded font-bold text-[10px] shadow-sm"
					>
						SALVAR
					</button>
				</div>
			</div>
		</motion.div>
	)
}
