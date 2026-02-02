import { Button } from "@iefa/ui"
import { BarChart3, ExternalLink, Maximize2 } from "lucide-react"
import { useState } from "react"

export default function IndicatorsCard() {
	const [expanded, setExpanded] = useState(false)
	const frameHeight = "clamp(520px, 78vh, 1000px)"
	const toggleExpanded = () => setExpanded((e) => !e)

	const powerBiUrl =
		"https://app.powerbi.com/view?r=eyJrIjoiMmQ5MDYwODMtODJjNy00NzVkLWFjYzgtYjljYzE4NmM0ZDgxIiwidCI6IjNhMzY0ZGI2LTg2NmEtNDRkOS1iMzY5LWM1ODk1OWQ0NDhmOCJ9"

	return (
		<div
			className={`rounded-xl border border-border/50 bg-gradient-to-br from-card to-muted/5 shadow-sm ${expanded ? "p-0" : "p-6"}`}
		>
			{/* Barra superior - Enhanced */}
			<div className={`${expanded ? "px-4 py-3" : "mb-4"} flex items-center justify-between`}>
				<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-sans font-medium border bg-muted/30">
					<BarChart3 className="h-4 w-4" aria-hidden="true" />
					Indicadores
				</div>

				<div className="flex items-center gap-2">
					<Button
						onClick={() => window.open(powerBiUrl, "_blank", "noopener,noreferrer")}
						variant="outline"
						size="sm"
						className="inline-flex items-center gap-2 font-sans hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all"
						aria-label="Abrir relatório em nova aba"
						title="Abrir em nova aba"
					>
						<ExternalLink className="h-4 w-4" aria-hidden="true" />
						Abrir
					</Button>

					<Button
						onClick={toggleExpanded}
						variant="outline"
						size="sm"
						className="inline-flex items-center gap-2 font-sans hover:bg-accent/10 hover:text-accent hover:border-accent/30 transition-all"
						aria-pressed={expanded}
						aria-label={expanded ? "Reduzir" : "Expandir"}
						title={expanded ? "Reduzir" : "Expandir"}
					>
						<Maximize2 className="h-4 w-4" aria-hidden="true" />
						{expanded ? "Reduzir" : "Expandir"}
					</Button>
				</div>
			</div>

			{/* Wrapper full-bleed quando expandido */}
			<div className={expanded ? "" : "px-0"}>
				{/* Cabeçalho do card (quando não expandido) */}
				<div className={`${expanded ? "" : "px-6"} pb-4 flex flex-col gap-3`}>
					{!expanded && (
						<>
							<h2 className="text-xl font-sans font-bold text-foreground">
								Indicadores da Unidade
							</h2>
							<p className="text-sm font-sans text-muted-foreground">
								Acompanhe métricas e relatórios consolidados. Expanda para tela cheia para melhor
								visualização.
							</p>
						</>
					)}
				</div>

				{/* Container do iframe */}
				<div className={`${expanded ? "" : "px-6"} pb-6`}>
					<div className="rounded-xl border border-border/50 overflow-hidden shadow-sm">
						<iframe
							title="Indicadores SISUB - Power BI"
							src={powerBiUrl}
							className="w-full"
							style={{ height: frameHeight }}
							allowFullScreen
							loading="lazy"
							referrerPolicy="no-referrer-when-downgrade"
						/>
					</div>
					<div className="mt-3 text-xs font-sans text-muted-foreground px-1">
						Dica: use o botão de tela cheia dentro do relatório para melhor experiência.
					</div>
				</div>
			</div>
		</div>
	)
}
