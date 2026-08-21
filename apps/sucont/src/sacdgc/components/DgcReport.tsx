import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, Layers, Lightbulb, Printer, ScrollText } from "lucide-react"
import { useState } from "react"
import { cn } from "#/lib/utils"
import type { DgcAnalysis } from "#/sacdgc/types"
import { PANEL_TITLES } from "#/sacdgc/types"

interface DgcReportProps {
	data: DgcAnalysis
	onBack: () => void
}

type Tab = "alertas" | "aec" | "raciocinio"
type AecFilter = "Todos" | "SIM" | "NÃO"

export function DgcReport({ data, onBack }: DgcReportProps) {
	const [tab, setTab] = useState<Tab>("alertas")
	const [aecFilter, setAecFilter] = useState<AecFilter>("Todos")

	const { indicadores, perguntas } = data.checklistAec
	const alertas = data.alertasDeCriticidade

	return (
		<div className="w-full max-w-5xl mx-auto space-y-6">
			<header className="bg-white border border-slate-200 rounded-xl p-8 text-center">
				<div className="flex items-center justify-between mb-6">
					<button
						type="button"
						onClick={onBack}
						className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-tech-blue transition-colors"
					>
						<ArrowLeft className="w-4 h-4" />
						Voltar às unidades
					</button>
					<button
						type="button"
						onClick={() => window.print()}
						className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-tech-blue transition-colors"
					>
						<Printer className="w-4 h-4" />
						Imprimir
					</button>
				</div>

				<p className="text-[11px] font-bold uppercase tracking-[0.2em] text-tech-cyan mb-3">Relatório de Análise Crítica — SAC-DGC</p>
				<h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">{data.identificacao.nomeUg}</h2>
				<p className="mt-3 text-sm text-slate-500">
					Competência:{" "}
					<span className="font-semibold text-slate-700">
						{[data.identificacao.mesReferencia, data.identificacao.anoReferencia].filter(Boolean).join(" / ") || "não identificada"}
					</span>
				</p>
			</header>

			<nav className="flex flex-wrap gap-3">
				<TabButton active={tab === "alertas"} onClick={() => setTab("alertas")} icon={<AlertTriangle className="w-4 h-4" />}>
					Alertas de criticidade ({alertas.length})
				</TabButton>
				<TabButton active={tab === "aec"} onClick={() => setTab("aec")} icon={<ClipboardCheck className="w-4 h-4" />}>
					Checklist AEC ({indicadores.comApontamento}/{indicadores.total})
				</TabButton>
				<TabButton active={tab === "raciocinio"} onClick={() => setTab("raciocinio")} icon={<ScrollText className="w-4 h-4" />}>
					Raciocínio por painel
				</TabButton>
			</nav>

			{tab === "alertas" &&
				(alertas.length > 0 ? (
					<div className="space-y-4">
						{alertas.map((alerta, index) => (
							<article key={`${alerta.titulo}-${index}`} className="bg-white border border-red-200 rounded-xl p-6">
								<h3 className="text-base font-bold text-red-800 mb-3">{alerta.titulo}</h3>
								{alerta.origemAnalise.length > 0 && (
									<div className="flex flex-wrap gap-2 mb-4">
										{alerta.origemAnalise.map((origem) => (
											<span
												key={origem}
												className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600"
											>
												<Layers className="w-3 h-3" />
												{origem}
											</span>
										))}
									</div>
								)}
								<h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Evidência / justificativa</h4>
								<p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{alerta.evidencia}</p>
								<div className="mt-5 bg-red-50 border border-red-100 rounded-lg p-4">
									<h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-red-900 mb-1">
										<Lightbulb className="w-3.5 h-3.5" />
										Ação recomendada
									</h4>
									<p className="text-sm text-red-800 leading-relaxed whitespace-pre-wrap">{alerta.acaoRecomendada}</p>
								</div>
							</article>
						))}
					</div>
				) : (
					<div className="bg-white border border-green-200 rounded-xl p-12 flex flex-col items-center text-center">
						<CheckCircle2 className="w-10 h-10 text-green-600 mb-4" />
						<h3 className="text-lg font-bold text-green-800 mb-1">Nenhum alerta de criticidade</h3>
						<p className="text-sm text-slate-500 max-w-md">
							A análise não identificou possíveis distorções para esta Unidade Gestora na competência carregada.
						</p>
					</div>
				))}

			{tab === "aec" && (
				<div className="space-y-5">
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<IndicatorCard label="Itens avaliados" value={indicadores.total} tone="neutral" />
						<IndicatorCard
							label="Sem apontamento (NÃO)"
							value={indicadores.semApontamento}
							tone="ok"
							active={aecFilter === "NÃO"}
							onClick={() => setAecFilter(aecFilter === "NÃO" ? "Todos" : "NÃO")}
						/>
						<IndicatorCard
							label="Com apontamento (SIM)"
							value={indicadores.comApontamento}
							tone="alert"
							active={aecFilter === "SIM"}
							onClick={() => setAecFilter(aecFilter === "SIM" ? "Todos" : "SIM")}
						/>
					</div>

					<div className="space-y-3">
						{perguntas
							.filter((item) => aecFilter === "Todos" || item.resposta === aecFilter)
							.map((item) => (
								<article
									key={item.id}
									data-testid="dgc-aec-item"
									data-item-id={item.id}
									className={cn("bg-white border rounded-xl overflow-hidden", item.resposta === "SIM" ? "border-red-200" : "border-slate-200")}
								>
									<div className={cn("px-6 py-4 flex items-start justify-between gap-4", item.resposta === "SIM" ? "bg-red-50/40" : "bg-slate-50")}>
										<div>
											<p className="text-[11px] font-bold text-slate-400 mb-1">Item {item.id}</p>
											<p className="text-sm font-semibold text-slate-800">{item.pergunta}</p>
										</div>
										<span
											className={cn(
												"shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[11px] font-bold",
												item.resposta === "SIM" ? "bg-red-100 text-red-700 border-red-200" : "bg-green-100 text-green-700 border-green-200"
											)}
										>
											{item.resposta === "SIM" ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
											{item.resposta}
										</span>
									</div>

									{item.resposta === "SIM" && (
										<div className="p-6 grid gap-6 md:grid-cols-2 text-sm">
											<div className="space-y-4">
												{item.fundamentacaoTecnica && (
													<div>
														<h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Fundamentação técnica</h4>
														<p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{item.fundamentacaoTecnica}</p>
													</div>
												)}
												{item.evidenciasEncontradas && item.evidenciasEncontradas.length > 0 && (
													<div>
														<h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Evidências encontradas</h4>
														<ul className="list-disc pl-5 space-y-1 text-slate-600">
															{item.evidenciasEncontradas.map((evidencia) => (
																<li key={evidencia}>{evidencia}</li>
															))}
														</ul>
													</div>
												)}
											</div>
											{item.recomendacao && (
												<div className="bg-red-50 border border-red-100 rounded-lg p-4">
													<h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-red-900 mb-1">
														<Lightbulb className="w-3.5 h-3.5" />
														Recomendação
													</h4>
													<p className="text-red-800 leading-relaxed whitespace-pre-wrap">{item.recomendacao}</p>
												</div>
											)}
										</div>
									)}
								</article>
							))}
					</div>
				</div>
			)}

			{tab === "raciocinio" && (
				<div className="space-y-4">
					<p className="text-sm text-slate-500">
						Registro do raciocínio da análise sobre cada painel. Serve para auditar como o apontamento foi construído — o produto de decisão são os alertas e o
						checklist.
					</p>
					{([1, 2, 3, 4] as const).map((panel) => {
						const texto = data[`analisePainel${panel}` as const]
						return (
							<article key={panel} className="bg-white border border-slate-200 rounded-xl p-6">
								<h3 className="text-sm font-bold text-slate-800 mb-2">{PANEL_TITLES[panel]}</h3>
								<p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{texto || "Sem registro para este painel."}</p>
							</article>
						)
					})}
				</div>
			)}
		</div>
	)
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-colors border",
				active ? "bg-tech-blue text-white border-tech-blue" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
			)}
		>
			{icon}
			{children}
		</button>
	)
}

function IndicatorCard({
	label,
	value,
	tone,
	active,
	onClick,
}: {
	label: string
	value: number
	tone: "neutral" | "ok" | "alert"
	active?: boolean
	onClick?: () => void
}) {
	const tones = {
		neutral: "bg-white border-slate-200 text-slate-800",
		ok: "bg-green-50 border-green-200 text-green-700",
		alert: "bg-red-50 border-red-200 text-red-700",
	} as const

	const content = (
		<>
			<span className="text-3xl font-black">{value}</span>
			<span className="text-[11px] font-bold uppercase tracking-wider opacity-80">{label}</span>
		</>
	)

	if (!onClick) {
		return <div className={cn("rounded-xl border p-6 flex flex-col items-center gap-1", tones[tone])}>{content}</div>
	}

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"rounded-xl border p-6 flex flex-col items-center gap-1 transition-all hover:brightness-95",
				tones[tone],
				active && "ring-2 ring-offset-1 ring-slate-400"
			)}
		>
			{content}
		</button>
	)
}
