/**
 * Prazo de acesso: o campo de edição e a célula de exibição.
 *
 * Uma peça só para as três telas que concedem acesso (grant inline, anexo de política e
 * turma de treino). Elas mostravam "desde quando" e nunca "até quando"; agora mostram os
 * dois, e a resposta a "isso ainda vale?" precisa ser idêntica nas três.
 *
 * O estado vencido é marcado por BADGE, nunca por faixa colorida de acento na lateral da
 * linha — a proibição global do repositório.
 */

import { CalendarClock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatExpiry } from "@/lib/access-expiry"

/**
 * Prazo de uma concessão numa listagem.
 *
 * `expired` vem do SERVIDOR (comparado com o `now()` do Postgres). Recalcular aqui com
 * `new Date()` faria a tela discordar do guard quando o relógio do browser estivesse
 * torto — exatamente a confusão que esta coluna existe para evitar.
 */
export function ExpiryCell({ expiresAt, expired }: { expiresAt: string | null; expired: boolean }) {
	if (!expiresAt) return <span className="text-muted-foreground">Sem prazo</span>
	if (expired) {
		return (
			<Badge variant="destructive" className="gap-1">
				<CalendarClock />
				Expirou em {formatExpiry(expiresAt)}
			</Badge>
		)
	}
	return (
		<Badge variant="warning" className="gap-1">
			<CalendarClock />
			Até {formatExpiry(expiresAt)}
		</Badge>
	)
}

/**
 * Campo de prazo. Sempre OPCIONAL: vazio = sem prazo, que é o comportamento de tudo que
 * já existe.
 *
 * `type="date"` e não um datetime: quem concede acesso pensa em dia, e o fim do dia
 * escolhido é resolvido em `expiryFromDateInput`.
 */
export function ExpiryField({
	value,
	onChange,
	label = "Expira em",
	hint = "Opcional. Vazio = acesso sem prazo. O acesso vale até o fim do dia escolhido.",
	id = "access-expiry",
}: {
	value: string
	onChange: (value: string) => void
	/** `null` quando a tela já rotula o campo por fora — um `<label>` vazio confunde o leitor de tela. */
	label?: string | null
	hint?: string
	id?: string
}) {
	return (
		<div className="space-y-1.5">
			{label ? (
				<Label htmlFor={id} className="text-sm">
					{label}
				</Label>
			) : null}
			<Input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} className="w-full" />
			<p className="text-xs text-muted-foreground">{hint}</p>
		</div>
	)
}
