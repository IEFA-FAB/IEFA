/**
 * Card de uma UG na aba operacional: evidenciação das divergências e gerador da
 * mensagem institucional. Extraído de routes/analista-compatibilidade.tsx (port
 * do analistacompatibilidade); o estado continua na rota.
 */
import { AlertTriangle, Building2, CalendarClock, Copy, TrendingDown, Users } from "lucide-react"
import type { Dispatch, SetStateAction } from "react"
import { EditableMessage } from "#/components/editable-message"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { SegmentedControl } from "#/components/ui/segmented-control"
import type { MessageDraft } from "#/hooks/use-editable-message"
import { formatCurrency } from "#/lib/compatibilidade/format"
import type { MessageType } from "#/lib/compatibilidade/message"
import type { UGReport } from "#/lib/compatibilidade/parser"

type PerUgSetter<T> = Dispatch<SetStateAction<Record<string, T>>>

function DivergenceEvidence({ chartData }: { chartData: UGReport["chartData"] }) {
	return (
		<div className="p-6 lg:col-span-5 bg-muted/50 flex flex-col border-r border-border">
			<h4 className="text-label text-muted-foreground mb-6 flex items-center gap-2">
				<AlertTriangle className="w-4 h-4" />
				Evidenciação das Divergências
			</h4>
			<div className="flex-1 flex flex-col gap-4">
				{chartData.map((data, i) => (
					<div key={i} className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
						{/* Era uma faixa de 6px colada à esquerda — o side-stripe que o §6
						    proíbe. A cor da série vira um ponto ao lado do nome. */}
						<div className="flex-1">
							<p className="text-label text-muted-foreground mb-1 flex items-center gap-2">
								<span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: data.color }} aria-hidden />
								{data.name}
							</p>
							<p className="text-subheading text-foreground leading-snug">{data.description.split(" × ")[0]}</p>
							<p className="text-caption text-muted-foreground my-0.5">×</p>
							<p className="text-subheading text-foreground leading-snug">{data.description.split(" × ")[1]}</p>
							<div className="mt-2 pt-2 border-t border-border">
								<p className="text-label text-action mb-0.5">Controle Interno SUCONT-3:</p>
								<p className="text-hint text-muted-foreground leading-tight italic">{data.question}</p>
							</div>
						</div>
						<div className="sm:text-right border-t sm:border-t-0 border-border pt-2 sm:pt-0 mt-2 sm:mt-0">
							<p className="text-label text-muted-foreground mb-1">Diferença</p>
							<p className="text-heading" style={{ color: data.color }}>
								{formatCurrency(data.value)}
							</p>
						</div>
					</div>
				))}
			</div>
		</div>
	)
}

interface MessageGeneratorProps {
	report: UGReport
	msgType: MessageType
	currentPrazo: string
	currentMsgNum: string
	currentMsgDate: string
	currentSubject: string
	draft: MessageDraft
	setMsgNumbers: PerUgSetter<string>
	setMsgDates: PerUgSetter<string>
	setMsgSubjects: PerUgSetter<string>
	setMessageTypes: PerUgSetter<MessageType>
	setPrazos: PerUgSetter<string>
	onCopy: (text: string) => void
}

function MessageGenerator({
	report,
	msgType,
	currentPrazo,
	currentMsgNum,
	currentMsgDate,
	currentSubject,
	draft,
	setMsgNumbers,
	setMsgDates,
	setMsgSubjects,
	setMessageTypes,
	setPrazos,
	onCopy,
}: MessageGeneratorProps) {
	return (
		<div className="p-6 lg:col-span-7 flex flex-col">
			<div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
				<h4 className="text-label text-muted-foreground">Mensagem Institucional</h4>

				<div className="flex flex-wrap items-center gap-3">
					<div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border">
						<label htmlFor={`msg-num-${report.ug}`} className="text-caption text-muted-foreground whitespace-nowrap">
							Nº da Mensagem:
						</label>
						<Input
							id={`msg-num-${report.ug}`}
							type="text"
							placeholder="Ex: 123"
							value={currentMsgNum}
							onChange={(e) =>
								setMsgNumbers((prev) => ({
									...prev,
									[report.ug]: e.target.value,
								}))
							}
							className="w-20"
						/>
					</div>

					<div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border">
						<label htmlFor={`msg-date-${report.ug}`} className="text-caption text-muted-foreground whitespace-nowrap">
							Data:
						</label>
						<Input
							id={`msg-date-${report.ug}`}
							type="date"
							value={currentMsgDate}
							onChange={(e) =>
								setMsgDates((prev) => ({
									...prev,
									[report.ug]: e.target.value,
								}))
							}
							className="w-auto"
						/>
					</div>

					<div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border">
						<label htmlFor={`msg-subject-${report.ug}`} className="text-caption text-muted-foreground whitespace-nowrap">
							Assunto:
						</label>
						<Input
							id={`msg-subject-${report.ug}`}
							type="text"
							placeholder="Assunto da mensagem"
							value={currentSubject}
							onChange={(e) =>
								setMsgSubjects((prev) => ({
									...prev,
									[report.ug]: e.target.value,
								}))
							}
							className="w-48"
						/>
					</div>

					<SegmentedControl
						label="Tipo de mensagem"
						size="sm"
						value={msgType}
						onValueChange={(value) => setMessageTypes((prev) => ({ ...prev, [report.ug]: value }))}
						options={[
							{ value: "com_prazo", label: "Com prazo" },
							{ value: "sem_prazo", label: "Sem prazo" },
							{ value: "alerta", label: "Alerta" },
						]}
					/>

					{msgType === "com_prazo" && (
						<div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border">
							<CalendarClock className="w-4 h-4 text-muted-foreground" />
							<label htmlFor={`msg-prazo-${report.ug}`} className="text-caption text-muted-foreground whitespace-nowrap">
								Prazo:
							</label>
							<Input
								id={`msg-prazo-${report.ug}`}
								type="date"
								value={currentPrazo}
								onChange={(e) =>
									setPrazos((prev) => ({
										...prev,
										[report.ug]: e.target.value,
									}))
								}
								className="w-auto"
							/>
						</div>
					)}

					<Button type="button" variant="outline" size="sm" onClick={() => onCopy(draft.text)}>
						<Copy />
						Copiar
					</Button>
				</div>
			</div>

			<EditableMessage
				label={`Mensagem institucional da UG ${report.ugCode}`}
				value={draft.text}
				onChange={draft.setText}
				onReset={draft.reset}
				isEdited={draft.isEdited}
				isStale={draft.isStale}
				className="flex-1"
				textClassName="rounded-xl p-5 font-mono"
				rows={18}
			/>
		</div>
	)
}

export interface UgReportCardProps extends MessageGeneratorProps {
	idx: number
}

export function UgReportCard({ idx, ...messageProps }: UgReportCardProps) {
	const { report } = messageProps
	return (
		<div className="bg-card rounded-xl border border-border overflow-hidden flex flex-col">
			{/* Cabeçalho na superfície do card — era uma faixa `tech-blue` sólida
			    com texto branco, o mesmo cabeçalho do `ug-card` do monitoramento
			    em outra cor. */}
			<div className="bg-muted/50 border-b border-border px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<span className="font-mono text-caption text-muted-foreground">#{idx + 1}</span>
					<h3 className="text-heading text-foreground flex flex-wrap items-center gap-2">
						{report.ugName} (UG {report.ugCode})
						<Badge variant="muted">
							<Building2 />
							{report.superior} / {report.ods}
						</Badge>
						<Badge variant="muted">
							<Users />
							Conferente: {report.conferente}
						</Badge>
					</h3>
				</div>
				<div className="flex items-center gap-2 text-destructive">
					<TrendingDown className="w-4 h-4" />
					<span className="text-caption">Diferença total</span>
					<span className="text-subheading">{formatCurrency(report.totalDiff)}</span>
				</div>
			</div>

			{/* Card body */}
			<div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-border">
				{/* Left: Divergences */}
				<DivergenceEvidence chartData={report.chartData} />

				{/* Right: Message generator */}
				<MessageGenerator {...messageProps} />
			</div>
		</div>
	)
}
