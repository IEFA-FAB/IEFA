import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FileBarChart, Loader2, Plus } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useSucontAccess } from "#/auth/pbac"
import { HubLayout } from "#/components/hub-layout"
import { ReadOnlyNotice } from "#/components/read-only-notice"
import { ToolCard } from "#/components/tool-card"
import { useHubFilters } from "#/lib/hub-filters"
import type { Tool } from "#/lib/types"
import { createReportFn, deleteReportFn, listReportsFn } from "#/server/reports.fn"

export const Route = createFileRoute("/reports")({ component: Reports })

const reportsQueryKey = ["sucont", "reports"] as const

function Reports() {
	const { query } = useHubFilters()
	const searchQuery = query
	const queryClient = useQueryClient()
	const [isAdding, setIsAdding] = useState(false)
	// Exclusão é definitiva e sem desfazer: passa por confirmação explícita.
	const [pendingDelete, setPendingDelete] = useState<Tool | null>(null)

	const { data: reports = [], isLoading } = useQuery({
		queryKey: reportsQueryKey,
		queryFn: () => listReportsFn(),
	})

	// Anexar e excluir exigem nível 2 (requireSucontEditor nas server fns). Enquanto
	// a permissão não resolveu, a ação não aparece: melhor um botão que chega tarde
	// do que um que promete o que o servidor vai negar.
	const { canEdit, isLoading: loadingAccess } = useSucontAccess()

	const invalidate = () => queryClient.invalidateQueries({ queryKey: reportsQueryKey })

	const createMutation = useMutation({
		mutationFn: (data: { title: string; url: string; description: string }) => createReportFn({ data }),
		onSuccess: () => {
			setIsAdding(false)
			invalidate()
			toast.success("Relatório salvo")
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
	})

	const deleteMutation = useMutation({
		mutationFn: (id: string) => deleteReportFn({ data: { id } }),
		onSuccess: () => {
			setPendingDelete(null)
			invalidate()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao excluir"),
	})

	// DB Report → forma Tool que o ToolCard consome.
	const asTools: Tool[] = reports.map((r) => ({
		id: r.id,
		title: r.title,
		description: r.description ?? "",
		url: r.url,
		icon: r.icon ?? "FileBarChart",
		category: r.category ?? "Relatórios",
		iconColor: "bg-tech-blue",
	}))

	const filtered = asTools.filter(
		(r) => r.title.toLowerCase().includes(searchQuery.toLowerCase()) || (r.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
	)

	return (
		<HubLayout searchable>
			<div className="space-y-8">
				<div className="flex items-center gap-4">
					<FileBarChart className="text-tech-cyan w-5 h-5" />
					<h2 className="text-slate-700 font-bold uppercase tracking-widest text-sm">Gestão de Relatórios</h2>
					<div className="flex-grow h-[1px] bg-slate-200" />
				</div>

				{!canEdit && !loadingAccess && <ReadOnlyNotice scope="os relatórios da seção" />}

				{canEdit && (
					<div className="flex justify-end">
						<button
							type="button"
							onClick={() => setIsAdding(true)}
							className="flex items-center gap-2 bg-white border border-slate-200 text-tech-cyan px-4 py-2 rounded-md text-xs font-mono hover:bg-slate-50 transition-all shadow-sm"
						>
							<Plus className="w-4 h-4" /> ANEXAR RELATÓRIO
						</button>
					</div>
				)}

				{isAdding && canEdit && (
					<motion.div
						initial={{ opacity: 0, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						className="bg-white border border-tech-cyan/30 p-6 rounded-lg shadow-lg"
					>
						<h3 className="text-slate-800 font-bold mb-4 text-sm uppercase">Novo Relatório</h3>
						<form
							onSubmit={(e) => {
								e.preventDefault()
								const fd = new FormData(e.currentTarget)
								createMutation.mutate({
									title: fd.get("title") as string,
									url: fd.get("url") as string,
									description: (fd.get("description") as string) ?? "",
								})
							}}
							className="grid grid-cols-1 md:grid-cols-2 gap-4"
						>
							<input
								name="title"
								placeholder="Título do Relatório"
								required
								className="bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 focus:border-tech-cyan outline-none"
							/>
							<input
								name="url"
								placeholder="URL do Relatório"
								required
								className="bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 focus:border-tech-cyan outline-none"
							/>
							<textarea
								name="description"
								placeholder="Descrição breve"
								className="bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 md:col-span-2 h-20 focus:border-tech-cyan outline-none"
							/>
							<div className="flex gap-2 md:col-span-2 justify-end">
								<button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 text-xs text-slate-500 hover:text-slate-800">
									CANCELAR
								</button>
								<button
									type="submit"
									disabled={createMutation.isPending}
									className="bg-tech-cyan text-white px-6 py-2 rounded font-bold text-xs shadow-md inline-flex items-center gap-2"
								>
									{createMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />} SALVAR RELATÓRIO
								</button>
							</div>
						</form>
					</motion.div>
				)}

				{isLoading ? (
					<div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-sm font-mono">
						<Loader2 className="w-4 h-4 animate-spin" /> Carregando relatórios...
					</div>
				) : filtered.length === 0 ? (
					<p className="text-slate-400 text-sm font-mono text-center py-16">Nenhum relatório encontrado.</p>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
						{filtered.map((report, i) => (
							<ToolCard key={report.id} tool={report} index={i} onDelete={canEdit ? () => setPendingDelete(report) : undefined} />
						))}
					</div>
				)}
			</div>

			{pendingDelete && canEdit && (
				<ConfirmDelete
					title={pendingDelete.title}
					isPending={deleteMutation.isPending}
					onCancel={() => setPendingDelete(null)}
					onConfirm={() => deleteMutation.mutate(pendingDelete.id)}
				/>
			)}
		</HubLayout>
	)
}

function ConfirmDelete({ title, isPending, onCancel, onConfirm }: { title: string; isPending: boolean; onCancel: () => void; onConfirm: () => void }) {
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onCancel()
		}
		document.addEventListener("keydown", onKeyDown)
		return () => document.removeEventListener("keydown", onKeyDown)
	}, [onCancel])

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			<button type="button" aria-label="Cancelar exclusão" onClick={onCancel} className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" />
			<div role="alertdialog" aria-modal="true" aria-labelledby="confirm-delete-title" className="relative w-full max-w-md bg-white rounded-2xl p-6 shadow-xl">
				<h3 id="confirm-delete-title" className="text-slate-800 font-bold text-sm uppercase mb-2">
					Excluir relatório
				</h3>
				<p className="text-slate-500 text-sm leading-relaxed mb-6">
					“{title}” sai da lista de todos os operadores da seção. A exclusão é definitiva — não há como desfazer.
				</p>
				<div className="flex justify-end gap-2">
					<button type="button" onClick={onCancel} className="px-4 py-2 text-xs font-bold uppercase text-slate-500 hover:text-slate-800">
						Cancelar
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={isPending}
						className="inline-flex items-center gap-2 bg-red-600 text-white px-5 py-2 rounded-lg font-bold text-xs uppercase shadow-md hover:bg-red-700 disabled:opacity-60 transition-colors"
					>
						{isPending && <Loader2 className="w-3 h-3 animate-spin" />} Excluir
					</button>
				</div>
			</div>
		</div>
	)
}
