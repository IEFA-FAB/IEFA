// Extraído de routes/conta-generica.tsx (port do analistacontagenerica).
import { Input } from "#/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"
import type { MessageType } from "#/lib/conta-generica/messages"

export interface MessageControlsProps {
	msgNumber: string
	setMsgNumber: (v: string) => void
	msgDate: string
	setMsgDate: (v: string) => void
	messageType: MessageType
	setMessageType: (v: MessageType) => void
	deadline: string
	setDeadline: (v: string) => void
}

// ── Sub-component: shared message controls ───────────────────────────────────

export function MessageControls({ msgNumber, setMsgNumber, msgDate, setMsgDate, messageType, setMessageType, deadline, setDeadline }: MessageControlsProps) {
	return (
		<div className="flex flex-wrap items-center gap-3">
			<div className="flex items-center gap-3 bg-card px-3 py-1.5 rounded-lg border border-border">
				<span className="text-label text-muted-foreground">Nº Mensagem:</span>
				<Input type="text" value={msgNumber} onChange={(e) => setMsgNumber(e.target.value)} placeholder="Ex: 001" size="sm" className="w-20 text-center" />
			</div>
			<div className="flex items-center gap-3 bg-card px-3 py-1.5 rounded-lg border border-border">
				<span className="text-label text-muted-foreground">Data:</span>
				<Input type="date" value={msgDate} onChange={(e) => setMsgDate(e.target.value)} size="sm" />
			</div>
			<div className="flex items-center gap-3 bg-card px-3 py-1.5 rounded-lg border border-border">
				<span className="text-label text-muted-foreground">Tipo:</span>
				<Select
					items={{ sem_prazo: "Sem Prazo", prazo: "Com Prazo", alerta: "Apenas Alerta" }}
					value={messageType}
					onValueChange={(value) => setMessageType(value as typeof messageType)}
				>
					<SelectTrigger size="sm">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="sem_prazo">Sem Prazo</SelectItem>
						<SelectItem value="prazo">Com Prazo</SelectItem>
						<SelectItem value="alerta">Apenas Alerta</SelectItem>
					</SelectContent>
				</Select>
			</div>
			{messageType === "prazo" && (
				<div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-300 bg-card px-3 py-1.5 rounded-lg border border-border">
					<span className="text-label text-foreground">Data Limite:</span>
					<Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} size="sm" />
				</div>
			)}
		</div>
	)
}
