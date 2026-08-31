import { AlertTriangle, CheckCircle2, Clock, Loader2, PlayCircle } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"
import { cn } from "#/lib/utils"
import type { DgcAnalysis, PanelId, UgDataset } from "#/sacdgc/types"
import { GROUP_ORDER } from "#/sacdgc/ugs"

export type UgState =
	| { status: "pendente" }
	| { status: "na-fila" }
	| { status: "analisando" }
	| { status: "concluida"; analysis: DgcAnalysis }
	| { status: "erro"; message: string }

interface DgcUgTableProps {
	datasets: UgDataset[]
	states: Record<string, UgState>
	selectedGroup: string
	onSelectGroup: (group: string) => void
	onAnalyze: (ugCodes: string[]) => void
	onOpen: (ugCode: string) => void
	busy: boolean
}

const PANELS: PanelId[] = [1, 2, 3, 4]

export function DgcUgTable({ datasets, states, selectedGroup, onSelectGroup, onAnalyze, onOpen, busy }: DgcUgTableProps) {
	const countByGroup = new Map<string, number>()
	for (const dataset of datasets) countByGroup.set(dataset.group, (countByGroup.get(dataset.group) ?? 0) + 1)

	const visible = datasets.filter((d) => d.group === selectedGroup)
	const pending = visible.filter((d) => {
		const state = states[d.ugCode]?.status ?? "pendente"
		return state === "pendente" || state === "erro"
	})

	return (
		<section className="space-y-5">
			<div className="bg-card border border-border rounded-xl p-5 flex flex-col md:flex-row md:items-center gap-4 justify-between">
				<div className="flex items-center gap-3">
					<span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Grupo de comparação</span>
					<Select value={selectedGroup} onValueChange={onSelectGroup}>
						<SelectTrigger className="w-72">
							<SelectValue placeholder="Selecione um grupo" />
						</SelectTrigger>
						<SelectContent>
							{GROUP_ORDER.filter((group) => countByGroup.has(group)).map((group) => (
								<SelectItem key={group} value={group}>
									{group} ({countByGroup.get(group)})
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<button
					type="button"
					onClick={() => onAnalyze(pending.map((d) => d.ugCode))}
					disabled={busy || pending.length === 0}
					className="px-5 py-2.5 bg-tech-blue text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors hover:bg-tech-blue/90 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
				>
					Analisar grupo ({pending.length})
				</button>
			</div>

			<div className="bg-card border border-border rounded-xl overflow-hidden">
				<table className="w-full text-left">
					<thead>
						<tr className="bg-muted/50 border-b border-border text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
							<th className="px-6 py-4">Código</th>
							<th className="px-6 py-4">Unidade Gestora</th>
							<th className="px-6 py-4">Linhas por painel</th>
							<th className="px-6 py-4 text-center">Situação</th>
							<th className="px-6 py-4 text-right">Ação</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border">
						{visible.map((dataset) => {
							const state = states[dataset.ugCode] ?? { status: "pendente" as const }
							return (
								<tr key={dataset.ugCode} className="hover:bg-muted/50/60 transition-colors">
									<td className="px-6 py-4 font-mono text-sm font-semibold text-foreground">{dataset.ugCode}</td>
									<td className="px-6 py-4 text-sm font-semibold text-foreground">{dataset.ugName.replace(`${dataset.ugCode} - `, "")}</td>
									<td className="px-6 py-4">
										<div className="flex gap-1.5">
											{PANELS.map((panel) => (
												<span
													key={panel}
													title={`Painel ${panel}: ${dataset.rowCount[panel]} linha(s)`}
													className={cn(
														"inline-flex items-center justify-center min-w-9 px-2 py-1 rounded-md text-[11px] font-bold border",
														dataset.rowCount[panel] > 0
															? "bg-muted/50 border-border text-muted-foreground"
															: "bg-muted/50 border-dashed border-border text-slate-300"
													)}
												>
													{dataset.rowCount[panel]}
												</span>
											))}
										</div>
									</td>
									<td className="px-6 py-4">
										<StatusBadge state={state} />
									</td>
									<td className="px-6 py-4 text-right">
										{state.status === "concluida" ? (
											<button
												type="button"
												onClick={() => onOpen(dataset.ugCode)}
												className="px-4 py-2 rounded-lg bg-tech-cyan text-white text-[11px] font-bold uppercase tracking-wider transition-colors hover:bg-tech-cyan/90"
											>
												Ver análise
											</button>
										) : (
											<button
												type="button"
												onClick={() => onAnalyze([dataset.ugCode])}
												disabled={busy || state.status === "analisando" || state.status === "na-fila"}
												className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-muted-foreground text-[11px] font-bold uppercase tracking-wider transition-colors hover:border-tech-blue hover:text-tech-blue disabled:opacity-40 disabled:cursor-not-allowed"
											>
												<PlayCircle className="w-3.5 h-3.5" />
												{state.status === "erro" ? "Tentar de novo" : "Analisar"}
											</button>
										)}
									</td>
								</tr>
							)
						})}
					</tbody>
				</table>

				{visible.length === 0 && <p className="px-6 py-12 text-center text-sm text-muted-foreground">Nenhuma Unidade Gestora deste grupo na base carregada.</p>}
			</div>
		</section>
	)
}

function StatusBadge({ state }: { state: UgState }) {
	if (state.status === "concluida") {
		const apontamentos = state.analysis.checklistAec.indicadores.comApontamento
		const alertas = state.analysis.alertasDeCriticidade.length
		return (
			<div className="flex flex-col items-center gap-1">
				<Badge tone="ok" icon={<CheckCircle2 className="w-3 h-3" />}>
					Concluída
				</Badge>
				<span className="text-[11px] text-muted-foreground">
					{alertas} alerta{alertas === 1 ? "" : "s"} · {apontamentos} apontamento{apontamentos === 1 ? "" : "s"}
				</span>
			</div>
		)
	}

	if (state.status === "erro") {
		return (
			<div className="flex flex-col items-center gap-1">
				<Badge tone="alert" icon={<AlertTriangle className="w-3 h-3" />}>
					Erro
				</Badge>
				<span className="text-[11px] text-destructive max-w-56 text-center leading-tight">{state.message}</span>
			</div>
		)
	}

	if (state.status === "analisando") {
		return (
			<Badge tone="busy" icon={<Loader2 className="w-3 h-3 animate-spin" />}>
				Analisando
			</Badge>
		)
	}

	if (state.status === "na-fila") {
		return (
			<Badge tone="neutral" icon={<Clock className="w-3 h-3" />}>
				Na fila
			</Badge>
		)
	}

	return <Badge tone="neutral">Não analisada</Badge>
}

function Badge({ tone, icon, children }: { tone: "ok" | "alert" | "busy" | "neutral"; icon?: React.ReactNode; children: React.ReactNode }) {
	const tones = {
		ok: "bg-success/15 text-success border-success/30",
		alert: "bg-destructive/15 text-destructive border-destructive/30",
		busy: "bg-tech-cyan/10 text-tech-blue border-tech-cyan/30",
		neutral: "bg-muted text-muted-foreground border-border",
	} as const

	return (
		<span className={cn("mx-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-bold uppercase tracking-wider", tones[tone])}>
			{icon}
			{children}
		</span>
	)
}
