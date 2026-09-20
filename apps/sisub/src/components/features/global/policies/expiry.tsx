import { CalendarClock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatExpiry, fromDatetimeLocalValue, toDatetimeLocalValue } from "@/lib/grant-expiry"

/**
 * Prazo de uma concessão, na interface — o campo e a célula.
 *
 * Um único par de componentes para os três lugares que dão prazo (grant inline, anexo de
 * política, turma de treino): as três telas fazem a MESMA pergunta, e escrever a conversão
 * de fuso três vezes é como as telas divergem.
 *
 * O `expired` NUNCA é calculado aqui. Ele vem da linha, comparado pelo `now()` do banco na
 * mesma query que resolve o acesso — o relógio do navegador pode estar em qualquer lugar, e
 * uma tela que discorda da autorização é pior que uma tela sem a informação.
 */

/** Campo opcional de prazo. Vazio = sem prazo, que é o default de toda concessão. */
export function ExpiryField({ value, onChange, disabled }: { value: string; onChange: (next: string) => void; disabled?: boolean }) {
	return (
		<>
			<Input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="w-full" />
			<p className="mt-1 text-xs text-muted-foreground">
				{value ? "A concessão deixa de valer nesta data e hora." : "Sem prazo — a concessão vale até ser removida."}
			</p>
		</>
	)
}

/**
 * Prazo numa listagem. Vencida ganha badge e data esmaecida: expirado tem que ser
 * distinguível de ativo à primeira vista, sem virar mais uma linha "normal" da tabela.
 */
export function ExpiryCell({ expiresAt, expired }: { expiresAt: string | null; expired: boolean }) {
	if (!expiresAt) return <span className="text-muted-foreground">Sem prazo</span>
	if (expired) {
		return (
			<span className="inline-flex items-center gap-2">
				<Badge variant="destructive" className="gap-1">
					<CalendarClock className="size-3" />
					Expirada
				</Badge>
				<span className="text-xs text-muted-foreground line-through">{formatExpiry(expiresAt)}</span>
			</span>
		)
	}
	return <span className="text-sm">até {formatExpiry(expiresAt)}</span>
}

export { formatExpiry, fromDatetimeLocalValue, toDatetimeLocalValue }
