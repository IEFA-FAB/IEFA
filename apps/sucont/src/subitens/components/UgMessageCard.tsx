// Extraído de routes/subitens-genericos.tsx (port do sucontsubitem): card da mensagem
// institucional de uma UG (modo "Por Unidade Gestora").
import { motion } from "motion/react"
import { EditableMessage } from "#/components/editable-message"
import { Badge } from "#/components/ui/badge"
import type { MessageDraft } from "#/hooks/use-editable-message"
import { CopyMessageButton } from "#/subitens/components/CopyMessageButton"
import { MessageCardControls } from "#/subitens/components/MessageCardControls"
import type { MessageConfig, UgGroup } from "#/subitens/types"
import { formatUgName, getConferente } from "#/subitens/ug"

interface UgMessageCardProps {
	group: UgGroup
	idx: number
	ugConfig: MessageConfig
	draft: MessageDraft
	isCopied: boolean
	onCopy: (text: string, index: number) => void
	onConfigChange: (field: string, value: string) => void
}

export function UgMessageCard({ group, idx, ugConfig, draft, isCopied, onCopy, onConfigChange }: UgMessageCardProps) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true }}
			transition={{ delay: idx * 0.05 }}
			className="bg-card rounded-xl border border-border overflow-hidden flex flex-col lg:flex-row"
		>
			<div className="lg:w-80 bg-muted/50 p-6 border-b lg:border-b-0 lg:border-r border-border flex flex-col justify-between">
				<div>
					<Badge variant="destructive" className="mb-6">
						Pendente
					</Badge>
					<p className="text-label text-muted-foreground mb-1">Unidade Gestora</p>
					<h3 className="text-heading text-foreground mb-1">{formatUgName(group.ug)}</h3>
					<p className="text-label text-muted-foreground mb-4">Conferente: {getConferente(group.ug)}</p>

					<div className="bg-destructive/10 p-4 rounded-xl border border-destructive/30 mb-6">
						<p className="text-label text-destructive mb-1">Inconsistência Identificada</p>
						<p className="text-caption text-destructive leading-relaxed">Múltiplas inconsistências identificadas conforme RAC.</p>
					</div>

					<div className="space-y-3 mt-8">
						<div className="flex justify-between items-center text-body">
							<span className="text-muted-foreground">Ocorrências</span>
							<span className="font-mono font-bold text-foreground">{group.occurrences.length}</span>
						</div>
						<div className="flex justify-between items-center text-body">
							<span className="text-muted-foreground">Total em 99/999</span>
							<span className="font-mono font-bold text-action">
								{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(group.totalSaldo)}
							</span>
						</div>
					</div>

					{/* Per-UG controls */}
					<MessageCardControls idPrefix="ug" idx={idx} config={ugConfig} onConfigChange={onConfigChange} />
				</div>

				<CopyMessageButton isCopied={isCopied} onClick={() => onCopy(draft.text, idx)} />
			</div>

			<div className="flex-1 p-6 bg-card">
				<EditableMessage
					label={`Mensagem institucional da UG ${group.ug}`}
					value={draft.text}
					onChange={draft.setText}
					onReset={draft.reset}
					isEdited={draft.isEdited}
					isStale={draft.isStale}
					textClassName="max-h-[500px] font-mono"
					rows={18}
				/>
			</div>
		</motion.div>
	)
}
