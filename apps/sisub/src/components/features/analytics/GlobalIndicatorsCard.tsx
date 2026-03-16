import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/cn"

export const powerBiUrl =
	"https://app.powerbi.com/view?r=eyJrIjoiMmQ5MDYwODMtODJjNy00NzVkLWFjYzgtYjljYzE4NmM0ZDgxIiwidCI6IjNhMzY0ZGI2LTg2NmEtNDRkOS1iMzY5LWM1ODk1OWQ0NDhmOCJ9"

interface Props {
	expanded: boolean
}

export default function IndicatorsCard({ expanded }: Props) {
	const frameHeight = "clamp(520px, 78vh, 1000px)"

	return (
		<Card>
			<CardContent className={cn(expanded && "p-0")}>
				<div className="rounded-md border border-border/50 overflow-hidden">
					<iframe
						title="Indicadores Sistêmicos - Power BI"
						src={powerBiUrl}
						className="w-full"
						style={{ height: frameHeight }}
						allowFullScreen
						loading="lazy"
						referrerPolicy="no-referrer-when-downgrade"
					/>
				</div>
				{!expanded && <p className="mt-3 text-xs text-muted-foreground px-1">Dica: use o botão de tela cheia dentro do relatório para melhor experiência.</p>}
			</CardContent>
		</Card>
	)
}
