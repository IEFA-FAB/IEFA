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
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
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
		stage: "acompanhar" as const,
	}))

	const filtered = asTools.filter(
		(r) => r.title.toLowerCase().includes(searchQuery.toLowerCase()) || (r.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
	)

	return (
		<HubLayout title="Relatórios" description="Relatórios da seção e seus anexos." searchable>
			<div className="space-y-8">
				<div className="flex items-center gap-4">
					<FileBarChart className="text-tech-cyan w-5 h-5" />
					<h2 className="text-foreground text-label">Gestão de Relatórios</h2>
					<div className="flex-grow h-[1px] bg-border" />
				</div>

				{!canEdit && !loadingAccess && <ReadOnlyNotice scope="os relatórios da seção" />}

				{canEdit && (
					<div className="flex justify-end">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setIsAdding(true)}
							className="flex items-center gap-2 bg-card border border-border text-tech-cyan px-4 py-2 rounded-md text-caption font-mono hover:bg-muted/50 transition-all shadow-sm"
						>
							<Plus className="w-4 h-4" /> ANEXAR RELATÓRIO
						</Button>
					</div>
				)}

				{isAdding && canEdit && (
					<motion.div
						initial={{ opacity: 0, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						className="bg-card border border-tech-cyan/30 p-6 rounded-lg shadow-lg"
					>
						<h3 className="text-foreground mb-4 text-label">Novo Relatório</h3>
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
							<Input
								name="title"
								placeholder="Título do Relatório"
								required
								className="bg-muted/50 border border-border p-2 rounded text-caption text-foreground focus:border-tech-cyan outline-none"
							/>
							<Input
								name="url"
								placeholder="URL do Relatório"
								required
								className="bg-muted/50 border border-border p-2 rounded text-caption text-foreground focus:border-tech-cyan outline-none"
							/>
							<textarea
								name="description"
								placeholder="Descrição breve"
								className="bg-muted/50 border border-border p-2 rounded text-caption text-foreground md:col-span-2 h-20 focus:border-tech-cyan outline-none"
							/>
							<div className="flex gap-2 md:col-span-2 justify-end">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => setIsAdding(false)}
									className="px-4 py-2 text-caption text-muted-foreground hover:text-foreground"
								>
									CANCELAR
								</Button>
								<Button
									type="submit"
									variant="ghost"
									disabled={createMutation.isPending}
									className="bg-tech-cyan text-white px-6 py-2 rounded text-label shadow-md inline-flex items-center gap-2"
								>
									{createMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />} SALVAR RELATÓRIO
								</Button>
							</div>
						</form>
					</motion.div>
				)}

				{isLoading ? (
					<div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-body font-mono">
						<Loader2 className="w-4 h-4 animate-spin" /> Carregando relatórios...
					</div>
				) : filtered.length === 0 ? (
					<p className="text-muted-foreground text-body font-mono text-center py-16">Nenhum relatório encontrado.</p>
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
			<button type="button" aria-label="Cancelar exclusão" onClick={onCancel} className="absolute inset-0 bg-overlay/40 backdrop-blur-[2px]" />
			<div role="alertdialog" aria-modal="true" aria-labelledby="confirm-delete-title" className="relative w-full max-w-md bg-card rounded-xl p-6 shadow-xl">
				<h3 id="confirm-delete-title" className="text-foreground text-label mb-2">
					Excluir relatório
				</h3>
				<p className="text-muted-foreground text-body leading-relaxed mb-6">
					“{title}” sai da lista de todos os operadores da seção. A exclusão é definitiva — não há como desfazer.
				</p>
				<div className="flex justify-end gap-2">
					<Button type="button" variant="ghost" size="sm" onClick={onCancel} className="px-4 py-2 text-label text-muted-foreground hover:text-foreground">
						Cancelar
					</Button>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						onClick={onConfirm}
						disabled={isPending}
						className="inline-flex items-center gap-2 bg-destructive text-destructive-foreground px-5 py-2 rounded-lg text-label shadow-md hover:bg-destructive/90 disabled:opacity-60 transition-colors"
					>
						{isPending && <Loader2 className="w-3 h-3 animate-spin" />} Excluir
					</Button>
				</div>
			</div>
		</div>
	)
}
