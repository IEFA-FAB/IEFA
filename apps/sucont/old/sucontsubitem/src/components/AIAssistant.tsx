import { GoogleGenAI } from "@google/genai"
import { type ClassValue, clsx } from "clsx"
import { Bot, Loader2, MessageSquare, Send, User, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { twMerge } from "tailwind-merge"

function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

import { UG_INFO } from "../constants"

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

interface AIAssistantProps {
	dataContext: any
}

interface Message {
	id: string
	role: "user" | "assistant"
	content: string
}

export function AIAssistant({ dataContext }: AIAssistantProps) {
	const [isOpen, setIsOpen] = useState(false)
	const [messages, setMessages] = useState<Message[]>([
		{
			id: "welcome",
			role: "assistant",
			content:
				'Olá! Sou o Assistente de Análise do Analista SUCONT. Posso ajudar a interpretar os dados contábeis, identificar padrões ou responder perguntas como "Qual ODS tem mais inconsistências?". Como posso ajudar hoje?',
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

	const handleSend = async () => {
		if (!input.trim() || isLoading) return

		const userMessage: Message = {
			id: Date.now().toString(),
			role: "user",
			content: input.trim(),
		}

		setMessages((prev) => [...prev, userMessage])
		setInput("")
		setIsLoading(true)

		try {
			// Prepare context summary
			const contextSummary = JSON.stringify({
				totalInconsistencias: dataContext.totalInconsistencias,
				totalVolume: dataContext.totalVolume,
				odsList: dataContext.odsList,
				orgaoSuperiorList: dataContext.orgaoSuperiorList,
				topUGs: dataContext.topUgsByInconsistencies.slice(0, 10).map((ug: any) => ({
					ug: ug.ug,
					occurrences: ug.occurrences.length,
					saldo: ug.totalSaldo,
				})),
				topRACs: dataContext.racList,
				conferentes: dataContext.conferentesList.slice(0, 5),
				pareto: dataContext.paretoSummary,
				niveisCriticos: dataContext.criticalLevels,
			})

			const prompt = `Você é o Oráculo SUCONT, um assistente técnico e estratégico especializado em Contabilidade Pública Federal para o Comando da Aeronáutica (COMAER). Sua missão é apoiar a Seção de Acompanhamento Contábil (SUCONT-3.1) na análise de dados, governança financeira e suporte às unidades gestoras.

🚨 HIERARQUIA E DESTAQUES CRÍTICOS (SETORIAL E STN)
Sempre considere o peso normativo superior destas unidades:
- SETORIAL CONTÁBIL DO COMAER (SEFA): 120002 (DIREF - SEFA), 120701 (DIREF/SUCONT - SEFA), 120702 (DIREF/SUCONV - SEFA), 121002 (DIREF - FAer - SEFA).
- ÓRGÃO CENTRAL DE CONTABILIDADE (STN): 120999 (MAER - DIF. CAMBIAL - SEFA) – Exclusiva para lançamentos da Secretaria do Tesouro Nacional.

BASE DE DADOS: UNIDADES GESTORAS (UG) POR ODS E ÓRGÃO SUPERIOR
Sempre utilize esta lista para identificar a sigla, o órgão superior e o ODS corretos:
${JSON.stringify(UG_INFO, null, 2)}

DIRETRIZES DE RESPOSTA E ANÁLISE:
1. Ao citar uma UG, identifique-a no formato: "UG [Código] ([Nome Reduzido]), subordinada ao [Órgão Superior] / [ODS]".
2. MAPA DE RISCO: Quando solicitado um panorama ou mapa de risco, apresente a distribuição por ODS, Órgão Superior e UG, incluindo saldo e % do total.
3. NÍVEIS CRÍTICOS: Identifique automaticamente o ODS, Órgão Superior e UGs mais críticos (por quantidade e por saldo).
4. ANÁLISE DE PARETO: Aplique a regra 80/20 para identificar a concentração de inconsistências.
5. PRIORIZAÇÃO: Sugira prioridades de atuação considerando volume financeiro, recorrência RAC e impacto patrimonial.
6. RIGOR TÉCNICO: Respostas devem ser estritamente profissionais, analíticas e orientadas ao rigor do PCASP (Manual de Contabilidade Aplicada ao Setor Público).
7. Se o usuário questionar sobre inconsistências contábeis, verifique sempre se a solução sugerida respeita as normas da DIREF.

Sua tarefa é responder perguntas do usuário com base nos seguintes dados agregados (em formato JSON):
${contextSummary}

Responda de forma clara, objetiva e profissional. Se a pergunta não puder ser respondida com os dados fornecidos, informe educadamente.
Pergunta do usuário: ${userMessage.content}`

			const response = await ai.models.generateContent({
				model: "gemini-3-flash-preview",
				contents: prompt,
			})

			const assistantMessage: Message = {
				id: (Date.now() + 1).toString(),
				role: "assistant",
				content: response.text || "Desculpe, não consegui gerar uma resposta.",
			}

			setMessages((prev) => [...prev, assistantMessage])
		} catch (_error) {
			const errorMessage: Message = {
				id: (Date.now() + 1).toString(),
				role: "assistant",
				content: "Ocorreu um erro ao processar sua solicitação. Por favor, verifique a conexão ou tente novamente mais tarde.",
			}
			setMessages((prev) => [...prev, errorMessage])
		} finally {
			setIsLoading(false)
		}
	}

	return (
		<>
			{/* Floating Button */}
			<motion.button
				initial={{ scale: 0 }}
				animate={{ scale: 1 }}
				whileHover={{ scale: 1.05 }}
				whileTap={{ scale: 0.95 }}
				onClick={() => setIsOpen(true)}
				className={cn(
					"fixed bottom-8 right-8 w-14 h-14 rounded-full bg-fab-blue text-white shadow-2xl shadow-fab-blue/30 flex items-center justify-center z-40 transition-all",
					isOpen ? "opacity-0 pointer-events-none" : "opacity-100"
				)}
			>
				<MessageSquare size={24} />
			</motion.button>

			{/* Chat Window */}
			<AnimatePresence>
				{isOpen && (
					<motion.div
						initial={{ opacity: 0, y: 20, scale: 0.95 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 20, scale: 0.95 }}
						className="fixed bottom-8 right-8 w-96 h-[600px] max-h-[80vh] bg-white rounded-3xl shadow-2xl shadow-fab-blue/20 border border-fab-blue/10 flex flex-col z-50 overflow-hidden"
					>
						{/* Header */}
						<div className="bg-fab-blue p-4 flex items-center justify-between text-white">
							<div className="flex items-center gap-3">
								<div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
									<Bot size={18} />
								</div>
								<div>
									<h3 className="font-bold text-sm">Assistente SUCONT</h3>
									<p className="text-[10px] text-white/60 uppercase tracking-wider">IA de Análise Contábil</p>
								</div>
							</div>
							<button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
								<X size={18} />
							</button>
						</div>

						{/* Messages */}
						<div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
							{messages.map((msg) => (
								<div key={msg.id} className={cn("flex gap-3 max-w-[85%]", msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto")}>
									<div
										className={cn(
											"w-8 h-8 rounded-full flex items-center justify-center shrink-0",
											msg.role === "user" ? "bg-fab-sky text-fab-blue" : "bg-fab-gold text-white"
										)}
									>
										{msg.role === "user" ? <User size={14} /> : <Bot size={14} />}
									</div>
									<div
										className={cn(
											"p-3 rounded-2xl text-sm leading-relaxed",
											msg.role === "user"
												? "bg-fab-blue text-white rounded-tr-sm"
												: "bg-white border border-fab-blue/10 text-fab-blue/80 rounded-tl-sm shadow-sm"
										)}
									>
										{msg.content}
									</div>
								</div>
							))}
							{isLoading && (
								<div className="flex gap-3 max-w-[85%] mr-auto">
									<div className="w-8 h-8 rounded-full bg-fab-gold text-white flex items-center justify-center shrink-0">
										<Bot size={14} />
									</div>
									<div className="p-4 rounded-2xl bg-white border border-fab-blue/10 rounded-tl-sm shadow-sm flex items-center gap-2">
										<Loader2 size={16} className="animate-spin text-fab-blue/40" />
										<span className="text-xs text-fab-blue/40 font-medium">Analisando dados...</span>
									</div>
								</div>
							)}
							<div ref={messagesEndRef} />
						</div>

						{/* Input */}
						<div className="p-4 bg-white border-t border-fab-blue/10">
							<div className="flex items-center gap-2 bg-slate-50 border border-fab-blue/10 rounded-full p-1 pl-4">
								<input
									type="text"
									value={input}
									onChange={(e) => setInput(e.target.value)}
									onKeyDown={(e) => e.key === "Enter" && handleSend()}
									placeholder="Faça uma pergunta sobre os dados..."
									className="flex-1 bg-transparent text-sm text-fab-blue focus:outline-none"
								/>
								<button
									onClick={handleSend}
									disabled={!input.trim() || isLoading}
									className="w-10 h-10 rounded-full bg-fab-blue text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:bg-fab-light-blue"
								>
									<Send size={16} className="ml-1" />
								</button>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</>
	)
}
