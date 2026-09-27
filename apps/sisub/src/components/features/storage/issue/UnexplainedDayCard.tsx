import { AlertTriangle, Loader2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { explainIssueRequestFn } from "@/server/issue.fn"

interface UnexplainedDayCardProps {
	requestId: string
	autoClosedAt: string | null
	explainedAt: string | null
	explanation: string | null
	onDone: () => void
}

/**
 * O dia que fechou sozinho (fechamento automático às 03h do dia seguinte) com desvio sem motivo.
 * Não é punição: é a pendência ficar visível. A justificativa não reabre o dia nem muda a
 * variância julgada; registra o porquê, com quem e quando.
 */
export function UnexplainedDayCard({ requestId, autoClosedAt, explainedAt, explanation, onDone }: UnexplainedDayCardProps) {
	const [text, setText] = useState("")
	const [busy, setBusy] = useState(false)

	if (explainedAt) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Justificativa registrada</CardTitle>
					<CardDescription>{explanation}</CardDescription>
				</CardHeader>
			</Card>
		)
	}

	async function save() {
		setBusy(true)
		try {
			await explainIssueRequestFn({ data: { requestId, explanation: text.trim() } })
			toast.success("Justificativa registrada")
			setText("")
			onDone()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro ao registrar a justificativa")
		} finally {
			setBusy(false)
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<span className="flex items-center gap-2">
						<AlertTriangle className="size-4 text-warning" aria-hidden="true" />
						Fechou sozinho, com desvio sem motivo
					</span>
				</CardTitle>
				<CardDescription>
					Ninguém fechou este dia
					{autoClosedAt ? ` — o sistema fechou em ${new Date(autoClosedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}. Os desvios acima
					da tolerância ficaram sem motivo. Registre o que aconteceu; a saída que faltou lançar entra em "Lançar saída de outro dia".
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-2">
				<Field>
					<FieldLabel htmlFor={`explain-${requestId}`}>Justificativa</FieldLabel>
					<Textarea
						id={`explain-${requestId}`}
						value={text}
						onChange={(event) => setText(event.target.value)}
						placeholder="Ex.: efetivo do jantar caiu pela metade; a sobra voltou fechada na sexta"
						maxLength={500}
					/>
					<FieldDescription>Fica no documento do dia, com o seu nome e a hora.</FieldDescription>
				</Field>
				<div className="flex justify-end">
					<Button type="button" disabled={busy || text.trim().length < 5} onClick={save}>
						{busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
						Registrar justificativa
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}
