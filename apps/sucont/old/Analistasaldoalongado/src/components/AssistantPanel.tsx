import { AlertTriangle, BarChart3, Bot, Loader2, PieChart, Send, Sparkles, Target } from "lucide-react"
import type React from "react"
import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import { askAssistant } from "../services/geminiService"
import type { DashboardMetrics, UgConsolidated } from "../utils/analytics"

interface AssistantPanelProps {
	data: UgConsolidated[]
	metrics: DashboardMetrics
}

interface Message {
	id: string
	role: "user" | "assistant"
	content: string
}

export const AssistantPanel: React.FC<AssistantPanelProps> = ({ data, metrics }) => {
	const [messages, setMessages] = useState<Message[]>([
		{
			id: "1",
			role: "assistant",
			content: `Olá! Sou o **Oráculo SUCONT (IA)**. Estou pronto para ajudar a Subdiretoria de Contabilidade e a Divisão SUCONT-3 com análises gerenciais e estratégicas sobre os dados contábeis carregados.

Você pode me fazer perguntas como:
* "Qual ODS tem mais inconsistências?"
* "Quais são as 10 UGs com mais inconsistências?"
* "Qual questão RAC é mais recorrente?"
* "Qual comando apresenta maior risco contábil?"

Ou clique em uma das análises rápidas abaixo:`,
		},
	])
	const [input, setInput] = useState("")
	const [isLoading, setIsLoading] = useState(false)
	const messagesEndRef = useRef<HTMLDivElement>(null)

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
	}

	useEffect(() => {
		scrollToBottom()
	}, [scrollToBottom])

	const handleSend = async (text: string) => {
		if (!text.trim()) return

		const userMessage: Message = {
			id: Date.now().toString(),
			role: "user",
			content: text,
		}

		setMessages((prev) => [...prev, userMessage])
		setInput("")
		setIsLoading(true)

		try {
			const response = await askAssistant(text, data, metrics)

			const assistantMessage: Message = {
				id: (Date.now() + 1).toString(),
				role: "assistant",
				content: response,
			}

			setMessages((prev) => [...prev, assistantMessage])
		} catch (_error) {
			setMessages((prev) => [
				...prev,
				{
					id: (Date.now() + 1).toString(),
					role: "assistant",
					content: "Desculpe, ocorreu um erro ao processar sua solicitação. Verifique sua conexão e a configuração da API.",
				},
			])
		} finally {
			setIsLoading(false)
		}
	}

	const quickActions = [
		{
			label: "Mapa de Risco Contábil",
			icon: AlertTriangle,
			query: "Gere um Mapa de Risco Contábil do COMAER detalhado por ODS, Órgão Superior e UG, incluindo Nº de inconsistências, Saldo associado e % do total.",
		},
		{
			label: "Análise de Pareto (80/20)",
			icon: PieChart,
			query:
				"Aplique a análise de concentração (Regra de Pareto) para identificar se uma parcela reduzida de UGs concentra a maior parte das inconsistências. Liste as UGs críticas.",
		},
		{
			label: "Prioridades de Atuação",
			icon: Target,
			query: "Sugira as prioridades de atuação imediata da SUCONT-3, considerando o volume de inconsistências e o impacto financeiro.",
		},
		{ label: "Ranking de ODS", icon: BarChart3, query: "Gere o Ranking de ODS por número de inconsistências e percentual." },
	]

	return (
		<div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[600px]">
			{/* Header */}
			<div className="p-4 border-b border-slate-200 flex items-center gap-3 bg-slate-50 rounded-t-2xl">
				<div className="p-2 bg-fab-100 text-fab-700 rounded-lg">
					<Bot className="w-5 h-5" />
				</div>
				<div>
					<h2 className="font-bold text-slate-800">Oráculo SUCONT (IA)</h2>
					<p className="text-xs text-slate-500">Apoio Estratégico e Gerencial à Tomada de Decisão</p>
				</div>
			</div>

			{/* Messages Area */}
			<div className="flex-1 overflow-y-auto p-4 space-y-6">
				{messages.map((msg) => (
					<div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
						<div
							className={`max-w-[80%] rounded-2xl p-4 ${
								msg.role === "user" ? "bg-fab-600 text-white rounded-tr-sm" : "bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-sm"
							}`}
						>
							<div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-slate-800 prose-pre:text-slate-100">
								<ReactMarkdown>{msg.content}</ReactMarkdown>
							</div>
						</div>
					</div>
				))}

				{isLoading && (
					<div className="flex justify-start">
						<div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-sm p-4 flex items-center gap-3 text-slate-500">
							<Loader2 className="w-4 h-4 animate-spin" />
							<span className="text-sm">Analisando dados contábeis...</span>
						</div>
					</div>
				)}
				<div ref={messagesEndRef} />
			</div>

			{/* Quick Actions */}
			{messages.length === 1 && (
				<div className="px-4 pb-2 flex flex-wrap gap-2">
					{quickActions.map((action, idx) => (
						<button
							key={idx}
							onClick={() => handleSend(action.query)}
							className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 hover:border-fab-300 hover:bg-fab-50 text-slate-600 hover:text-fab-700 rounded-lg text-xs font-medium transition-colors"
						>
							<action.icon className="w-3 h-3" />
							{action.label}
						</button>
					))}
				</div>
			)}

			{/* Input Area */}
			<div className="p-4 border-t border-slate-200 bg-white rounded-b-2xl">
				<form
					onSubmit={(e) => {
						e.preventDefault()
						handleSend(input)
					}}
					className="flex gap-2"
				>
					<div className="relative flex-1">
						<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
							<Sparkles className="h-4 w-4 text-slate-400" />
						</div>
						<input
							type="text"
							value={input}
							onChange={(e) => setInput(e.target.value)}
							placeholder="Faça uma pergunta gerencial ou estratégica sobre os dados..."
							className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-fab-500 focus:border-transparent transition-all text-slate-900"
							disabled={isLoading}
						/>
					</div>
					<button
						type="submit"
						disabled={!input.trim() || isLoading}
						className="px-4 py-3 bg-fab-600 hover:bg-fab-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex items-center justify-center shadow-sm"
					>
						<Send className="w-4 h-4" />
					</button>
				</form>
			</div>
		</div>
	)
}
