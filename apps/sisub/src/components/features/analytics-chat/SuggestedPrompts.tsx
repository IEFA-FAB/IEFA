import { ClipboardList, ShoppingCart, Sparkles, TrendingUp, Users } from "lucide-react"
import type { ComponentType } from "react"

const SUGGESTED_PROMPTS: {
	text: string
	description: string
	Icon: ComponentType<{ className?: string }>
}[] = [
	{
		text: "Presenças por unidade no último mês",
		description: "Compare a frequência entre unidades militares",
		Icon: Users,
	},
	{
		text: "Comparativo previsão vs. presença por refeição",
		description: "Identifique gaps no planejamento de refeições",
		Icon: TrendingUp,
	},
	{
		text: "Saldo de ARP por produto nos últimos 3 meses",
		description: "Monitore o consumo e saldo dos contratos",
		Icon: ShoppingCart,
	},
	{
		text: "Status das tarefas de produção desta semana",
		description: "Acompanhe o andamento da produção em tempo real",
		Icon: ClipboardList,
	},
]

interface SuggestedPromptsProps {
	onSelect: (prompt: string) => void
}

export function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-8 px-4 py-8">
			{/* Header */}
			<div className="flex flex-col items-center gap-3 text-center">
				<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
					<Sparkles className="h-6 w-6" />
				</div>
				<div>
					<h2 className="text-lg font-semibold text-foreground">Assistente de Analytics</h2>
					<p className="mt-1 max-w-sm text-sm text-muted-foreground leading-relaxed">
						Descreva o que você quer analisar — o gráfico é gerado automaticamente com dados em tempo real.
					</p>
				</div>
			</div>

			{/* Prompt cards */}
			<div className="grid w-full max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2">
				{SUGGESTED_PROMPTS.map(({ text, description, Icon }) => (
					<button
						key={text}
						type="button"
						onClick={() => onSelect(text)}
						className="group flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 p-3.5 text-left transition-all hover:border-primary/30 hover:bg-accent/50 active:bg-accent/60"
					>
						<div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors group-hover:text-primary group-hover:bg-primary/10">
							<Icon className="h-4 w-4" />
						</div>
						<div className="min-w-0">
							<p className="text-sm font-medium text-foreground leading-snug">{text}</p>
							<p className="mt-0.5 text-xs text-muted-foreground leading-snug">{description}</p>
						</div>
					</button>
				))}
			</div>
		</div>
	)
}
