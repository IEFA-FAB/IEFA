import { Check, CircleAlert, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export type AutoSaveState = "idle" | "saving" | "saved" | "error"

interface AutoSaveStatusProps {
	status: AutoSaveState
	/** Quando a última gravação terminou — vira "Salvo às 14:32". */
	savedAt?: number | null
	onRetry?: () => void
}

/**
 * Estado do salvamento automático, no lugar do botão Salvar das telas que gravam sozinhas
 * (ver `docs/SAVE_BEHAVIOR.md`). Substitui o toast de sucesso a cada gravação: numa tela
 * que salva a cada alteração, o toast vira ruído — o erro continua avisando.
 */
export function AutoSaveStatus({ status, savedAt, onRetry }: AutoSaveStatusProps) {
	if (status === "idle") return null
	return (
		<span role="status" aria-live="polite" className="flex items-center gap-1 text-caption text-muted-foreground">
			{status === "saving" && (
				<>
					<Loader2 className="size-3 animate-spin" />
					Salvando…
				</>
			)}
			{status === "saved" && (
				<>
					<Check className="size-3 text-success" />
					{savedAt ? `Salvo às ${new Date(savedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Salvo"}
				</>
			)}
			{status === "error" && (
				<>
					<CircleAlert className="size-3 text-destructive" />
					<span className="text-destructive">Não salvou</span>
					{onRetry && (
						<Button type="button" variant="link" size="xs" onClick={onRetry}>
							Tentar de novo
						</Button>
					)}
				</>
			)}
		</span>
	)
}

/** Estado de um `useMutation` no vocabulário do `AutoSaveStatus`. */
export function autoSaveStateOf(mutation: { isPending: boolean; isSuccess: boolean; isError: boolean }): AutoSaveState {
	if (mutation.isPending) return "saving"
	if (mutation.isError) return "error"
	if (mutation.isSuccess) return "saved"
	return "idle"
}
