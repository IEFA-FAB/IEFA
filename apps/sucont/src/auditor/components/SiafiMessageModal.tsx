import { useMutation } from "@tanstack/react-query"
import { Check, Copy, Loader2, MessageSquareText, X } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { registerAuditorMessageFn } from "#/server/auditor.fn"
import { generateMessage } from "../services/dataProcessor"
import type { FinancialRecord, TimeFilter } from "../types"

interface SiafiMessageModalProps {
	isOpen: boolean
	onClose: () => void
	record: FinancialRecord | null
	history?: FinancialRecord[]
	context?: "RANKING" | "HEATMAP"
	timeFilter?: TimeFilter
}

/** Enquanto a mensagem não foi registrada, o corpo carrega este marcador no lugar do número. */
const PENDING_NUMBER = "XXX"

export const SiafiMessageModal: React.FC<SiafiMessageModalProps> = ({ isOpen, onClose, record, history, context = "HEATMAP", timeFilter = "MENSAL" }) => {
	const [deadline, setDeadline] = useState("")
	const [copied, setCopied] = useState(false)
	const [editedMessage, setEditedMessage] = useState("")
	/** Número definitivo, atribuído pela sequência do banco no momento do registro. */
	const [assignedNumber, setAssignedNumber] = useState<number | null>(null)

	useEffect(() => {
		if (isOpen && record) {
			const date = new Date()
			date.setDate(date.getDate() + 3)
			const defaultDeadline = date.toLocaleDateString("pt-BR")
			setDeadline(defaultDeadline)
			setCopied(false)
			setAssignedNumber(null)

			const initialMsg = generateMessage(context as "RANKING" | "HEATMAP", record, PENDING_NUMBER, defaultDeadline, history, timeFilter)
			setEditedMessage(initialMsg)
		}
	}, [isOpen, record, context, history, timeFilter])

	// Reconstrói o corpo quando o prazo muda — mas só antes do registro. Depois de
	// registrada, a mensagem gravada é a prova do que foi enviado e não é regerada.
	useEffect(() => {
		if (isOpen && record && assignedNumber === null) {
			const newMsg = generateMessage(context as "RANKING" | "HEATMAP", record, PENDING_NUMBER, deadline, history, timeFilter)
			setEditedMessage(newMsg)
		}
	}, [deadline, history, timeFilter, record, isOpen, context, assignedNumber])

	const registerMutation = useMutation({
		mutationFn: (corpo: string) =>
			registerAuditorMessageFn({
				data: { corpo, ugCodigo: record?.cod ?? null, tipo: context },
			}),
		onSuccess: async (result) => {
			// O servidor devolve o corpo já com o número real substituído: o texto
			// gravado e o texto copiado são o mesmo, senão a prova do envio não vale.
			setAssignedNumber(result.number)
			setEditedMessage(result.corpo)
			try {
				await navigator.clipboard.writeText(result.corpo)
				setCopied(true)
				setTimeout(() => setCopied(false), 2000)
				toast.success(`MSG NR ${result.number} registrada e copiada`)
			} catch {
				toast.success(`MSG NR ${result.number} registrada — copie o texto manualmente`)
			}
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao registrar a mensagem"),
	})

	if (!isOpen || !record) return null

	const handleCopy = () => {
		if (assignedNumber !== null) {
			navigator.clipboard.writeText(editedMessage)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
			return
		}
		registerMutation.mutate(editedMessage)
	}

	return (
		<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
			<div className="w-[90vw] h-[85vh] bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl overflow-hidden flex flex-col">
				{/* Header */}
				<div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-[#0f172a]">
					<div className="flex items-center gap-3">
						<MessageSquareText className="w-6 h-6 text-blue-600 dark:text-blue-500" />
						<h2 className="text-xl font-bold text-slate-800 dark:text-white">
							Gerar Mensagem SIAFI: <span className="text-blue-600 dark:text-blue-400">{record.ug}</span>
						</h2>
						<span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-lg uppercase tracking-wide">
							{context === "RANKING" ? "Modelo Comparativo" : "Modelo Evolutivo"}
						</span>
					</div>
					<button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors">
						<X className="w-6 h-6" />
					</button>
				</div>

				{/* Configuration */}
				<div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-[#1e293b]">
					<div className="space-y-2">
						<label htmlFor="siafi-msg-number" className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
							NR MENSAGEM
						</label>
						<input
							id="siafi-msg-number"
							type="text"
							readOnly
							value={assignedNumber !== null ? String(assignedNumber) : "atribuído ao registrar"}
							className="w-full bg-slate-100 dark:bg-[#020617] border border-slate-300 dark:border-slate-600 rounded-lg py-3 px-4 text-base text-slate-500 dark:text-slate-400 outline-none"
						/>
						<p className="text-[11px] text-slate-500">Sequência compartilhada da seção — não é digitada.</p>
					</div>
					<div className="space-y-2">
						<label htmlFor="siafi-msg-deadline" className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
							PRAZO (DATA LIMITE)
						</label>
						<input
							id="siafi-msg-deadline"
							type="text"
							value={deadline}
							onChange={(e) => setDeadline(e.target.value)}
							className="w-full bg-slate-50 dark:bg-[#020617] border border-slate-300 dark:border-slate-600 rounded-lg py-3 px-4 text-base text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-slate-400 dark:placeholder-slate-600"
							placeholder="DD/MM/AAAA"
						/>
					</div>
				</div>

				{/* Preview Container */}
				<div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-[#0f172a] mx-6 mb-0 rounded-t-xl border-t border-x border-slate-200 dark:border-slate-700">
					<div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50">
						<span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Pré-visualização da Mensagem</span>
						<span className="text-[10px] font-bold bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-500/20 uppercase">
							Formato Texto Simples
						</span>
					</div>

					<div className="flex-1 p-0 overflow-hidden">
						<textarea
							value={editedMessage}
							onChange={(e) => setEditedMessage(e.target.value)}
							className="w-full h-full p-6 bg-transparent font-mono text-sm text-slate-800 dark:text-slate-300 whitespace-pre-wrap leading-relaxed outline-none resize-none custom-scrollbar overflow-y-auto box-border"
							spellCheck={false}
						/>
					</div>
				</div>

				{/* Footer */}
				<div className="p-6 bg-white dark:bg-[#1e293b] border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
					<span className="text-xs text-slate-500">
						{assignedNumber !== null
							? `MSG NR ${assignedNumber} registrada. Cole este texto no sistema de mensageria SIAFI.`
							: "Registrar grava a mensagem, atribui o número da sequência e copia o texto final."}
					</span>

					<div className="flex items-center justify-end gap-3">
						<button
							type="button"
							onClick={onClose}
							className="px-6 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white transition-colors"
						>
							Cancelar
						</button>
						<button
							type="button"
							onClick={handleCopy}
							disabled={registerMutation.isPending}
							className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-lg transition-all shadow-lg disabled:opacity-60 disabled:cursor-not-allowed
                ${
									copied
										? "bg-emerald-600 text-white shadow-emerald-900/20 hover:bg-emerald-500"
										: "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20"
								}
              `}
						>
							{registerMutation.isPending ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : copied ? (
								<Check className="w-4 h-4" />
							) : (
								<Copy className="w-4 h-4" />
							)}
							{registerMutation.isPending ? "Registrando" : copied ? "Copiado" : assignedNumber !== null ? "Copiar" : "Registrar e copiar"}
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}
