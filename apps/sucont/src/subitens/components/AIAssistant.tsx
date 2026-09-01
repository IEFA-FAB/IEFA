import { fetchServerSentEvents, useChat } from "@tanstack/ai-react"
import { type ClassValue, clsx } from "clsx"
import { Bot, Loader2, MessageSquare, Send, User, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { twMerge } from "tailwind-merge"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"

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
					"fixed bottom-8 right-8 w-14 h-14 rounded-full bg-tech-blue text-white flex items-center justify-center z-40 transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50",
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
						className="fixed bottom-8 right-8 w-96 h-[600px] max-h-[80vh] bg-card rounded-xl border border-border flex flex-col z-50 overflow-hidden"
					>
						{/* Header */}
						<div className="bg-tech-blue p-4 flex items-center justify-between text-white">
							<div className="flex items-center gap-3">
								<div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
									<Bot size={18} />
								</div>
								<div>
									<h3 className="text-subheading">Assistente SUCONT</h3>
									<p className="text-label text-white/60">IA de Análise Contábil</p>
								</div>
							</div>
							<Button
								onClick={() => setIsOpen(false)}
								variant="ghost"
								size="icon-sm"
								className="rounded-full text-white hover:bg-white/10 hover:text-white"
								type="button"
								aria-label="Fechar chat"
							>
								<X size={18} />
							</Button>
						</div>

						{/* Messages */}
						<div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/50">
							{messages.map((msg) => {
								const textPart = msg.parts?.find((p) => p.type === "text")
								const text = textPart?.content ?? ""
								return (
									<div key={msg.id} className={cn("flex gap-3 max-w-[85%]", msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto")}>
										<div
											className={cn(
												"w-8 h-8 rounded-full flex items-center justify-center shrink-0",
												msg.role === "user" ? "bg-muted text-foreground" : "bg-warning text-white"
											)}
										>
											{msg.role === "user" ? <User size={14} /> : <Bot size={14} />}
										</div>
										<div
											className={cn(
												"p-3 rounded-xl text-body leading-relaxed",
												msg.role === "user"
													? "bg-tech-blue text-white rounded-tr-sm"
													: "bg-card border border-border text-muted-foreground rounded-tl-sm shadow-sm"
											)}
										>
											{text}
										</div>
									</div>
								)
							})}
							{isStreaming && (
								<div className="flex gap-3 max-w-[85%] mr-auto">
									<div className="w-8 h-8 rounded-full bg-warning text-white flex items-center justify-center shrink-0">
										<Bot size={14} />
									</div>
									<div className="p-4 rounded-xl bg-card border border-border rounded-tl-sm shadow-sm flex items-center gap-2">
										<Loader2 size={16} className="animate-spin text-muted-foreground" />
										<span className="text-caption text-muted-foreground">Analisando dados...</span>
									</div>
								</div>
							)}
							<div ref={messagesEndRef} />
						</div>

						{/* Input */}
						<div className="p-4 bg-card border-t border-border">
							<div className="flex items-center gap-2 bg-muted/50 border border-border rounded-full p-1 pl-4">
								<Input
									type="text"
									value={input}
									onChange={(e) => setInput(e.target.value)}
									onKeyDown={(e) => e.key === "Enter" && handleSend()}
									placeholder="Faça uma pergunta sobre os dados..."
									className="h-auto flex-1 border-none bg-transparent p-0 text-body text-foreground shadow-none outline-none focus-visible:border-none focus-visible:ring-0"
								/>
								<Button
									onClick={isStreaming ? stop : handleSend}
									disabled={!isStreaming && (!input.trim() || isLoading)}
									type="button"
									size="icon"
									aria-label={isStreaming ? "Parar" : "Enviar"}
									className="w-10 h-10 rounded-full bg-tech-blue text-white hover:bg-tech-blue disabled:opacity-50 disabled:cursor-not-allowed"
								>
									{isStreaming ? <X size={16} /> : <Send size={16} className="ml-1" />}
								</Button>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</>
	)
}
