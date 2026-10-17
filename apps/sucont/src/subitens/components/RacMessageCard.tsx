// Extraído de routes/subitens-genericos.tsx (port do sucontsubitem): card da mensagem
// consolidada de uma questão RAC (modo "Consolidada por questão").
import { motion } from "motion/react"
import { EditableMessage } from "#/components/editable-message"
import { Badge } from "#/components/ui/badge"
import type { MessageDraft } from "#/hooks/use-editable-message"
import { CopyMessageButton } from "#/subitens/components/CopyMessageButton"
import { GenericKindCounts } from "#/subitens/components/GenericKindCounts"
import { MessageCardControls } from "#/subitens/components/MessageCardControls"
import { RAC_QUESTIONS } from "#/subitens/message"
import type { MessageConfig, ProcessedData } from "#/subitens/types"

interface RacMessageCardProps {
	racId: string
	idx: number
	racConfig: MessageConfig
	draft: MessageDraft
	occurrences: ProcessedData[]
	totalSaldo: number
	uniqueUgs: number
	isCopied: boolean
	/** Copia o texto da mensagem; a chave do "Copiado" é a da mensagem, decidida pela tela. */
	onCopy: (text: string) => void
	onConfigChange: (field: string, value: string) => void
}

export function RacMessageCard({ racId, idx, racConfig, draft, occurrences, totalSaldo, uniqueUgs, isCopied, onCopy, onConfigChange }: RacMessageCardProps) {
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
					<p className="text-label text-muted-foreground mb-1">Questão RAC</p>
					<h3 className="text-heading text-foreground mb-1">{RAC_QUESTIONS[racId]?.title || racId}</h3>
					<p className="text-label text-muted-foreground mb-4">Múltiplas UGs</p>

					<div className="bg-destructive/10 p-4 rounded-xl border border-destructive/30 mb-6">
						<p className="text-label text-destructive mb-1">Inconsistência Consolidada</p>
						<p className="text-caption text-destructive leading-relaxed">Mensagem única agrupando todas as UGs afetadas por esta questão.</p>
					</div>

					<div className="space-y-3 mt-8">
						<div className="flex justify-between items-center text-body">
							<span className="text-muted-foreground">UGs Afetadas</span>
							<span className="font-mono font-bold text-foreground">{uniqueUgs}</span>
						</div>
						<div className="flex justify-between items-center text-body">
							<span className="text-muted-foreground">Ocorrências</span>
							<span className="font-mono font-bold text-foreground">{occurrences.length}</span>
						</div>
						<GenericKindCounts occurrences={occurrences} />
						<div className="flex justify-between items-center text-body">
							<span className="text-muted-foreground">Saldo total</span>
							<span className="font-mono font-bold text-action">
								{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalSaldo)}
							</span>
						</div>
					</div>

					<MessageCardControls idPrefix="rac" idx={idx} config={racConfig} onConfigChange={onConfigChange} />
				</div>

				<CopyMessageButton isCopied={isCopied} onClick={() => onCopy(draft.text)} />
			</div>

			<div className="flex-1 p-6 bg-card">
				<EditableMessage
					label={`Mensagem consolidada da ${racId}`}
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
