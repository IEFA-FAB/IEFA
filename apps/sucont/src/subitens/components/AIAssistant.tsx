import { fetchServerSentEvents, useChat } from "@tanstack/ai-react"
import { type ClassValue, clsx } from "clsx"
import { Bot, Loader2, MessageSquare, Send, User, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { twMerge } from "tailwind-merge"

function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

interface AIAssistantProps {
	// biome-ignore lint/suspicious/noExplicitAny: context carries arbitrary data shape
	dataContext: any
}

export function AIAssistant({ dataContext }: AIAssistantProps) {
	const [isOpen, setIsOpen] = useState(false)
	const [input, setInput] = useState("")
	const messagesEndRef = useRef<HTMLDivElement>(null)

	const contextSummary = useMemo(
		() =>
			JSON.stringify({
				totalInconsistencias: dataContext.totalInconsistencias,
				totalVolume: dataContext.totalVolume,
				odsList: dataContext.odsList,
				orgaoSuperiorList: dataContext.orgaoSuperiorList,
				// biome-ignore lint/suspicious/noExplicitAny: dynamic data shape from parent
				topUGs: dataContext.topUgsByInconsistencias?.slice(0, 10).map((ug: any) => ({
					ug: ug.ug,
					occurrences: ug.occurrences.length,
					saldo: ug.totalSaldo,
				})),
				topRACs: dataContext.racList,
				conferentes: dataContext.conferentesList?.slice(0, 5),
				pareto: dataContext.paretoSummary,
				niveisCriticos: dataContext.criticalLevels,
			}),
		[dataContext]
	)

	const connection = useMemo(
		() => fetchServerSentEvents("/api/chat/stream"),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[]
	)

	const { messages, sendMessage, isLoading, status, stop } = useChat({
		connection,
		forwardedProps: { contextSummary },
		initialMessages: [
			{
				id: "welcome",
				role: "assistant",
				parts: [
					{
						type: "text",
						content:
							'Olá! Sou o Assistente de Análise do Analista SUCONT. Posso ajudar a interpretar os dados contábeis, identificar padrões ou responder perguntas como "Qual ODS tem mais inconsistências?". Como posso ajudar hoje?',
					},
				],
			},
		],
	})

	const scrollToBottom = useCallback(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
	}, [])

	useEffect(() => {
		scrollToBottom()
	}, [scrollToBottom])

	const handleSend = useCallback(async () => {
		if (!input.trim() || isLoading) return
		const text = input.trim()
		setInput("")
		await sendMessage(text)
	}, [input, isLoading, sendMessage])

	const isStreaming = status === "streaming"

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
							<button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors" type="button">
								<X size={18} />
							</button>
						</div>

						{/* Messages */}
						<div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
							{messages.map((msg) => {
								const textPart = msg.parts?.find((p) => p.type === "text")
								const text = textPart?.content ?? ""
								return (
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
											{text}
										</div>
									</div>
								)
							})}
							{isStreaming && (
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
									onClick={isStreaming ? stop : handleSend}
									disabled={!isStreaming && (!input.trim() || isLoading)}
									type="button"
									className="w-10 h-10 rounded-full bg-fab-blue text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:bg-fab-light-blue"
								>
									{isStreaming ? <X size={16} /> : <Send size={16} className="ml-1" />}
								</button>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</>
	)
}
