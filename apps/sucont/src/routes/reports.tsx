import { createFileRoute } from "@tanstack/react-router"
import { FileBarChart, Plus } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useState } from "react"
import { HubLayout } from "#/components/hub-layout"
import { ToolCard } from "#/components/tool-card"
import { reportTools } from "#/lib/data"
import { useSearchQuery } from "#/lib/hub-store"
import type { Tool } from "#/lib/types"

export const Route = createFileRoute("/reports")({ component: Reports })

function Reports() {
	const searchQuery = useSearchQuery()
	const [reports, setReports] = useState<Tool[]>(reportTools)
	const [isAdding, setIsAdding] = useState(false)

	// Hydrate from localStorage
	useEffect(() => {
		try {
			const saved = localStorage.getItem("sucont_reports")
			if (saved) setReports(JSON.parse(saved))
		} catch {}
	}, [])

	useEffect(() => {
		localStorage.setItem("sucont_reports", JSON.stringify(reports))
	}, [reports])

	const addReport = (data: { title: string; url: string; description: string }) => {
		setReports((p) => [
			...p,
			{
				id: `report-${Date.now()}`,
				title: data.title,
				description: data.description,
				url: data.url,
				icon: "FileBarChart",
				category: "Relatórios",
				iconColor: "bg-tech-blue",
			},
		])
		setIsAdding(false)
	}

	const deleteReport = (id: string) => setReports((p) => p.filter((r) => r.id !== id))

	const filtered = reports.filter(
		(r) => r.title.toLowerCase().includes(searchQuery.toLowerCase()) || r.description.toLowerCase().includes(searchQuery.toLowerCase())
	)

	return (
		<HubLayout>
			<div className="space-y-8">
				<div className="flex items-center gap-4">
					<FileBarChart className="text-tech-cyan w-5 h-5" />
					<h2 className="text-slate-700 font-bold uppercase tracking-widest text-sm">Gestão de Relatórios</h2>
					<div className="flex-grow h-[1px] bg-slate-200" />
				</div>

				<div className="flex justify-end">
					<button
						type="button"
						onClick={() => setIsAdding(true)}
						className="flex items-center gap-2 bg-white border border-slate-200 text-tech-cyan px-4 py-2 rounded-md text-xs font-mono hover:bg-slate-50 transition-all shadow-sm"
					>
						<Plus className="w-4 h-4" /> ANEXAR RELATÓRIO
					</button>
				</div>

				{isAdding && (
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
								addReport({
									title: fd.get("title") as string,
									url: fd.get("url") as string,
									description: fd.get("description") as string,
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
								<button type="submit" className="bg-tech-cyan text-white px-6 py-2 rounded font-bold text-xs shadow-md">
									SALVAR RELATÓRIO
								</button>
							</div>
						</form>
					</motion.div>
				)}

				{filtered.length === 0 ? (
					<p className="text-slate-400 text-sm font-mono text-center py-16">Nenhum relatório encontrado.</p>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
						{filtered.map((report, i) => (
							<ToolCard key={report.id} tool={report} index={i} onDelete={() => deleteReport(report.id)} />
						))}
					</div>
				)}
			</div>
		</HubLayout>
	)
}
