import { AlertCircle, Calendar, CheckCircle2, FileText, Info, Minus, TrendingDown, TrendingUp, User } from "lucide-react"
import type React from "react"
import type { DataAnalysisData } from "../services/gemini"

interface DataAnalysisReportProps {
	data: DataAnalysisData
}

export const DataAnalysisReport: React.FC<DataAnalysisReportProps> = ({ data }) => {
	return (
		<div className="bg-white text-slate-900 shadow-2xl mx-auto my-8 p-[20mm] w-[210mm] min-h-[297mm] font-sans selection:bg-blue-100 print:shadow-none print:my-0 print:p-[15mm]">
			{/* Header */}
			<header className="border-b-2 border-slate-100 pb-10 mb-10">
				<div className="flex justify-between items-start mb-8">
					<div className="flex items-center gap-4 text-blue-800">
						<div className="bg-blue-50 p-3 rounded-2xl">
							<FileText className="w-8 h-8" />
						</div>
						<div>
							<span className="font-bold tracking-[0.2em] uppercase text-[10px] text-blue-600 block mb-1">Auditoria Governamental</span>
							<span className="font-display font-bold text-xl">Inteligência Patrimonial</span>
						</div>
					</div>
					<div className="text-right">
						<div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Referência</div>
						<div className="text-xs font-mono text-slate-600 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
							{new Date().getFullYear()}/ANALYSIS-001
						</div>
					</div>
				</div>

				<h1 className="text-4xl font-bold text-slate-900 mb-3 leading-tight font-display">{data.title}</h1>
				<p className="text-xl text-slate-500 font-medium max-w-2xl">{data.subtitle}</p>

				<div className="flex gap-10 mt-10">
					<div className="flex flex-col gap-1">
						<span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Responsável Técnico</span>
						<div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
							<User className="w-4 h-4 text-blue-500" />
							{data.author}
						</div>
					</div>
					<div className="flex flex-col gap-1">
						<span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Data de Emissão</span>
						<div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
							<Calendar className="w-4 h-4 text-blue-500" />
							{data.date}
						</div>
					</div>
				</div>
			</header>

			{/* Summary */}
			<section className="mb-12 relative">
				<div className="absolute -left-6 top-0 bottom-0 w-1 bg-blue-600 rounded-full opacity-20"></div>
				<h2 className="text-blue-700 font-bold uppercase tracking-widest text-[10px] mb-4 flex items-center gap-2">
					<CheckCircle2 className="w-4 h-4" />
					Resumo Executivo
				</h2>
				<p className="text-slate-700 leading-relaxed italic text-lg">"{data.summary}"</p>
			</section>

			{/* Metrics Grid */}
			<div className="grid grid-cols-3 gap-6 mb-12">
				{data.keyMetrics.map((metric, idx) => {
					// Lógica de fonte dinâmica baseada no comprimento do valor
					const valueLength = metric.value.length
					const fontSizeClass = valueLength > 15 ? "text-sm" : valueLength > 12 ? "text-base" : "text-xl"

					return (
						<div key={idx} className="bg-slate-50 border border-slate-100 rounded-2xl p-6 transition-all hover:shadow-md flex flex-col min-h-[140px]">
							<span className="block text-[9px] text-slate-400 uppercase font-bold mb-3 tracking-widest leading-tight h-8 overflow-hidden">{metric.label}</span>
							<div className="flex items-start justify-between gap-3 mt-auto">
								<span className={`font-bold text-slate-900 leading-tight break-words flex-1 ${fontSizeClass}`}>{metric.value}</span>
								<div
									className={`p-2 rounded-full shrink-0 ${metric.trend === "up" ? "bg-emerald-50" : metric.trend === "down" ? "bg-rose-50" : "bg-slate-100"}`}
								>
									{metric.trend === "up" && <TrendingUp className="w-4 h-4 text-emerald-600" />}
									{metric.trend === "down" && <TrendingDown className="w-4 h-4 text-rose-600" />}
									{metric.trend === "neutral" && <Minus className="w-4 h-4 text-slate-500" />}
								</div>
							</div>
						</div>
					)
				})}
			</div>

			{/* Data Table */}
			<section className="mb-12">
				<div className="flex items-center justify-between mb-6">
					<h2 className="text-slate-900 font-bold text-sm flex items-center gap-2">
						<div className="w-2 h-6 bg-blue-600 rounded-full"></div>
						Detalhamento de Divergências
					</h2>
					<span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">SIAFI vs SILOMS</span>
				</div>
				<div className="overflow-hidden border border-slate-100 rounded-2xl shadow-sm">
					<table className="w-full text-left text-sm border-collapse">
						<thead>
							<tr className="bg-slate-50 border-b border-slate-100">
								{data.tableData.headers.map((header, i) => (
									<th key={i} className="px-6 py-4 font-bold text-slate-500 uppercase text-[9px] tracking-widest">
										{header}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-50">
							{data.tableData.rows.map((row, i) => (
								<tr key={i} className="hover:bg-blue-50/30 transition-colors group">
									{row.map((cell, j) => (
										<td key={j} className={`px-6 py-3.5 text-slate-600 font-mono text-[11px] ${j > 0 ? "text-right font-medium" : "text-slate-900 font-bold"}`}>
											{cell}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			{/* Technical Analysis */}
			<section className="mb-12">
				<h2 className="text-slate-900 font-bold text-sm mb-6 flex items-center gap-2">
					<AlertCircle className="w-4 h-4 text-blue-600" />
					Análise Técnica e Observações
				</h2>
				<div className="grid grid-cols-1 gap-4">
					{data.analysis.map((point, idx) => (
						<div key={idx} className="flex gap-4 p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
							<div className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0">{idx + 1}</div>
							<p className="text-slate-600 text-sm leading-relaxed">{point}</p>
						</div>
					))}
				</div>
			</section>

			{/* Conclusion & Recommendations */}
			<div className="grid grid-cols-2 gap-8 mb-12">
				<section className="bg-slate-900 text-white rounded-3xl p-8 shadow-xl shadow-slate-900/10">
					<h3 className="text-blue-400 font-bold text-[10px] uppercase mb-4 tracking-widest flex items-center gap-2">
						<Info className="w-4 h-4" />
						Conclusão
					</h3>
					<p className="text-slate-300 text-sm leading-relaxed">{data.conclusion}</p>
				</section>
				<section className="bg-blue-600 text-white rounded-3xl p-8 shadow-xl shadow-blue-600/20">
					<h3 className="text-blue-100 font-bold text-[10px] uppercase mb-4 tracking-widest flex items-center gap-2">
						<CheckCircle2 className="w-4 h-4" />
						Recomendações
					</h3>
					<ul className="space-y-3">
						{data.recommendations.map((rec, idx) => (
							<li key={idx} className="flex gap-3 text-white text-xs leading-relaxed font-medium">
								<span className="text-blue-300 font-bold">✓</span>
								{rec}
							</li>
						))}
					</ul>
				</section>
			</div>

			{/* Footer */}
			<footer className="mt-auto pt-10 border-t border-slate-100 flex justify-between items-center">
				<p className="text-[9px] text-slate-400 uppercase tracking-[0.3em] font-bold">Confidencial • Auditoria de Dados</p>
				<div className="flex items-center gap-2 opacity-30">
					<div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
					<div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
					<div className="w-1.5 h-1.5 bg-blue-200 rounded-full"></div>
				</div>
			</footer>
		</div>
	)
}
