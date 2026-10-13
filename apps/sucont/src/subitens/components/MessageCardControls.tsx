// Extraído de routes/subitens-genericos.tsx (port do sucontsubitem): número, data, tipo e
// prazo da mensagem, iguais no card por UG (`ug-…`) e no consolidado por questão (`rac-…`).
import { AnimatePresence, motion } from "motion/react"
import { Input } from "#/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"
import { defaultDeadline } from "#/subitens/message"
import type { MessageConfig } from "#/subitens/types"

interface MessageCardControlsProps {
	/** Prefixo dos ids dos campos: `ug` no modo individual, `rac` no consolidado. */
	idPrefix: "ug" | "rac"
	idx: number
	config: MessageConfig
	onConfigChange: (field: string, value: string) => void
}

export function MessageCardControls({ idPrefix, idx, config, onConfigChange }: MessageCardControlsProps) {
	return (
		<div className="mt-8 pt-8 border-t border-border space-y-6">
			<div className="grid grid-cols-2 gap-4">
				<div className="flex flex-col gap-2">
					<label htmlFor={`${idPrefix}-msg-number-${idx}`} className="text-label text-muted-foreground">
						Nº Mensagem
					</label>
					<Input
						id={`${idPrefix}-msg-number-${idx}`}
						type="text"
						value={config.msgNumber}
						onChange={(e) => onConfigChange("msgNumber", e.target.value)}
						placeholder="___"
						size="sm"
					/>
				</div>
				<div className="flex flex-col gap-2">
					<label htmlFor={`${idPrefix}-msg-date-${idx}`} className="text-label text-muted-foreground">
						Data Mensagem
					</label>
					<Input id={`${idPrefix}-msg-date-${idx}`} type="date" value={config.msgDate} onChange={(e) => onConfigChange("msgDate", e.target.value)} size="sm" />
				</div>
			</div>

			<div>
				<div className="flex flex-col gap-2 mb-4">
					<label htmlFor={`${idPrefix}-msg-type-${idx}`} className="text-label text-muted-foreground">
						Tipo de Mensagem
					</label>
					<Select
						items={{ sem_prazo: "Sem Prazo", com_prazo: "Com Prazo", alerta: "Apenas Alerta" }}
						value={config.messageType}
						onValueChange={(value) => onConfigChange("messageType", value as "com_prazo" | "sem_prazo" | "alerta")}
					>
						<SelectTrigger id={`${idPrefix}-msg-type-${idx}`} size="sm" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="sem_prazo">Sem Prazo</SelectItem>
							<SelectItem value="com_prazo">Com Prazo</SelectItem>
							<SelectItem value="alerta">Apenas Alerta</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<AnimatePresence>
					{config.messageType === "com_prazo" && (
						<motion.div
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							className="space-y-3 overflow-hidden"
						>
							<div className="flex flex-col gap-2">
								<label htmlFor={`${idPrefix}-deadline-${idx}`} className="text-label text-muted-foreground">
									Data Limite
								</label>
								<Input
									id={`${idPrefix}-deadline-${idx}`}
									type="date"
									value={config.deadlineDate || defaultDeadline()}
									onChange={(e) => onConfigChange("deadlineDate", e.target.value)}
									size="sm"
								/>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	)
}
