import { useMutation } from "@tanstack/react-query"
import { Check, Copy, Loader2, MessageSquareText, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { toast } from "#/components/ui/toast"
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
	/** Rodada de importação que originou estes saldos — trilha arquivo → MSG. */
	analysisRunId?: string | null
}

/** Enquanto a mensagem não foi registrada, o corpo carrega este marcador no lugar do número. */
const PENDING_NUMBER = "XXX"

export const SiafiMessageModal: React.FC<SiafiMessageModalProps> = ({
	isOpen,
	onClose,
	record,
	history,
	context = "HEATMAP",
	timeFilter = "MENSAL",
	analysisRunId = null,
}) => {
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
				data: { corpo, ugCodigo: record?.cod ?? null, tipo: context, analysisRunId },
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
			<div className="w-[90vw] h-[85vh] bg-card border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col">
				{/* Header */}
				<div className="p-5 border-b border-border flex items-center justify-between bg-muted/50">
					<div className="flex items-center gap-3">
						<MessageSquareText className="w-6 h-6 text-action" />
						<h2 className="text-heading text-foreground">
							Gerar Mensagem SIAFI: <span className="text-action">{record.ug}</span>
						</h2>
						<span className="text-caption bg-muted text-muted-foreground px-2 py-0.5 rounded-lg">
							{context === "RANKING" ? "Modelo Comparativo" : "Modelo Evolutivo"}
						</span>
					</div>
					<Button variant="ghost" size="icon" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fechar">
						<X className="w-6 h-6" />
					</Button>
				</div>

				{/* Configuration */}
				<div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-card">
					<div className="space-y-2">
						<label htmlFor="siafi-msg-number" className="text-label text-muted-foreground">
							NR MENSAGEM
						</label>
						<Input
							id="siafi-msg-number"
							type="text"
							readOnly
							value={assignedNumber !== null ? String(assignedNumber) : "atribuído ao registrar"}
							className="h-auto bg-muted py-3 px-4 text-body text-muted-foreground shadow-none"
						/>
						<p className="text-hint text-muted-foreground">Sequência compartilhada da seção — não é digitada.</p>
					</div>
					<div className="space-y-2">
						<label htmlFor="siafi-msg-deadline" className="text-label text-muted-foreground">
							PRAZO (DATA LIMITE)
						</label>
						<Input
							id="siafi-msg-deadline"
							type="text"
							value={deadline}
							onChange={(e) => setDeadline(e.target.value)}
							className="h-auto bg-muted/50 py-3 px-4 text-body text-foreground shadow-none"
							placeholder="DD/MM/AAAA"
						/>
					</div>
				</div>

				{/* Preview Container */}
				<div className="flex-1 flex flex-col min-h-0 bg-muted/50 mx-6 mb-0 rounded-t-xl border-t border-x border-border">
					<div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted">
						<span className="text-label text-muted-foreground">Pré-visualização da Mensagem</span>
						<span className="text-label bg-action/10 text-action px-2 py-0.5 rounded-lg border border-action/30">Formato Texto Simples</span>
					</div>

					<div className="flex-1 p-0 overflow-hidden">
						<textarea
							value={editedMessage}
							onChange={(e) => setEditedMessage(e.target.value)}
							className="w-full h-full p-6 bg-transparent font-mono text-body text-foreground whitespace-pre-wrap leading-relaxed outline-none resize-none custom-scrollbar overflow-y-auto box-border"
							spellCheck={false}
						/>
					</div>
				</div>

				{/* Footer */}
				<div className="p-6 bg-card border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
					<span className="text-caption text-muted-foreground">
						{assignedNumber !== null
							? `MSG NR ${assignedNumber} registrada. Cole este texto no sistema de mensageria SIAFI.`
							: "Registrar grava a mensagem, atribui o número da sequência e copia o texto final."}
					</span>

					<div className="flex items-center justify-end gap-3">
						<Button
							type="button"
							variant="ghost"
							size="lg"
							onClick={onClose}
							className="font-semibold text-muted-foreground hover:bg-transparent hover:text-foreground"
						>
							Cancelar
						</Button>
						<Button
							type="button"
							size="lg"
							variant={copied ? "success" : "default"}
							onClick={handleCopy}
							disabled={registerMutation.isPending}
							className={`rounded-lg font-bold shadow-lg ${copied ? "" : "bg-action text-action-foreground hover:bg-action/80"}`}
						>
							{registerMutation.isPending ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : copied ? (
								<Check className="w-4 h-4" />
							) : (
								<Copy className="w-4 h-4" />
							)}
							{registerMutation.isPending ? "Registrando" : copied ? "Copiado" : assignedNumber !== null ? "Copiar" : "Registrar e copiar"}
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}
