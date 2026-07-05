import type { Person } from "@iefa/database/assignment-selection"
import { CheckCircle2, Eye, EyeOff, Megaphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { localidadesFab } from "@/lib/localidades"
import { cn } from "@/lib/utils"

const omOptions = Object.keys(localidadesFab)

interface ConductPanelProps {
	persons: Person[]
	onCall: (personId: number) => void
	onArmOm: (personId: number, om: string) => void
	onReveal: (personId: number) => void
	onConfirm: (personId: number) => void
	busy?: boolean
}

const STEPS = [
	{ n: 1, label: "Chamar" },
	{ n: 2, label: "Mostrar unidade" },
	{ n: 3, label: "Ocultar" },
]

/**
 * Console de condução em 3 passos, com suspense: chamar o militar (só ele no
 * telão) → registrar e revelar a OM (aparece no card + mapa) → confirmar, o que
 * dispara a celebração antes do card sumir. Repete por antiguidade até o último.
 */
export function ConductPanel({ persons, onCall, onArmOm, onReveal, onConfirm, busy }: ConductPanelProps) {
	const total = persons.length
	const confirmed = persons.filter((p) => p.hide_card).length
	const onStage = persons.find((p) => p.show_card && !p.hide_card) ?? null
	const nextToCall = persons.find((p) => !p.hide_card) ?? null
	const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0

	const step = onStage ? (onStage.show_om ? 3 : 2) : 1

	return (
		<div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
			<div className="mb-4 flex items-center justify-between">
				<h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Condução da escolha</h2>
				<span className="text-sm font-medium text-slate-600">
					{confirmed}/{total} confirmados
				</span>
			</div>

			<div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-200">
				<div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
			</div>

			{/* Stepper */}
			<div className="mb-5 flex items-center gap-2">
				{STEPS.map((s, i) => (
					<div key={s.n} className="flex flex-1 items-center gap-2">
						<span
							className={cn(
								"grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors",
								step === s.n ? "bg-blue-600 text-white" : step > s.n ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
							)}
						>
							{s.n}
						</span>
						<span className={cn("text-xs font-medium", step === s.n ? "text-slate-900" : "text-slate-400")}>{s.label}</span>
						{i < STEPS.length - 1 && <span className="h-px flex-1 bg-slate-200" />}
					</div>
				))}
			</div>

			{step === 1 &&
				(nextToCall ? (
					<div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4">
						<div className="flex items-center gap-3">
							<span className="grid size-11 shrink-0 place-items-center rounded-full bg-slate-800 text-lg font-bold text-white">
								{nextToCall.classificacao}º
							</span>
							<div>
								<p className="text-xs font-medium uppercase tracking-wide text-slate-400">Próximo a chamar</p>
								<p className="text-xl font-bold text-slate-900">{nextToCall.nome}</p>
							</div>
						</div>
						<Button size="lg" onClick={() => onCall(nextToCall.id)} disabled={busy}>
							<Megaphone /> Chamar ao telão
						</Button>
					</div>
				) : (
					<div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-emerald-700">
						<CheckCircle2 /> <span className="font-semibold">Escolha concluída — todos confirmados.</span>
					</div>
				))}

			{step === 2 && onStage && (
				<div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4">
					<div className="mb-3 flex items-center gap-3">
						<span className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-600 text-lg font-bold text-white">{onStage.classificacao}º</span>
						<div>
							<p className="text-xs font-medium uppercase tracking-wide text-blue-600">No telão · aguardando anúncio</p>
							<p className="text-xl font-bold text-slate-900">{onStage.nome}</p>
						</div>
					</div>
					<div className="flex flex-wrap items-end gap-3">
						<div className="min-w-[12rem] flex-1">
							<span className="mb-1 block text-xs font-medium text-slate-500">OM anunciada</span>
							<Select value={onStage.localidade ?? null} onValueChange={(v) => onArmOm(onStage.id, v as string)} disabled={busy}>
								<SelectTrigger className="w-full bg-white">
									<SelectValue>{onStage.localidade ?? "Selecione a OM…"}</SelectValue>
								</SelectTrigger>
								<SelectContent className="max-h-72">
									{omOptions.map((om) => (
										<SelectItem key={om} value={om}>
											{om} · {localidadesFab[om]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<Button size="lg" onClick={() => onReveal(onStage.id)} disabled={busy || !onStage.localidade}>
							<Eye /> Revelar unidade
						</Button>
					</div>
					<p className="mt-2 text-xs text-slate-400">Registre a OM que o militar anunciou e clique em "Revelar" — só então ela aparece no telão e no mapa.</p>
				</div>
			)}

			{step === 3 && onStage && (
				<div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
					<div className="flex flex-wrap items-center justify-between gap-4">
						<div className="flex items-center gap-3">
							<span className="grid size-11 shrink-0 place-items-center rounded-full bg-amber-500 text-lg font-bold text-white">{onStage.classificacao}º</span>
							<div>
								<p className="text-xs font-medium uppercase tracking-wide text-amber-600">Revelado · {onStage.estado}</p>
								<p className="text-xl font-bold text-slate-900">
									{onStage.nome} → {onStage.localidade}
								</p>
							</div>
						</div>
						<Button size="lg" onClick={() => onConfirm(onStage.id)} disabled={busy}>
							<EyeOff /> Ocultar do telão
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}
