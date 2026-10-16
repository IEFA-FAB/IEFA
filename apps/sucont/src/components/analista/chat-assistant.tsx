import { Bot, Search, Send } from "lucide-react"
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "#/components/ui/input-group"
import { answerChatQuery, type DecisaoData, type EstrategicoData, type ManagerialData } from "#/lib/analista/chat-search"

interface ChatAssistantProps {
	managerialData: ManagerialData | null
	estrategicoData: EstrategicoData | null
	decisaoData: DecisaoData | null
}

export function ChatAssistant({ managerialData, estrategicoData, decisaoData }: ChatAssistantProps) {
	const [query, setQuery] = useState("")
	const [answer, setAnswer] = useState<string | null>(null)

	const handleSearch = (e: React.SyntheticEvent) => {
		e.preventDefault()
		if (!query.trim() || !managerialData || !estrategicoData) return

		setAnswer(answerChatQuery(query, managerialData, estrategicoData, decisaoData))
	}

	return (
		<div className="bg-card p-6 rounded-xl shadow-sm border border-border mt-8">
			<h3 className="text-heading text-foreground mb-4 flex items-center">
				<Bot className="w-5 h-5 mr-2 text-action" />
				Oráculo SUCONT
			</h3>
			<p className="text-body text-muted-foreground mb-4">Assistente técnico e estratégico especializado em Contabilidade Pública Federal (COMAER).</p>

			<form onSubmit={handleSearch}>
				<InputGroup>
					<InputGroupAddon>
						<Search aria-hidden="true" />
					</InputGroupAddon>
					<InputGroupInput
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Ex: Qual ODS tem mais inconsistências?"
						aria-label="Pergunta ao Oráculo SUCONT"
					/>
					<InputGroupAddon align="inline-end">
						<InputGroupButton type="submit" variant="default" size="sm">
							<Send aria-hidden="true" />
							Perguntar
						</InputGroupButton>
					</InputGroupAddon>
				</InputGroup>
			</form>

			{answer && (
				<div className="mt-6 bg-muted/50 p-4 rounded-xl border border-border animate-in fade-in">
					<div className="flex items-start gap-3">
						<div className="p-2 bg-muted rounded-lg shrink-0 mt-1">
							<Bot className="w-4 h-4 text-muted-foreground" />
						</div>
						<div className="text-foreground text-body whitespace-pre-wrap leading-relaxed">
							{answer.split("**").map((part, i) =>
								i % 2 === 1 ? (
									<strong key={i} className="text-foreground">
										{part}
									</strong>
								) : (
									part
								)
							)}
						</div>
					</div>
				</div>
			)}

			<div className="mt-4 flex flex-wrap gap-2">
				<span className="text-caption text-muted-foreground mr-1 py-1">Sugestões:</span>
				<Button
					type="button"
					onClick={() => setQuery("Qual ODS tem mais inconsistências?")}
					variant="secondary"
					size="xs"
					className="h-auto bg-muted py-1 text-foreground hover:bg-muted/70"
				>
					Qual ODS tem mais inconsistências?
				</Button>
				<Button
					type="button"
					onClick={() => setQuery("Quais são as 10 UGs com mais inconsistências?")}
					variant="secondary"
					size="xs"
					className="h-auto bg-muted py-1 text-foreground hover:bg-muted/70"
				>
					Top 10 UGs
				</Button>
				<Button
					type="button"
					onClick={() => setQuery("Qual questão RAC é mais recorrente?")}
					variant="secondary"
					size="xs"
					className="h-auto bg-muted py-1 text-foreground hover:bg-muted/70"
				>
					Questão RAC mais recorrente
				</Button>
			</div>
		</div>
	)
}
