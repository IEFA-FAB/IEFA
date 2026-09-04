import { AlertCircle, Calendar, CheckCircle2, FileText, Info, Minus, TrendingDown, TrendingUp, User } from "lucide-react"
import type { DataAnalysisData } from "#/server/document-ai.fn"

interface DataAnalysisReportProps {
	data: DataAnalysisData
}

export function DataAnalysisReport({ data }: DataAnalysisReportProps) {
	return (
		<div className="bg-card text-foreground shadow-2xl mx-auto my-8 p-[20mm] w-[210mm] min-h-[297mm] font-sans selection:bg-action/15 print:shadow-none print:my-0 print:p-[15mm]">
			{/* Cabeçalho */}
			<header className="border-b-2 border-border pb-10 mb-10">
				<div className="flex justify-between items-start mb-8">
					<div className="flex items-center gap-4 text-action">
						<div className="bg-action/10 p-3 rounded-xl">
							<FileText className="w-8 h-8" />
						</div>
						<div>
							<span className="text-label text-action block mb-1">Auditoria Governamental</span>
							<span className="text-heading">Inteligência Patrimonial</span>
						</div>
					</div>
					<div className="text-right">
						<div className="text-label text-muted-foreground mb-1">Referência</div>
						<div className="text-caption font-mono text-muted-foreground bg-muted/50 px-3 py-1 rounded-lg border border-border">
							{new Date().getFullYear()}/ANALYSIS-001
						</div>
					</div>
				</div>

				<h1 className="text-display text-foreground mb-3 leading-tight">{data.title}</h1>
				<p className="text-heading text-muted-foreground max-w-2xl">{data.subtitle}</p>

				<div className="flex gap-10 mt-10">
					<div className="flex flex-col gap-1">
						<span className="text-label text-muted-foreground">Responsável Técnico</span>
						<div className="flex items-center gap-2 text-foreground text-subheading">
							<User className="w-4 h-4 text-action" />
							{data.author}
						</div>
					</div>
					<div className="flex flex-col gap-1">
						<span className="text-label text-muted-foreground">Data de Emissão</span>
						<div className="flex items-center gap-2 text-foreground text-subheading">
							<Calendar className="w-4 h-4 text-action" />
							{data.date}
						</div>
					</div>
				</div>
			</header>

			{/* Resumo Executivo */}
			<section className="mb-12 relative">
				<div className="absolute -left-6 top-0 bottom-0 w-1 bg-action rounded-full opacity-20" />
				<h2 className="text-label text-action mb-4 flex items-center gap-2">
					<CheckCircle2 className="w-4 h-4" />
					Resumo Executivo
				</h2>
				<p className="text-foreground leading-relaxed italic text-heading">"{data.summary}"</p>
			</section>

			{/* Métricas */}
			<div className="grid grid-cols-3 gap-6 mb-12">
				{data.keyMetrics.map((metric, idx) => {
					const valueLength = metric.value.length
					// Três degraus, não dois: a migração de tipografia colapsou os dois primeiros
					// no mesmo nível e a faixa de 13–15 caracteres virou inalcançável.
					const fontSizeClass = valueLength > 15 ? "text-caption" : valueLength > 12 ? "text-body" : "text-heading"

					return (
						<div key={idx} className="bg-muted/50 border border-border rounded-xl p-6 transition-all hover:shadow-md flex flex-col min-h-[140px]">
							<span className="block text-label text-muted-foreground mb-3 leading-tight h-8 overflow-hidden">{metric.label}</span>
							<div className="flex items-start justify-between gap-3 mt-auto">
								<span className={`text-foreground leading-tight break-words flex-1 ${fontSizeClass}`}>{metric.value}</span>
								<div
									className={`p-2 rounded-full shrink-0 ${metric.trend === "up" ? "bg-success/10" : metric.trend === "down" ? "bg-destructive/10" : "bg-muted"}`}
								>
									{metric.trend === "up" && <TrendingUp className="w-4 h-4 text-success" />}
									{metric.trend === "down" && <TrendingDown className="w-4 h-4 text-destructive" />}
									{metric.trend === "neutral" && <Minus className="w-4 h-4 text-muted-foreground" />}
								</div>
							</div>
						</div>
					)
				})}
			</div>

			{/* Tabela de Dados */}
			<section className="mb-12">
				<div className="flex items-center justify-between mb-6">
					<h2 className="text-foreground text-subheading flex items-center gap-2">
						<div className="w-2 h-6 bg-action rounded-full" />
						Detalhamento de Divergências
					</h2>
					<span className="text-label text-muted-foreground">SIAFI vs SILOMS</span>
				</div>
				<div className="overflow-hidden border border-border rounded-xl shadow-sm">
					<table className="w-full text-left text-body border-collapse">
						<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
							<tr>
								{data.tableData.headers.map((header, i) => (
									<th key={i} className="px-4 py-3">
										{header}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{data.tableData.rows.map((row, i) => (
								<tr key={i} className="hover:bg-action/5 transition-colors group">
									{row.map((cell, j) => (
										<td
											key={j}
											className={`px-6 py-3.5 text-muted-foreground font-mono text-hint ${j > 0 ? "text-right font-medium" : "text-foreground font-bold"}`}
										>
											{cell}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			{/* Análise Técnica */}
			<section className="mb-12">
				<h2 className="text-foreground text-subheading mb-6 flex items-center gap-2">
					<AlertCircle className="w-4 h-4 text-action" />
					Análise Técnica e Observações
				</h2>
				<div className="grid grid-cols-1 gap-4">
					{data.analysis.map((point, idx) => (
						<div key={idx} className="flex gap-4 p-4 bg-card border border-border rounded-xl shadow-sm">
							<div className="w-6 h-6 rounded-full bg-action/10 text-action flex items-center justify-center text-label shrink-0">{idx + 1}</div>
							<p className="text-muted-foreground text-body leading-relaxed">{point}</p>
						</div>
					))}
				</div>
			</section>

			{/* Conclusão & Recomendações */}
			<div className="grid grid-cols-2 gap-8 mb-12">
				<section className="bg-surface-inverted text-surface-inverted-foreground rounded-xl p-8 shadow-xl">
					<h3 className="text-label text-action mb-4 flex items-center gap-2">
						<Info className="w-4 h-4" />
						Conclusão
					</h3>
					<p className="text-surface-inverted-muted text-body leading-relaxed">{data.conclusion}</p>
				</section>
				<section className="bg-action text-action-foreground rounded-xl p-8 shadow-xl">
					<h3 className="text-label text-action-foreground mb-4 flex items-center gap-2">
						<CheckCircle2 className="w-4 h-4" />
						Recomendações
					</h3>
					<ul className="space-y-3">
						{data.recommendations.map((rec, idx) => (
							<li key={idx} className="flex gap-3 text-white text-caption leading-relaxed">
								<span className="text-action-foreground font-bold">✓</span>
								{rec}
							</li>
						))}
					</ul>
				</section>
			</div>

			{/* Rodapé */}
			<footer className="mt-auto pt-10 border-t border-border flex justify-between items-center">
				<p className="text-label text-muted-foreground">Confidencial • Auditoria de Dados</p>
				<div className="flex items-center gap-2 opacity-30">
					<div className="w-1.5 h-1.5 bg-action rounded-full" />
					<div className="w-1.5 h-1.5 bg-action rounded-full" />
					<div className="w-1.5 h-1.5 bg-action/15 rounded-full" />
				</div>
			</footer>
		</div>
	)
}
