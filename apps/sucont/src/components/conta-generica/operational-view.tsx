// Extraído de routes/conta-generica.tsx (port do analistacontagenerica): visão
// operacional — modo e filtro das mensagens, mensagem única e cartões por UG.
// Os rascunhos (`useMessageDrafts`) continuam no componente da rota.
import { Building2, Calendar, Check, Compass, Copy, FileSpreadsheet, FileText, MessageSquare, Wallet } from "lucide-react"
import { MessageControls, type MessageControlsProps } from "#/components/conta-generica/message-controls"
import { EditableMessage } from "#/components/editable-message"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { SectionHeader } from "#/components/ui/section-header"
import { SegmentedControl } from "#/components/ui/segmented-control"
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip"
import type { MessageDraft } from "#/hooks/use-editable-message"
import { formatCurrency, type GroupedData, getConferente, getOds, getOs, getUgName } from "#/lib/conta-generica/helpers"
import { CONFERENTES } from "#/lib/ug/registry"

export type MessageMode = "individual" | "unica"

export function OperationalHeader({ messageMode, onMessageModeChange }: { messageMode: MessageMode; onMessageModeChange: (mode: MessageMode) => void }) {
	return (
		<SectionHeader
			icon={<Compass />}
			title="Retrato das inconsistências"
			description="Ações de cobrança e auditoria SUCONT-3"
			actions={
				<SegmentedControl
					label="Modo de mensagem"
					value={messageMode}
					onValueChange={onMessageModeChange}
					options={[
						{ value: "individual", label: "Mensagens individuais" },
						{ value: "unica", label: "Mensagem única (agrupada)" },
					]}
				/>
			}
		/>
	)
}

/*
 * Filtro no corpo, com rótulo — o segmentado do hub, não N botões
 * pintados de `tech-blue`/`success` conforme o estado.
 */
export function ConferenteFilterControl({
	conferenteFilter,
	onConferenteFilterChange,
}: {
	conferenteFilter: string | null
	onConferenteFilterChange: (conferente: string | null) => void
}) {
	return (
		<div className="flex flex-col gap-2">
			<span className="text-label text-muted-foreground">Filtrar por responsável</span>
			<SegmentedControl
				label="Filtrar por responsável"
				value={conferenteFilter ?? "all"}
				onValueChange={(value) => onConferenteFilterChange(value === "all" ? null : value)}
				options={[{ value: "all", label: "Todos" }, ...CONFERENTES.map((conf) => ({ value: conf, label: conf }))]}
			/>
		</div>
	)
}

interface CopyProps {
	copiedUg: string | null
	onCopy: (text: string, key: string) => void
}

/** Única message */
export function SingleMessagePanel({ message, copiedUg, onCopy, controls }: CopyProps & { message: MessageDraft; controls: MessageControlsProps }) {
	return (
		<div className="bg-card rounded-xl border border-border overflow-hidden flex flex-col lg:flex-row">
			<div className="lg:w-1/3 border-b lg:border-b-0 lg:border-r border-border bg-muted/30 flex flex-col">
				<div className="p-6 border-b border-border bg-card">
					<div className="flex items-center gap-3 mb-4">
						<div className="w-10 h-10 bg-action/10 rounded-lg flex items-center justify-center">
							<MessageSquare className="w-6 h-6 text-foreground" />
						</div>
						<div>
							<h3 className="text-heading text-foreground">Mensagem Única</h3>
							<div className="text-label text-muted-foreground">Agrupamento Geral</div>
						</div>
					</div>
					<p className="text-body text-muted-foreground mb-4">Consolida as inconsistências de todas as UGs filtradas. Ideal para envio coletivo.</p>
				</div>
				<div className="p-6 flex-1 bg-muted/50">
					<MessageControls {...controls} />
				</div>
			</div>
			<div className="p-6 flex-1 bg-muted/30">
				<div className="relative flex h-full flex-col">
					<EditableMessage
						label="Mensagem institucional consolidada"
						value={message.text}
						onChange={message.setText}
						onReset={message.reset}
						isEdited={message.isEdited}
						isStale={message.isStale}
						className="h-full"
						textClassName="rounded-xl bg-card p-6 pr-16 font-mono"
					/>
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									size="icon-sm"
									aria-label="Copiar Mensagem"
									onClick={() => {
										onCopy(message.text, "unica")
									}}
									variant="outline"
									className="absolute top-4 right-4"
								>
									{copiedUg === "unica" ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
								</Button>
							}
						/>
						<TooltipContent>Copiar Mensagem</TooltipContent>
					</Tooltip>
				</div>
			</div>
		</div>
	)
}

/** Left: data portrait */
function UgDataPortrait({ ug, contas }: { ug: string; contas: GroupedData[string] }) {
	let ugTotalBalance = 0
	for (const regs of Object.values(contas)) {
		for (const reg of regs) ugTotalBalance += reg.saldo
	}

	return (
		<div className="lg:w-5/12 border-b lg:border-b-0 lg:border-r border-border bg-muted/30 flex flex-col">
			<div className="p-6 border-b border-border bg-card">
				<div className="flex items-center justify-between mb-2">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 bg-action/10 rounded-lg flex items-center justify-center">
							<Building2 className="w-6 h-6 text-foreground" />
						</div>
						<div>
							<h3 className="text-heading text-foreground">UG {ug}</h3>
							<div className="text-label text-muted-foreground mb-1">
								{getUgName(ug)} ({ug}), subordinada ao {getOs(ug)} / {getOds(ug)}
							</div>
							<div className="military-label">Conferente: {getConferente(ug)}</div>
						</div>
					</div>
					<Badge variant="warning">{Object.keys(contas).length} alerta(s)</Badge>
				</div>
				<div className="mt-4 p-3 bg-action/5 rounded-xl border border-border">
					<p className="text-label text-muted-foreground mb-1">Saldo Consolidado</p>
					<p className="text-display text-foreground">{formatCurrency(ugTotalBalance)}</p>
				</div>
			</div>
			<div className="p-6 flex-1 overflow-y-auto">
				<h4 className="military-label mb-4">Dossiê de Inconsistências</h4>
				<div className="space-y-4">
					{Object.entries(contas).map(([conta, regs]) => (
						<div key={conta} className="bg-card rounded-xl p-4 border border-border shadow-sm relative overflow-hidden group">
							<div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
								<FileSpreadsheet className="w-12 h-12" />
							</div>
							<div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
								<Wallet className="w-4 h-4 text-foreground" />
								<span className="font-mono font-bold text-foreground">{conta}</span>
							</div>
							<div className="space-y-2">
								{regs.map((reg, idx) => (
									<div key={idx} className="flex items-center justify-between text-body">
										<div className="flex items-center gap-1.5 text-muted-foreground text-label">
											<Calendar className="w-3.5 h-3.5 text-warning" />
											<span>{reg.mes}</span>
										</div>
										<span className="font-bold text-foreground">{formatCurrency(reg.saldo)}</span>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}

/** Right: message action */
function UgMessageAction({ ug, message, copiedUg, onCopy, controls }: CopyProps & { ug: string; message: MessageDraft; controls: MessageControlsProps }) {
	return (
		<div className="lg:w-7/12 flex flex-col bg-card">
			<div className="px-6 py-4 border-b border-border flex flex-col gap-4 bg-muted/50">
				<div className="flex items-center justify-between">
					<div className="flex flex-col gap-1">
						<div className="flex items-center gap-2 text-foreground">
							<FileText className="w-5 h-5" />
							<h4 className="text-label">Mensagem Institucional Pronta</h4>
						</div>
						<p className="text-label text-muted-foreground">
							UG {ug} — Conferente: {getConferente(ug)}
							<br />
							<span className="text-warning">Inconsistência identificada: utilização de conta contábil genérica.</span>
						</p>
					</div>
					<Button type="button" onClick={() => onCopy(message.text, ug)} variant={copiedUg === ug ? "success" : "default"}>
						{copiedUg === ug ? (
							<>
								<Check className="w-4 h-4" /> Copiado
							</>
						) : (
							<>
								<Copy className="w-4 h-4" /> Copiar Mensagem
							</>
						)}
					</Button>
				</div>

				<div className="flex flex-wrap items-center gap-4 pt-4 border-t border-border">
					<MessageControls {...controls} />
				</div>
			</div>
			<div className="p-6 flex-1 bg-muted/30">
				<EditableMessage
					label={`Mensagem institucional da UG ${ug}`}
					value={message.text}
					onChange={message.setText}
					onReset={message.reset}
					isEdited={message.isEdited}
					isStale={message.isStale}
					className="h-full"
					textClassName="rounded-xl bg-card p-6 font-mono"
				/>
			</div>
		</div>
	)
}

/** Individual messages: um cartão por UG. */
export function UgMessageCard({
	ug,
	contas,
	message,
	copiedUg,
	onCopy,
	controls,
}: CopyProps & { ug: string; contas: GroupedData[string]; message: MessageDraft; controls: MessageControlsProps }) {
	return (
		<div className="bg-card rounded-xl border border-border overflow-hidden flex flex-col lg:flex-row">
			<UgDataPortrait ug={ug} contas={contas} />
			<UgMessageAction ug={ug} message={message} copiedUg={copiedUg} onCopy={onCopy} controls={controls} />
		</div>
	)
}
