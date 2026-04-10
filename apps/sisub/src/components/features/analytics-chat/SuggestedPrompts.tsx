import { Sparkles } from "lucide-react"

const SUGGESTED_PROMPTS = [
	"Presenças por unidade no último mês",
	"Comparativo previsão vs. presença por refeição",
	"Saldo de ARP por produto nos últimos 3 meses",
	"Status das tarefas de produção desta semana",
]

interface SuggestedPromptsProps {
	onSelect: (prompt: string) => void
}

export function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
	return (
		<div className="flex flex-col items-center gap-6 px-4 py-12 text-center">
			<div className="flex flex-col items-center gap-2">
				<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
					<Sparkles className="h-6 w-6" />
				</div>
				<h2 className="text-lg font-semibold text-foreground">Assistente de Analytics</h2>
				<p className="max-w-sm text-sm text-muted-foreground leading-relaxed">
					Descreva em português o que você quer analisar — eu gero o gráfico automaticamente com dados em tempo real.
				</p>
			</div>

			<div className="flex max-w-xl flex-wrap justify-center gap-2">
				{SUGGESTED_PROMPTS.map((prompt) => (
					<button
						key={prompt}
						type="button"
						onClick={() => onSelect(prompt)}
						className="cursor-pointer rounded-full border border-border bg-muted/50 px-3.5 py-1.5 text-sm text-foreground transition-colors hover:border-border/80 hover:bg-muted"
					>
						{prompt}
					</button>
				))}
			</div>
		</div>
	)
}
