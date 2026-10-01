import { ShieldQuestion, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemMedia, ItemTitle } from "@/components/ui/item"
import { useChatActionDescription } from "@/hooks/data/useModuleChatHistory"
import type { ChatActionDescription } from "@/lib/module-chat/describe-action"
import type { ChatModule, ToolCall } from "@/types/domain/module-chat"
import { getActionLabel, getActionWarning, parseToolArguments } from "./tool-action-labels"

export const DESCRIPTION_UNAVAILABLE = "Não foi possível descrever o item."

/**
 * Argumento que a tool recusaria. Confirmar continua possível de propósito: a decisão fecha a
 * pendência do turno, e a tool, ao rodar, recusa com esta mesma mensagem sem gravar nada.
 */
export const INVALID_ARGS_HINT = "A ferramenta vai recusar esta chamada: confirmar não grava nada, só devolve o erro ao assistente."

// ── View (sem dados) ────────────────────────────────────────────────────────

export interface ToolApprovalCardViewProps {
	/** Ação no imperativo: "Remover item do cardápio". */
	label: string
	/** `loading` enquanto o servidor descreve a entidade. */
	description: ChatActionDescription | "loading"
	warning: string | null
	onConfirm: () => void
	onDeny: () => void
	/** Sem handler de decisão (ex.: tela só de leitura), os botões ficam desligados. */
	disabled?: boolean
}

/**
 * Cartão de Confirmar/Recusar de uma ação de escrita do assistente. Mostra a ação e a entidade
 * por nome, data e refeição — nunca o UUID que o modelo mandou. Sem descrição, diz que não foi
 * possível descrever e ainda deixa decidir: recusar é sempre seguro. Com argumento que a tool
 * recusaria, mostra a recusa; confirmar ali só leva ao erro da tool.
 */
export function ToolApprovalCardView({ label, description, warning, onConfirm, onDeny, disabled }: ToolApprovalCardViewProps) {
	return (
		<Item variant="outline" size="sm" role="group" aria-label={`Ação aguardando confirmação: ${label}`}>
			<ItemMedia variant="icon">
				<ShieldQuestion className="text-muted-foreground" />
			</ItemMedia>
			<ItemContent>
				<ItemTitle>{label}</ItemTitle>
				{description === "loading" ? (
					<ItemDescription>Carregando o que será alterado…</ItemDescription>
				) : description.status === "described" ? (
					<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
						{description.details.map((detail) => (
							<div key={detail.label} className="contents">
								<dt className="text-caption text-muted-foreground">{detail.label}</dt>
								<dd className="text-caption text-foreground">{detail.value}</dd>
							</div>
						))}
					</dl>
				) : description.status === "invalid" ? (
					<>
						<ItemDescription>Argumentos inválidos: {description.message}</ItemDescription>
						<ItemDescription>{INVALID_ARGS_HINT}</ItemDescription>
					</>
				) : (
					<ItemDescription>{DESCRIPTION_UNAVAILABLE}</ItemDescription>
				)}
				{warning && (
					<p className="flex items-start gap-1.5 text-caption text-warning">
						<TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
						{warning}
					</p>
				)}
			</ItemContent>
			<ItemFooter>
				<span className="text-hint text-muted-foreground">Nada é gravado antes da sua confirmação.</span>
				<ItemActions>
					<Button size="sm" variant="outline" onClick={onDeny} disabled={disabled}>
						Recusar
					</Button>
					<Button size="sm" onClick={onConfirm} disabled={disabled}>
						Confirmar
					</Button>
				</ItemActions>
			</ItemFooter>
		</Item>
	)
}

// ── Container ───────────────────────────────────────────────────────────────

export interface ToolApprovalContext {
	module: ChatModule
	scopeId?: number
	onDecide: (approvalId: string, approved: boolean) => void
}

interface ToolApprovalCardProps {
	toolCall: ToolCall
	approval: ToolApprovalContext | undefined
}

export function ToolApprovalCard({ toolCall, approval }: ToolApprovalCardProps) {
	const args = parseToolArguments(toolCall.arguments)
	const { data, isPending, isError } = useChatActionDescription({
		module: approval?.module ?? "global",
		scopeId: approval?.scopeId,
		toolCallId: toolCall.id,
		toolName: toolCall.name,
		args,
		enabled: approval !== undefined,
	})

	const description: ChatActionDescription | "loading" =
		args === null || isError ? { status: "unavailable" } : isPending ? "loading" : (data ?? { status: "unavailable" })
	const approvalId = toolCall.approvalId
	const canDecide = approval !== undefined && approvalId !== undefined

	return (
		<ToolApprovalCardView
			label={getActionLabel(toolCall.name, args)}
			description={description}
			warning={getActionWarning(toolCall.name, args)}
			disabled={!canDecide}
			onConfirm={() => canDecide && approval.onDecide(approvalId, true)}
			onDeny={() => canDecide && approval.onDecide(approvalId, false)}
		/>
	)
}
