// Extraído de routes/conta-generica.tsx (port do analistacontagenerica): painel do
// Oráculo SUCONT. O estado da conversa continua no componente da rota.
import { ArrowRight, Lightbulb, MessageSquare } from "lucide-react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { SectionHeader } from "#/components/ui/section-header"
import { MAX_CONTA_GENERICA_QUERY_CHARS } from "#/lib/conta-generica-prompt"

export interface ChatMessage {
	role: "user" | "model"
	text: string
}

interface OracleChatProps {
	chatMessages: ChatMessage[]
	isAskingOracle: boolean
	oracleInput: string
	onOracleInputChange: (value: string) => void
	onAsk: (question?: string) => void
	onClear: () => void
}

function ChatHistory({ chatMessages }: Pick<OracleChatProps, "chatMessages">) {
	if (chatMessages.length === 0) {
		return (
			<div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
				<MessageSquare className="w-16 h-16 text-foreground" />
				<p className="text-subheading text-muted-foreground max-w-xs">
					Olá! Eu sou o Oráculo SUCONT. Analisei os dados do relatório e estou pronto para responder suas perguntas estratégicas.
				</p>
			</div>
		)
	}
	return chatMessages.map((msg, i) => (
		<div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
			<div
				className={`max-w-[80%] p-4 rounded-xl shadow-sm ${
					msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-card text-foreground border border-border rounded-tl-none"
				}`}
			>
				<p className="text-body leading-relaxed whitespace-pre-wrap">{msg.text}</p>
			</div>
		</div>
	))
}

function ThinkingIndicator() {
	return (
		<div className="flex justify-start">
			<div className="bg-card p-4 rounded-xl border border-border rounded-tl-none flex items-center gap-2">
				<div className="flex gap-1">
					{[0, 0.2, 0.4].map((delay) => (
						<div key={delay} className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-pulse" style={{ animationDelay: `${delay}s` }} />
					))}
				</div>
				<span className="text-label text-muted-foreground">Oráculo está analisando...</span>
			</div>
		</div>
	)
}

/** Oracle Chat */
export function OracleChat({ chatMessages, isAskingOracle, oracleInput, onOracleInputChange, onAsk, onClear }: OracleChatProps) {
	return (
		// Era o único painel com cabeçalho azul sólido, `shadow-2xl` e borda
		// dupla — o chat do monitoramento, que faz a mesma coisa, é um card.
		<div className="mt-8 bg-card rounded-xl border border-border overflow-hidden">
			<div className="p-4 border-b border-border">
				<SectionHeader
					icon={<Lightbulb />}
					title="Oráculo SUCONT"
					description="Inteligência artificial de apoio à decisão"
					actions={
						<>
							{["Qual ODS possui maior risco contábil?", "Quais são as 5 UGs mais críticas?", "Resuma o impacto financeiro total."].map((q) => (
								<Button key={q} type="button" size="sm" variant="outline" onClick={() => onAsk(q)}>
									{q.includes("ODS") ? "Risco ODS" : q.includes("5 UGs") ? "Top 5 UGs" : "Impacto"}
								</Button>
							))}
							<Button type="button" size="sm" variant="ghost" onClick={onClear}>
								Limpar
							</Button>
						</>
					}
				/>
			</div>

			<div className="h-[400px] overflow-y-auto p-6 bg-muted/50 space-y-4">
				<ChatHistory chatMessages={chatMessages} />
				{isAskingOracle && <ThinkingIndicator />}
			</div>

			<div className="p-4 bg-card border-t border-border">
				<div className="flex gap-2">
					<Input
						type="text"
						value={oracleInput}
						onChange={(e) => onOracleInputChange(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && onAsk()}
						placeholder="Pergunte ao Oráculo sobre o risco contábil..."
						maxLength={MAX_CONTA_GENERICA_QUERY_CHARS}
						className="flex-1"
					/>
					<Button size="icon" aria-label="Enviar pergunta" onClick={() => onAsk()} disabled={isAskingOracle || !oracleInput.trim()}>
						<ArrowRight className="w-5 h-5" />
					</Button>
				</div>
			</div>
		</div>
	)
}
