import { Badge } from "@/components/ui/badge"
import { STAGE_LABEL, STAGE_ORDER, type Stage } from "@/lib/alpha/aci"

/** Etapa do processo. Preenchido só no fim do fluxo — o que resta fazer fica em contorno. */
export function StageBadge({ stage }: { stage: Stage }) {
	return (
		<Badge variant={stage === "parecer" ? "default" : "outline"} className="text-[10px] uppercase tracking-[0.1em]">
			{STAGE_LABEL[stage]}
		</Badge>
	)
}

/**
 * Trilha das quatro etapas, com a atual marcada.
 *
 * Sem ícone de check nem cor de status: a posição na trilha já diz o que foi
 * feito. Etapa concluída ou atual fica preenchida; a que falta, em contorno.
 */
export function StageStepper({ stage }: { stage: Stage }) {
	const current = STAGE_ORDER.indexOf(stage)

	return (
		<ol className="grid grid-cols-4 gap-px border border-border bg-border">
			{STAGE_ORDER.map((step, index) => {
				const reached = index <= current
				return (
					<li
						key={step}
						aria-current={index === current ? "step" : undefined}
						className={`p-3 ${reached ? "bg-foreground text-background" : "bg-background text-muted-foreground"}`}
					>
						<span className="block font-mono text-[10px] tabular-nums">{index + 1}</span>
						<span className="block text-xs uppercase tracking-[0.1em]">{STAGE_LABEL[step]}</span>
					</li>
				)
			})}
		</ol>
	)
}
